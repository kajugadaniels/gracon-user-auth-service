import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom, timeout } from 'rxjs';
import { AxiosError } from 'axios';
import { PrismaService } from '../../common/prisma/prisma.service';
import { EncryptionService } from '../../common/crypto/encryption.service';
import { S3Service } from '../../common/aws/s3/s3.service';
import {
  EngineVerificationResponse,
  VerificationResult,
} from './interfaces/verification.interface';
import {
  VerificationAlreadyPassedException,
  TooManyVerificationAttemptsException,
  EmailNotVerifiedException,
  EngineUnavailableException,
  ImageUploadFailedException,
} from './exceptions/verification.exceptions';
import { AuthService } from '../auth/auth.service';
import { AuthTokens } from '../auth/interfaces/auth.interface';

// Max attempts allowed within the retry window
const MAX_ATTEMPTS = 3;

// Window duration — attempts reset after this many hours
const ATTEMPT_WINDOW_HOURS = 24;

@Injectable()
export class VerificationService {
  private readonly logger = new Logger(VerificationService.name);
  private readonly engineUrl: string;
  private readonly engineApiKey: string;

  // Engine request timeout — must be longer than Rekognition's own timeout
  private readonly ENGINE_TIMEOUT_MS = 45_000; // 45 seconds

  constructor(
    private readonly prisma: PrismaService,
    private readonly encryption: EncryptionService,
    private readonly s3: S3Service,
    private readonly httpService: HttpService,
    private readonly config: ConfigService,
    private readonly authService: AuthService,
  ) {
    const engineUrl = this.config.get<string>('ENGINE_URL');
    const engineApiKey = this.config.get<string>('ENGINE_API_KEY');
    if (!engineUrl) throw new Error('ENGINE_URL environment variable is not set');
    if (!engineApiKey) throw new Error('ENGINE_API_KEY environment variable is not set');
    this.engineUrl = engineUrl;
    this.engineApiKey = engineApiKey;
  }

  // ─── Main verification flow ───────────────────────────────────────────────

