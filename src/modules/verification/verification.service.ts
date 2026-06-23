import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { IdentityType } from '@gracon/database';
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
  VerificationStatusResult,
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
import { SecurityEventService } from '../../common/security/security-event.service';

// Max attempts allowed within the retry window
const MAX_ATTEMPTS = 3;

// Default window duration; deployments may override or disable it with env.
const DEFAULT_ATTEMPT_WINDOW_HOURS = 24;

interface VerificationWindowState {
  attemptsUsed: number;
  attemptsRemaining: number;
  retryAvailableAt: Date | null;
  retryAfterSeconds: number | null;
}

@Injectable()
export class VerificationService {
  private readonly logger = new Logger(VerificationService.name);
  private readonly engineUrl: string;
  private readonly engineApiKey: string;
  private readonly attemptWindowHours: number;

  // Engine request timeout — must be longer than Rekognition's own timeout
  private readonly ENGINE_TIMEOUT_MS = 45_000; // 45 seconds

  constructor(
    private readonly prisma: PrismaService,
    private readonly encryption: EncryptionService,
    private readonly s3: S3Service,
    private readonly httpService: HttpService,
    private readonly config: ConfigService,
    private readonly authService: AuthService,
    private readonly secEvent: SecurityEventService,
  ) {
    const engineUrl = this.config.get<string>('ENGINE_URL');
    const engineApiKey = this.config.get<string>('ENGINE_API_KEY');
    if (!engineUrl)
      throw new Error('ENGINE_URL environment variable is not set');
    if (!engineApiKey)
      throw new Error('ENGINE_API_KEY environment variable is not set');
    this.engineUrl = engineUrl;
    this.engineApiKey = engineApiKey;
    this.attemptWindowHours = this.config.get<number>(
      'VERIFICATION_ATTEMPT_WINDOW_HOURS',
      DEFAULT_ATTEMPT_WINDOW_HOURS,
    );
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
    challengeMode: 'STANDARD' | 'INVITATION' = 'STANDARD',
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
          select: {
            identityType: true,
            nidEncrypted: true,
            surName: true,
            postNames: true,
            dateOfBirth: true,
          },
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

    if (user.citizenIdentity?.identityType === IdentityType.FIN) {
      throw new BadRequestException(
        'Biometric verification is not required for foreign identity users.',
      );
    }

    // ── Gate 4: Already passed — idempotent response
    if (user.isIdVerified && challengeMode !== 'INVITATION') {
      throw new VerificationAlreadyPassedException();
    }

    // ── Gate 5: Check attempt count within the time window.
    // Returns the windowed count so the response can report accurate
    // attemptsUsed / attemptsRemaining without a second DB query.
    await this.enforceAttemptLimit(userId);

    // ── Step 1: Document number check
    // Decrypt stored NID and compare against what user typed
    // Done here in NestJS — engine never sees the raw NID
    if (!user.citizenIdentity) {
      throw new EmailNotVerifiedException();
    }
    if (!user.citizenIdentity.nidEncrypted) {
      throw new InternalServerErrorException(
        'Stored National ID data is incomplete for verification.',
      );
    }
    const storedNid = this.encryption.decrypt(
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
    const isInvitationChallenge = challengeMode === 'INVITATION';
    const wasAlreadyVerified = user.isIdVerified;

    if (engineResponse.passed) {
      if (wasAlreadyVerified) {
        await this.prisma.user.update({
          where: { id: userId },
          data: {
            verificationAttempts: { increment: 1 },
          },
        });
      } else {
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
      }

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

    // In submitVerification() — after recording the attempt:
    if (engineResponse.passed) {
      void this.secEvent.logVerificationPassed({
        userId,
        ipAddress,
        metadata: {
          compositeScore: engineResponse.scores.composite_score,
          attemptNumber,
        },
      });
    } else {
      void this.secEvent.logVerificationFailed({
        userId,
        ipAddress,
        metadata: {
          compositeScore: engineResponse.scores.composite_score,
          failReason: engineResponse.fail_reason,
          attemptNumber,
        },
      });
    }

    // ── Step 7: Build response for frontend
    //
    // Use the windowed count returned by enforceAttemptLimit (before this
    // attempt) + 1 for the response. Using the cumulative attemptNumber here
    // would report the wrong remaining count for users who have retried after
    // the configured attempt window: a user with 3 total all-time attempts
    // would see "0 remaining" after the window even though the gate already
    // let them through.
    const windowState = await this.getVerificationWindowState(userId);
    const attemptsUsed = windowState.attemptsUsed;
    const attemptsRemaining = windowState.attemptsRemaining;

    // Build identity summary from citizen record for the result screen
    const idInfo = user.citizenIdentity
      ? {
          fullName:
            `${user.citizenIdentity.surName} ${user.citizenIdentity.postNames}`.trim(),
          dateOfBirth: user.citizenIdentity.dateOfBirth.toISOString(),
          documentNumber,
        }
      : undefined;

    return {
      success: true,
      passed: engineResponse.passed,
      compositeScore: engineResponse.scores.composite_score,
      faceScore: engineResponse.scores.face_similarity,
      livenessScore: engineResponse.scores.liveness_confidence,
      documentMatch: engineResponse.scores.document_match,
      message: engineResponse.passed
        ? isInvitationChallenge
          ? 'Identity verification successful. You can return to the invitation.'
          : 'Identity verification successful. You can now log in.'
        : this.isAttemptWindowEnabled()
          ? `Verification failed. ${attemptsRemaining} attempt(s) remaining.`
          : 'Verification failed. You can try again.',
      failReason: engineResponse.fail_reason,
      attemptsUsed,
      attemptsRemaining,
      lockout: {
        maxAttempts: MAX_ATTEMPTS,
        attemptWindowHours: this.attemptWindowHours,
        attemptLimitEnabled: this.isAttemptWindowEnabled(),
        retryAvailableAt: windowState.retryAvailableAt?.toISOString() ?? null,
        retryAfterSeconds: windowState.retryAfterSeconds,
      },
      idInfo,
      upgradedTokens,
      challengeMode,
    };
  }

  // ─── Status check ─────────────────────────────────────────────────────────

  /**
   * Returns the current verification status for a user.
   * Called by the frontend to determine which step to show.
   */
  async getVerificationStatus(
    userId: string,
  ): Promise<VerificationStatusResult> {
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

    const windowState = await this.getVerificationWindowState(userId);

    return {
      isIdVerified: user?.isIdVerified ?? false,
      attemptsUsed: windowState.attemptsUsed,
      attemptsRemaining: windowState.attemptsRemaining,
      canAttempt:
        !(user?.isIdVerified ?? false) && windowState.attemptsRemaining > 0,
      lastAttemptAt: user?.idVerifications[0]?.createdAt?.toISOString() ?? null,
      lockout: {
        maxAttempts: MAX_ATTEMPTS,
        attemptWindowHours: this.attemptWindowHours,
        attemptLimitEnabled: this.isAttemptWindowEnabled(),
        retryAvailableAt: windowState.retryAvailableAt?.toISOString() ?? null,
        retryAfterSeconds: windowState.retryAfterSeconds,
      },
    };
  }

  // ─── Private helpers ──────────────────────────────────────────────────────

  /**
   * Counts attempts in the configured attempt window and throws if the limit
   * is reached. Returns the count so the caller can report accurate
   * attemptsUsed / attemptsRemaining in the response without a second query.
   *
   * The gate deliberately uses the windowed idVerification count — not the
   * cumulative verificationAttempts field on User. The cumulative counter
   * exists for admin visibility only and must never be used as a gate,
   * otherwise a user who exhausts their 3 attempts in one window is
   * permanently locked even after the window expires.
   */
  private async enforceAttemptLimit(userId: string): Promise<number> {
    if (!this.isAttemptWindowEnabled()) {
      return 0;
    }

    const windowState = await this.getVerificationWindowState(userId);

    if (windowState.attemptsUsed >= MAX_ATTEMPTS) {
      this.logger.warn(
        `Verification attempt limit reached for user: ${userId}`,
      );
      throw new TooManyVerificationAttemptsException(
        this.attemptWindowHours,
        windowState.retryAvailableAt,
        windowState.retryAfterSeconds,
      );
    }

    return windowState.attemptsUsed;
  }

  private async getVerificationWindowState(
    userId: string,
  ): Promise<VerificationWindowState> {
    if (!this.isAttemptWindowEnabled()) {
      return {
        attemptsUsed: 0,
        attemptsRemaining: MAX_ATTEMPTS,
        retryAvailableAt: null,
        retryAfterSeconds: null,
      };
    }

    const windowStart = new Date(
      Date.now() - this.attemptWindowHours * 60 * 60 * 1000,
    );

    const attempts = await this.prisma.idVerification.findMany({
      where: {
        userId,
        createdAt: { gte: windowStart },
      },
      orderBy: { createdAt: 'asc' },
      select: { createdAt: true },
    });

    const attemptsUsed = attempts.length;
    const attemptsRemaining = Math.max(0, MAX_ATTEMPTS - attemptsUsed);
    const retryAvailableAt =
      attemptsUsed >= MAX_ATTEMPTS
        ? new Date(
            attempts[0].createdAt.getTime() +
              this.attemptWindowHours * 60 * 60 * 1000,
          )
        : null;
    const retryAfterSeconds = retryAvailableAt
      ? Math.max(Math.ceil((retryAvailableAt.getTime() - Date.now()) / 1000), 0)
      : null;

    return {
      attemptsUsed,
      attemptsRemaining,
      retryAvailableAt,
      retryAfterSeconds,
    };
  }

  /**
   * Returns whether the business-level attempt window is active.
   * A value of 0 is intentionally supported for local development and
   * controlled testing where repeated engine checks are expected.
   */
  private isAttemptWindowEnabled(): boolean {
    return this.attemptWindowHours > 0;
  }

  /**
   * Gets the next attempt number for a user.
   * Used in the audit log — attempt 1, 2, or 3.
   */
  private async getNextAttemptNumber(userId: string): Promise<number> {
    const count = await this.prisma.idVerification.count({
      where: { userId },
    });

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
