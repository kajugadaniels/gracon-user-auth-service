import {
  Injectable,
  Logger,
  ConflictException,
  BadRequestException,
  InternalServerErrorException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { PrismaService } from '../../common/prisma/prisma.service';
import { EncryptionService } from '../../common/crypto/encryption.service';
import { PidService } from '../../common/pid/pid.service';
import { CitizenService } from '../citizen/citizen.service';
import { AppMailerService } from '../../common/mailer/mailer.service';
import { RegisterDto } from './dto/register.dto';
import { VerifyEmailDto } from './dto/verify-email.dto';
import { ResendVerificationDto } from './dto/resend-verification.dto';
import { RegistrationResult } from './interfaces/registration-result.interface';

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  // bcrypt cost factor — 12 is strong without being too slow
  // each increment doubles the time: 10=~100ms, 12=~400ms, 14=~1.5s
  private readonly BCRYPT_ROUNDS = 12;

  // Verification token expiry — 24 hours in milliseconds
  private readonly TOKEN_EXPIRY_MS = 24 * 60 * 60 * 1000;

  // Max resend attempts per hour to prevent email spam abuse
  private readonly MAX_RESEND_PER_HOUR = 3;

  constructor(
    private readonly prisma: PrismaService,
    private readonly encryption: EncryptionService,
    private readonly pidService: PidService,
    private readonly citizenService: CitizenService,
    private readonly mailer: AppMailerService,
  ) {}

  // ─── Registration ─────────────────────────────────────────────────────────

  async register(dto: RegisterDto): Promise<RegistrationResult> {
    // ── Step 1: Validate NID format and fetch citizen data from national API
    const citizenData = await this.citizenService.lookupCitizen(
      dto.documentNumber,
    );

    // ── Step 2: Check email is not already registered
    const existingEmail = await this.prisma.user.findUnique({
      where: { email: dto.email },
      select: { id: true }, // only fetch id — we don't need more
    });

    if (existingEmail) {
      throw new ConflictException(
        'An account with this email address already exists',
      );
    }

    // ── Step 3: Check NID is not already registered
    // We can't query encrypted NID directly — hash the NID and check against
    // all stored hashes. PID hash approach — we hash NID for lookup too
    const nidHash = this.encryption.hash(dto.documentNumber);
    const existingNid = await this.prisma.citizenIdentity.findFirst({
      where: { nidHash }, // nidHash column added for lookup — see schema update below
      select: { id: true },
    });

    if (existingNid) {
      throw new ConflictException(
        'An account with this National ID is already registered',
      );
    }

    // ── Step 4: Hash the password — never store plain text
    const passwordHash = await bcrypt.hash(dto.password, this.BCRYPT_ROUNDS);

    // ── Step 5: Encrypt the NID — stored as AES-256-CBC ciphertext
    const nidEncrypted = this.encryption.encrypt(dto.documentNumber);

    // ── Step 6: Generate Platform ID and encrypt it
    const rawPid = this.pidService.generate(citizenData.dateOfBirth);
    const pidEncrypted = this.encryption.encrypt(rawPid);
    const pidHash = this.encryption.hash(rawPid); // for uniqueness check and lookup

    // ── Step 7: Generate email verification token
    // Raw token goes in the email — hashed token goes in the database
    const rawToken = crypto.randomBytes(32).toString('hex'); // 64-char hex string
    const tokenHash = this.encryption.hash(rawToken);
    const tokenExpiry = new Date(Date.now() + this.TOKEN_EXPIRY_MS);

    // ── Step 8: Persist everything atomically in a Prisma transaction
    // If ANY step fails, ALL changes are rolled back — no partial data
    let createdUser: { id: string; email: string };

    try {
      const result = await this.prisma.$transaction(async (tx) => {
        // Create the user record
        const user = await tx.user.create({
          data: {
            email: dto.email,
            phoneNumber: dto.phoneNumber ?? null,
            passwordHash,
            isVerified: false, // requires email confirmation
            isActive: false, // activated only after email is verified
          },
          select: { id: true, email: true },
        });

        // Store encrypted NID with a hash for future lookups
        await tx.citizenIdentity.create({
          data: {
            userId: user.id,
            nidEncrypted,
            nidHash, // SHA-256 of raw NID — for duplicate checks
            surName: citizenData.surName,
            postNames: citizenData.postNames,
            sex: citizenData.sex,
            dateOfBirth: citizenData.dateOfBirth,
            countryOfBirth: citizenData.countryOfBirth,
          },
        });

        // Store encrypted PID with hash for lookups
        await tx.platformId.create({
          data: {
            userId: user.id,
            pidEncrypted,
            pidHash,
          },
        });

        // Store hashed verification token — raw token only exists in the email
        await tx.emailVerificationToken.create({
          data: {
            userId: user.id,
            tokenHash,
            expiresAt: tokenExpiry,
            used: false,
          },
        });

        return user;
      });

      createdUser = result;
    } catch (error) {
      // Prisma unique constraint violation — race condition safety
      if (typeof error === 'object' && error !== null && (error as Record<string, unknown>)['code'] === 'P2002') {
        throw new ConflictException(
          'An account with this email or National ID already exists',
        );
      }

      this.logger.error('Registration transaction failed', error);
      throw new InternalServerErrorException(
        'Registration failed. Please try again.',
      );
    }

    // ── Step 9: Send verification email (outside transaction — non-blocking)
    await this.mailer.sendVerificationEmail({
      to: createdUser.email,
      surName: citizenData.surName,
      postNames: citizenData.postNames,
      userId: createdUser.id,
      token: rawToken, // raw token in the email link
    });

    this.logger.log(`User registered: ${createdUser.id}`);

    // ── Step 10: Return safe response — never include sensitive data
    return {
      success: true,
      message:
        'Registration successful. Please check your email to verify your account.',
      data: {
        userId: createdUser.id,
        email: createdUser.email,
        surName: citizenData.surName,
        postNames: citizenData.postNames,
        platformId: rawPid, // shown once at registration — not stored in plain text
      },
    };
  }

  // ─── Email Verification ───────────────────────────────────────────────────

  async verifyEmail(
    dto: VerifyEmailDto,
  ): Promise<{ success: boolean; message: string }> {
    // Find the token record for this user
    const tokenRecord = await this.prisma.emailVerificationToken.findUnique({
      where: { userId: dto.userId },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            isVerified: true,
            citizenIdentity: {
              select: { surName: true, postNames: true },
            },
            platformId: {
              select: { pidEncrypted: true },
            },
          },
        },
      },
    });

    // No token found — invalid link
    if (!tokenRecord) {
      throw new BadRequestException('Invalid or expired verification link');
    }

    // Already verified — idempotent response
    if (tokenRecord.user.isVerified) {
      return {
        success: true,
        message: 'Email already verified. You can log in.',
      };
    }

    // Token already used
    if (tokenRecord.used) {
      throw new BadRequestException(
        'This verification link has already been used. Please request a new one.',
      );
    }

    // Token expired
    if (new Date() > tokenRecord.expiresAt) {
      throw new BadRequestException(
        'This verification link has expired. Please request a new one.',
      );
    }

    // Verify the token — compare hash of provided token against stored hash
    const isValid = this.encryption.compareHash(
      dto.token,
      tokenRecord.tokenHash,
    );

    if (!isValid) {
      throw new BadRequestException('Invalid verification link');
    }

    // All checks passed — activate the account atomically
    await this.prisma.$transaction(async (tx) => {
      // Activate the user account
      await tx.user.update({
        where: { id: dto.userId },
        data: {
          isVerified: true,
          isActive: true,
        },
      });

      // Mark token as used — prevents replay attacks
      await tx.emailVerificationToken.update({
        where: { id: tokenRecord.id },
        data: { used: true },
      });
    });

    // Decrypt PID to include in welcome email — only decrypted in memory
    const rawPid = tokenRecord.user.platformId
      ? this.encryption.decrypt(tokenRecord.user.platformId.pidEncrypted)
      : '';

    // Send welcome email with their Platform ID
    await this.mailer.sendWelcomeEmail({
      to: tokenRecord.user.email,
      surName: tokenRecord.user.citizenIdentity?.surName ?? '',
      postNames: tokenRecord.user.citizenIdentity?.postNames ?? '',
      platformId: rawPid,
    });

    this.logger.log(`Email verified and account activated: ${dto.userId}`);

    return {
      success: true,
      message: 'Email verified successfully. Your account is now active.',
    };
  }

  // ─── Resend Verification Email ────────────────────────────────────────────

  async resendVerificationEmail(
    dto: ResendVerificationDto,
  ): Promise<{ success: boolean; message: string }> {
    // Find user — use vague message to prevent user enumeration attacks
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
      include: {
        citizenIdentity: { select: { surName: true, postNames: true } },
        emailVerificationToken: true,
      },
    });

    // Vague response — attacker can't determine if email is registered
    const safeResponse = {
      success: true,
      message:
        'If this email is registered and unverified, a new verification email has been sent.',
    };

    if (!user || user.isVerified) {
      return safeResponse;
    }

    // Rate limiting — prevent email spam abuse
    // Check if a token was created in the last hour
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    const recentTokenCount = await this.prisma.emailVerificationToken.count({
      where: {
        userId: user.id,
        createdAt: { gte: oneHourAgo },
      },
    });

    if (recentTokenCount >= this.MAX_RESEND_PER_HOUR) {
      // Return same vague response — don't reveal rate limiting details
      return safeResponse;
    }

    // Generate a new token
    const rawToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = this.encryption.hash(rawToken);
    const tokenExpiry = new Date(Date.now() + this.TOKEN_EXPIRY_MS);

    // Replace existing token with new one
    await this.prisma.emailVerificationToken.upsert({
      where: { userId: user.id },
      create: {
        userId: user.id,
        tokenHash,
        expiresAt: tokenExpiry,
        used: false,
      },
      update: {
        tokenHash,
        expiresAt: tokenExpiry,
        used: false,
        createdAt: new Date(), // reset for rate limiting
      },
    });

    await this.mailer.sendVerificationEmail({
      to: user.email,
      surName: user.citizenIdentity?.surName ?? '',
      postNames: user.citizenIdentity?.postNames ?? '',
      userId: user.id,
      token: rawToken,
    });

    return safeResponse;
  }

  // ─── Internal helpers ─────────────────────────────────────────────────────

  // Used by AuthService to find a user by email for login
  async findByEmail(email: string) {
    return this.prisma.user.findUnique({
      where: { email },
      select: {
        id: true,
        email: true,
        passwordHash: true,
        isVerified: true,
        isActive: true,
        isIdVerified: true,
        idVerifiedAt: true,
        createdAt: true,
        imageUrl: true,
        phoneNumber: true,
        citizenIdentity: {
          select: {
            surName: true,
            postNames: true,
            sex: true,
            dateOfBirth: true,
            countryOfBirth: true,
          },
        },
        platformId: {
          select: { pidEncrypted: true },
        },
      },
    });
  }

  // Used by JWT strategy to find a user by id for token validation
  async findById(id: string) {
    return this.prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        email: true,
        isVerified: true,
        isActive: true,
        imageUrl: true,
        phoneNumber: true,
      },
    });
  }
}