  /**
   * Orchestrates the full ID verification flow:
   * 1. Gate checks (email verified, not already verified, attempts remaining)
   * 2. Document number check (decrypt stored NID, compare)
   * 3. Upload images to S3 temp folder
   * 4. Call FastAPI engine with S3 keys
   * 5. Store result in audit log
   * 6. Clean up S3 images regardless of outcome
   * 7. Update user if passed
   */
  async submitVerification(
    userId: string,
    documentNumber: string,
    idCardFile: Express.Multer.File,
    selfieFile: Express.Multer.File,
    ipAddress: string,
  ): Promise<VerificationResult> {
    // ── Gate 1: Load user with all required relations
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        isVerified: true,
        isActive: true,
        isIdVerified: true,
        verificationAttempts: true,
        citizenIdentity: {
          select: { nidEncrypted: true },
        },
      },
    });

    // ── Gate 2: User must exist
    if (!user) {
      throw new EmailNotVerifiedException();
    }

    // ── Gate 3: Email must be verified first
    if (!user.isVerified || !user.isActive) {
      throw new EmailNotVerifiedException();
    }

    // ── Gate 4: Already passed — idempotent response
    if (user.isIdVerified) {
      throw new VerificationAlreadyPassedException();
    }

    // ── Gate 5: Check attempt count within the time window
    await this.enforceAttemptLimit(userId);

    // ── Step 1: Document number check
    // Decrypt stored NID and compare against what user typed
    // Done here in NestJS — engine never sees the raw NID
    if (!user.citizenIdentity) {
      throw new EmailNotVerifiedException();
    }
    const storedNid = this.encryption.decrypt(
      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-member-access
      user.citizenIdentity.nidEncrypted,
    );
    const documentMatch = storedNid === documentNumber.trim();

    // ── Step 2: Upload both images to S3 temp folder
    let idCardKey: string | null = null;
    let selfieKey: string | null = null;

    try {
      const [idCardUpload, selfieUpload] = await Promise.all([
        this.s3.uploadVerificationImage(userId, 'id-card', idCardFile),
        this.s3.uploadVerificationImage(userId, 'selfie', selfieFile),
      ]);

      idCardKey = idCardUpload.key;
      selfieKey = selfieUpload.key;
    } catch (error) {
      this.logger.error('Image upload failed during verification', error);
      throw new ImageUploadFailedException('images');
    }

    // ── Step 3: Call FastAPI engine
    // Engine receives S3 keys + document match result
    // Images never leave AWS — engine pulls them directly from S3
    let engineResponse: EngineVerificationResponse;

    try {
      engineResponse = await this.callVerificationEngine({
        id_image_key: idCardKey,
        selfie_image_key: selfieKey,
        user_id: userId,
        document_match: documentMatch,
      });
    } catch (error) {
      // Engine failed — clean up images and record the attempt
      await this.cleanupImages(idCardKey, selfieKey);
      await this.recordAttempt({
        userId,
        attemptNumber: await this.getNextAttemptNumber(userId),
        documentMatch,
        faceScore: 0,
        livenessScore: 0,
        compositeScore: 0,
        passed: false,
        failReason: 'Verification service temporarily unavailable',
        ipAddress,
      });
      throw error;
    }

    // ── Step 4: Record attempt in audit log
    const attemptNumber = await this.getNextAttemptNumber(userId);

    await this.recordAttempt({
      userId,
      attemptNumber,
      documentMatch: engineResponse.scores.document_match,
      faceScore: engineResponse.scores.face_similarity,
      livenessScore: engineResponse.scores.liveness_confidence,
      compositeScore: engineResponse.scores.composite_score,
      passed: engineResponse.passed,
      failReason: engineResponse.fail_reason,
      ipAddress,
    });

    // ── Step 5: Clean up temp images immediately — always runs
    await this.cleanupImages(idCardKey, selfieKey);

    // ── Step 6: Activate ID verification if passed
    let upgradedTokens: AuthTokens | undefined;

    if (engineResponse.passed) {
      await this.prisma.user.update({
        where: { id: userId },
        data: {
          isIdVerified: true,
          idVerifiedAt: new Date(),
          verificationAttempts: { increment: 1 },
        },
      });

      // Upgrade the user's limited token to a full token
      upgradedTokens = await this.authService.upgradeToken(
        userId,
        ipAddress,
        'id-verification-upgrade',
      );

      this.logger.log(`ID verification passed for user: ${userId}`);
    } else {
      // Increment attempt counter even on failure
      await this.prisma.user.update({
        where: { id: userId },
        data: {
          verificationAttempts: { increment: 1 },
        },
      });

      this.logger.warn(
        `ID verification failed for user: ${userId} | ` +
          `score: ${engineResponse.scores.composite_score} | ` +
          `reason: ${engineResponse.fail_reason}`,
      );
    }

    // ── Step 7: Build response for frontend
    const attemptsUsed = attemptNumber;
    const attemptsRemaining = Math.max(0, MAX_ATTEMPTS - attemptsUsed);

    return {
      success: true,
      passed: engineResponse.passed,
      compositeScore: engineResponse.scores.composite_score,
      faceScore: engineResponse.scores.face_similarity,
      livenessScore: engineResponse.scores.liveness_confidence,
      documentMatch: engineResponse.scores.document_match,
      message: engineResponse.passed
        ? 'Identity verification successful. You can now log in.'
        : `Verification failed. ${attemptsRemaining} attempt(s) remaining.`,
      failReason: engineResponse.fail_reason,
      attemptsUsed,
      attemptsRemaining,
      upgradedTokens,
    };
  }

  // ─── Status check ─────────────────────────────────────────────────────────

  /**
   * Returns the current verification status for a user.
   * Called by the frontend to determine which step to show.
   */
  async getVerificationStatus(userId: string): Promise<{
    isIdVerified: boolean;
    attemptsUsed: number;
    attemptsRemaining: number;
    canAttempt: boolean;
    lastAttemptAt: Date | null;
  }> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        isIdVerified: true,
        verificationAttempts: true,
        idVerifications: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: { createdAt: true },
        },
      },
    });

    const windowStart = new Date(
      Date.now() - ATTEMPT_WINDOW_HOURS * 60 * 60 * 1000,
    );

    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
    const attemptsInWindow = await this.prisma.idVerification.count({
      where: {
        userId,
        createdAt: { gte: windowStart },
      },
    });

    const attemptsRemaining = Math.max(0, MAX_ATTEMPTS - attemptsInWindow);

    return {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      isIdVerified: user?.isIdVerified ?? false,
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      attemptsUsed: attemptsInWindow,
      attemptsRemaining,
      canAttempt: !(user?.isIdVerified ?? false) && attemptsRemaining > 0,
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      lastAttemptAt: user?.idVerifications[0]?.createdAt ?? null,
    };
  }

  // ─── Private helpers ──────────────────────────────────────────────────────

  /**
   * Checks how many attempts the user has made in the current window.
   * Throws TooManyVerificationAttemptsException if limit is reached.
   */
  private async enforceAttemptLimit(userId: string): Promise<void> {
    const windowStart = new Date(
      Date.now() - ATTEMPT_WINDOW_HOURS * 60 * 60 * 1000,
    );

    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
    const attemptsInWindow = await this.prisma.idVerification.count({
      where: {
        userId,
        createdAt: { gte: windowStart },
      },
    });

    if (attemptsInWindow >= MAX_ATTEMPTS) {
      this.logger.warn(
        `Verification attempt limit reached for user: ${userId}`,
      );
      throw new TooManyVerificationAttemptsException(ATTEMPT_WINDOW_HOURS);
    }
  }

  /**
   * Gets the next attempt number for a user.
   * Used in the audit log — attempt 1, 2, or 3.
   */
  private async getNextAttemptNumber(userId: string): Promise<number> {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
    const count = await this.prisma.idVerification.count({
      where: { userId },
    });
    // eslint-disable-next-line @typescript-eslint/no-unsafe-return
    return count + 1;
  }

  /**
   * Calls the FastAPI engine with S3 keys and document match result.
   * Engine API key sent in header — never in URL or body.
   */
  private async callVerificationEngine(payload: {
    id_image_key: string;
    selfie_image_key: string;
    user_id: string;
    document_match: boolean;
  }): Promise<EngineVerificationResponse> {
    try {
      const response = await firstValueFrom(
        this.httpService
          .post<EngineVerificationResponse>(
            `${this.engineUrl}/api/v1/verify`,
            payload,
            {
              headers: {
                // Internal API key — validates this request is from our gateway
                'X-Engine-API-Key': this.engineApiKey,
                'Content-Type': 'application/json',
              },
            },
          )
          .pipe(timeout(this.ENGINE_TIMEOUT_MS)),
      );

      return response.data;
    } catch (error) {
      if (error instanceof AxiosError) {
        this.logger.error(
          `Engine call failed: ${error.response?.status} — ${error.message}`,
        );
      } else {
        this.logger.error(
          'Engine call failed — timeout or network error',
          error,
        );
      }
      throw new EngineUnavailableException();
    }
  }

  /**
   * Writes a verification attempt to the audit log.
   * Always called — for both pass and fail outcomes.
   * Errors here are logged but do not affect the user response.
   */
  private async recordAttempt(data: {
    userId: string;
    attemptNumber: number;
    documentMatch: boolean;
    faceScore: number;
    livenessScore: number;
    compositeScore: number;
    passed: boolean;
    failReason: string | null;
    ipAddress: string;
  }): Promise<void> {
    try {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
      await this.prisma.idVerification.create({
        data: {
          userId: data.userId,
          attemptNumber: data.attemptNumber,
          documentMatch: data.documentMatch,
          faceScore: data.faceScore,
          livenessScore: data.livenessScore,
          compositeScore: data.compositeScore,
          passed: data.passed,
          failReason: data.failReason,
          ipAddress: data.ipAddress,
        },
      });
    } catch (error) {
      // Audit log failure must never break the verification flow
      this.logger.error('Failed to record verification attempt', error);
    }
  }

  /**
   * Deletes both temp images from S3 after verification.
   * Called in both success and failure paths — images never linger.
   */
  private async cleanupImages(
    idCardKey: string | null,
    selfieKey: string | null,
  ): Promise<void> {
    const keysToDelete = [idCardKey, selfieKey].filter(Boolean) as string[];

    if (keysToDelete.length > 0) {
      await this.s3.deleteObjects(keysToDelete);
    }
  }
}
