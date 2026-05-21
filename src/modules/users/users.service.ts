import {
  Injectable,
  Logger,
  ConflictException,
  BadRequestException,
  InternalServerErrorException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { IdentityType, UserInviteVerificationPreference } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { EncryptionService } from '../../common/crypto/encryption.service';
import { S3Service } from '../../common/aws/s3/s3.service';
import { PidService } from '../../common/pid/pid.service';
import { CitizenService } from '../citizen/citizen.service';
import { AppMailerService } from '../../common/mailer/mailer.service';
import { ForeignIdentityClient } from '../foreign-identity/foreign-identity.client';
import { RegisterDto } from './dto/register.dto';
import { VerifyEmailDto } from './dto/verify-email.dto';
import { ResendVerificationDto } from './dto/resend-verification.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import {
  UpdateUserPreferencesDto,
  UserInviteVerificationPreferenceDtoValue,
  UserPreferencesResponseDto,
} from './dto/user-preferences.dto';
import { RegistrationResult } from './interfaces/registration-result.interface';
import { SecurityEventService } from '../../common/security/security-event.service';
import {
  normalizeUserInviteVerificationPreferences,
  type UserInviteVerificationPreferenceValue,
} from './user-preferences.helper';
import type {
  AuthTokens,
  JwtPayload,
  SafeUserProfile,
} from '../auth/interfaces/auth.interface';

interface RegistrationIdentityRecord {
  identityType: IdentityType;
  identityNumber: string;
  surName: string;
  postNames: string;
  sex: string;
  dateOfBirth: Date;
  countryOfBirth: string;
}

interface UserPreferenceRecord {
  defaultDocumentInviteVerifications: UserInviteVerificationPreference[];
  defaultMeetingInviteVerifications: UserInviteVerificationPreference[];
}

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  // bcrypt cost factor — 12 is strong without being too slow
  // each increment doubles the time: 10=~100ms, 12=~400ms, 14=~1.5s
  private readonly BCRYPT_ROUNDS = 12;

  // Verification token expiry — 24 hours in milliseconds
  private readonly TOKEN_EXPIRY_MS = 24 * 60 * 60 * 1000;
  private readonly LIMITED_ACCESS_TOKEN_EXPIRY = '2h';
  private readonly REFRESH_TOKEN_EXPIRY_MS = 30 * 24 * 60 * 60 * 1000;

  // Max resend attempts per hour to prevent email spam abuse
  private readonly MAX_RESEND_PER_HOUR = 3;

  constructor(
    private readonly prisma: PrismaService,
    private readonly encryption: EncryptionService,
    private readonly s3: S3Service,
    private readonly pidService: PidService,
    private readonly citizenService: CitizenService,
    private readonly foreignIdentityClient: ForeignIdentityClient,
    private readonly mailer: AppMailerService,
    private readonly secEvent: SecurityEventService,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
  ) {}

  // ─── Registration ─────────────────────────────────────────────────────────

  async register(dto: RegisterDto): Promise<RegistrationResult> {
    this.assertExclusiveIdentityInput(dto);

    // ── Step 1: Resolve the source-of-truth identity record
    const identity = await this.resolveRegistrationIdentity(dto);

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

    // ── Step 3: Check the identity number is not already registered
    const identityHash = this.encryption.hash(identity.identityNumber);
    const existingIdentity = await this.prisma.citizenIdentity.findFirst({
      where:
        identity.identityType === IdentityType.NID
          ? { nidHash: identityHash }
          : { finHash: identityHash },
      select: { id: true },
    });

    if (existingIdentity) {
      throw new ConflictException(
        identity.identityType === IdentityType.NID
          ? 'An account with this National ID is already registered'
          : 'An account with this Foreign Identity Number is already registered',
      );
    }

    // ── Step 4: Hash the password — never store plain text
    const passwordHash = await bcrypt.hash(dto.password, this.BCRYPT_ROUNDS);

    // ── Step 5: Encrypt the source identity number
    const identityEncrypted = this.encryption.encrypt(identity.identityNumber);

    // ── Step 6: Generate Platform ID and encrypt it
    const rawPid = this.pidService.generate(identity.dateOfBirth);
    const pidEncrypted = this.encryption.encrypt(rawPid);
    const pidHash = this.encryption.hash(rawPid); // for uniqueness check and lookup

    // ── Step 7: Generate email verification token
    // Raw token goes in the email — hashed token goes in the database
    const rawToken = crypto.randomBytes(32).toString('hex'); // 64-char hex string
    const tokenHash = this.encryption.hash(rawToken);
    const tokenExpiry = new Date(Date.now() + this.TOKEN_EXPIRY_MS);
    const isFinIdentity = identity.identityType === IdentityType.FIN;

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
            isIdVerified: isFinIdentity,
            idVerifiedAt: isFinIdentity ? new Date() : null,
          },
          select: { id: true, email: true },
        });

        // Store the registry-specific identity reference.
        await tx.citizenIdentity.create({
          data: {
            userId: user.id,
            identityType: identity.identityType,
            nidEncrypted: isFinIdentity ? null : identityEncrypted,
            nidHash: isFinIdentity ? null : identityHash,
            finEncrypted: isFinIdentity ? identityEncrypted : null,
            finHash: isFinIdentity ? identityHash : null,
            surName: identity.surName,
            postNames: identity.postNames,
            sex: identity.sex,
            dateOfBirth: identity.dateOfBirth,
            countryOfBirth: identity.countryOfBirth,
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
      if (
        typeof error === 'object' &&
        error !== null &&
        (error as Record<string, unknown>)['code'] === 'P2002'
      ) {
        throw new ConflictException(
          'An account with this email or identity number already exists',
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
      surName: identity.surName,
      postNames: identity.postNames,
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
        surName: identity.surName,
        postNames: identity.postNames,
        platformId: rawPid, // shown once at registration — not stored in plain text
        identityType: identity.identityType,
        fin: isFinIdentity ? identity.identityNumber : null,
      },
    };
  }

  // ─── Email Verification ───────────────────────────────────────────────────

  async verifyEmail(dto: VerifyEmailDto): Promise<{
    success: boolean;
    message: string;
    tokenType?: 'limited';
    data?: {
      accessToken: string;
      refreshToken: string;
      user: SafeUserProfile;
    };
  }> {
    // Find the token record for this user
    const tokenRecord = await this.prisma.emailVerificationToken.findUnique({
      where: { userId: dto.userId },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            phoneNumber: true,
            imageUrl: true,
            isVerified: true,
            isIdVerified: true,
            idVerifiedAt: true,
            createdAt: true,
            citizenIdentity: {
              select: {
                identityType: true,
                finEncrypted: true,
                surName: true,
                postNames: true,
                sex: true,
              },
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

    if (tokenRecord.user.isIdVerified) {
      return {
        success: true,
        message:
          'Email verified successfully. Your account is ready. Please log in.',
      };
    }

    const tokens = await this.generatePostEmailVerificationTokens(
      tokenRecord.user.id,
      tokenRecord.user.email,
    );

    return {
      success: true,
      message:
        'Email verified successfully. Continue with identity verification.',
      tokenType: 'limited',
      data: {
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        user: this.buildVerificationSessionProfile(tokenRecord.user),
      },
    };
  }

  // ─── Resend Verification Email ────────────────────────────────────────────

  async resendVerificationEmail(
    dto: ResendVerificationDto,
  ): Promise<{ success: boolean; message: string }> {
    // Vague response — attacker can't determine if email is registered
    const safeResponse = {
      success: true,
      message:
        'If this email is registered and unverified, a new verification email has been sent.',
    };

    const userLookup = dto.userId
      ? { id: dto.userId }
      : dto.email
        ? { email: dto.email }
        : null;

    if (!userLookup) {
      return safeResponse;
    }

    // Find user — use vague response to prevent user enumeration attacks.
    const user = await this.prisma.user.findUnique({
      where: userLookup,
      include: {
        citizenIdentity: { select: { surName: true, postNames: true } },
        emailVerificationToken: true,
      },
    });

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

  private assertExclusiveIdentityInput(dto: RegisterDto): void {
    if (dto.documentNumber && dto.fin) {
      throw new BadRequestException(
        'Provide either documentNumber or fin, not both in the same request.',
      );
    }

    if (!dto.documentNumber && !dto.fin) {
      throw new BadRequestException(
        'Either documentNumber or fin must be provided for registration.',
      );
    }
  }

  private async resolveRegistrationIdentity(
    dto: RegisterDto,
  ): Promise<RegistrationIdentityRecord> {
    if (dto.fin) {
      return this.resolveForeignRegistrationIdentity(dto.fin);
    }

    return this.resolveCitizenRegistrationIdentity(dto.documentNumber!);
  }

  private async resolveCitizenRegistrationIdentity(
    documentNumber: string,
  ): Promise<RegistrationIdentityRecord> {
    const citizenData = await this.citizenService.lookupCitizen(documentNumber);

    return {
      identityType: IdentityType.NID,
      identityNumber: documentNumber,
      surName: citizenData.surName,
      postNames: citizenData.postNames,
      sex: citizenData.sex,
      dateOfBirth: citizenData.dateOfBirth,
      countryOfBirth: citizenData.countryOfBirth,
    };
  }

  private async resolveForeignRegistrationIdentity(
    fin: string,
  ): Promise<RegistrationIdentityRecord> {
    const foreignIdentity = await this.foreignIdentityClient.getByFin(fin);

    if (!foreignIdentity || !foreignIdentity.isActive) {
      throw new NotFoundException(
        'The provided Foreign Identity Number is not registered or has been deactivated. Contact a platform administrator.',
      );
    }

    const dateOfBirth = new Date(foreignIdentity.dateOfBirth);
    if (Number.isNaN(dateOfBirth.getTime())) {
      throw new InternalServerErrorException(
        'Foreign identity lookup returned an invalid date of birth.',
      );
    }

    return {
      identityType: IdentityType.FIN,
      identityNumber: foreignIdentity.fin,
      surName: foreignIdentity.lastName,
      postNames: foreignIdentity.firstName,
      sex: foreignIdentity.gender,
      dateOfBirth,
      countryOfBirth: foreignIdentity.countryOfOrigin,
    };
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
            identityType: true,
            finEncrypted: true,
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

  // ─── Profile ──────────────────────────────────────────────────────────────

  /**
   * Returns cross-platform invitation defaults for the authenticated user.
   *
   * @param userId - Authenticated user id from the validated JWT.
   * @returns Saved user preferences or secure no-verification defaults when no row exists yet.
   */
  async getPreferences(userId: string): Promise<UserPreferencesResponseDto> {
    const preferences = await this.prisma.userPreference.findUnique({
      where: { userId },
      select: {
        defaultDocumentInviteVerifications: true,
        defaultMeetingInviteVerifications: true,
      },
    });

    return this.formatUserPreferences(preferences);
  }

  /**
   * Updates cross-platform invitation defaults for the authenticated user.
   *
   * @param userId - Authenticated user id from the validated JWT.
   * @param dto - Partial preference replacement submitted by the client.
   * @returns The saved preference values after normalization.
   */
  async updatePreferences(
    userId: string,
    dto: UpdateUserPreferencesDto,
  ): Promise<UserPreferencesResponseDto> {
    const currentPreferences = await this.prisma.userPreference.findUnique({
      where: { userId },
      select: {
        defaultDocumentInviteVerifications: true,
        defaultMeetingInviteVerifications: true,
      },
    });

    const current = this.formatUserPreferences(currentPreferences);
    const defaultDocumentInviteVerifications =
      normalizeUserInviteVerificationPreferences(
        dto.defaultDocumentInviteVerifications ??
          current.defaultDocumentInviteVerifications,
        'Document invitation defaults',
      );
    const defaultMeetingInviteVerifications =
      normalizeUserInviteVerificationPreferences(
        dto.defaultMeetingInviteVerifications ??
          current.defaultMeetingInviteVerifications,
        'Meeting invitation defaults',
      );

    const savedPreferences = await this.prisma.userPreference.upsert({
      where: { userId },
      create: {
        userId,
        defaultDocumentInviteVerifications: this.toPrismaPreferenceValues(
          defaultDocumentInviteVerifications,
        ),
        defaultMeetingInviteVerifications: this.toPrismaPreferenceValues(
          defaultMeetingInviteVerifications,
        ),
      },
      update: {
        defaultDocumentInviteVerifications: this.toPrismaPreferenceValues(
          defaultDocumentInviteVerifications,
        ),
        defaultMeetingInviteVerifications: this.toPrismaPreferenceValues(
          defaultMeetingInviteVerifications,
        ),
      },
      select: {
        defaultDocumentInviteVerifications: true,
        defaultMeetingInviteVerifications: true,
      },
    });

    return this.formatUserPreferences(savedPreferences);
  }

  /**
   * Returns the full safe profile for the authenticated user.
   *
   * - Citizen identity fields (name, DOB, sex, country) are included.
   * - Platform ID is decrypted in-memory and included once; it is never
   *   stored in plain text.
   * - If the user has a profile image, a 1-hour presigned S3 URL is generated
   *   so the browser can display it without exposing the raw S3 key.
   * - passwordHash, nidEncrypted, finEncrypted, and pidEncrypted are never returned.
   */
  async getProfile(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        phoneNumber: true,
        imageUrl: true,
        isVerified: true,
        isActive: true,
        isIdVerified: true,
        idVerifiedAt: true,
        verificationAttempts: true,
        createdAt: true,
        updatedAt: true,
        citizenIdentity: {
          select: {
            identityType: true,
            finEncrypted: true,
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

    if (!user) {
      throw new NotFoundException('User not found');
    }

    // Decrypt Platform ID in-memory — never expose the ciphertext
    const platformId = user.platformId
      ? this.encryption.decrypt(user.platformId.pidEncrypted)
      : null;
    const fin =
      user.citizenIdentity?.identityType === IdentityType.FIN &&
      user.citizenIdentity.finEncrypted
        ? this.encryption.decrypt(user.citizenIdentity.finEncrypted)
        : null;

    const { url: profileImageUrl, expiresAt: profileImageExpiresAt } =
      await this.resolveProfileImageAccess(user.imageUrl);

    return {
      id: user.id,
      email: user.email,
      phoneNumber: user.phoneNumber,
      isVerified: user.isVerified,
      isActive: user.isActive,
      isIdVerified: user.isIdVerified,
      idVerifiedAt: user.idVerifiedAt,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
      platformId,
      identityType: user.citizenIdentity?.identityType ?? IdentityType.NID,
      fin,
      profileImageUrl,
      profileImageExpiresAt,
      citizenIdentity: user.citizenIdentity
        ? {
            surName: user.citizenIdentity.surName,
            postNames: user.citizenIdentity.postNames,
            sex: user.citizenIdentity.sex,
            dateOfBirth: user.citizenIdentity.dateOfBirth,
            countryOfBirth: user.citizenIdentity.countryOfBirth,
          }
        : null,
    };
  }

  /**
   * Formats persisted preference rows into the public response contract.
   *
   * @param preferences - Optional persisted preference row.
   * @returns Normalized preference response safe for frontend apps.
   */
  private formatUserPreferences(
    preferences: UserPreferenceRecord | null,
  ): UserPreferencesResponseDto {
    return {
      defaultDocumentInviteVerifications:
        normalizeUserInviteVerificationPreferences(
          this.fromPrismaPreferenceValues(
            preferences?.defaultDocumentInviteVerifications,
          ),
          'Document invitation defaults',
        ),
      defaultMeetingInviteVerifications:
        normalizeUserInviteVerificationPreferences(
          this.fromPrismaPreferenceValues(
            preferences?.defaultMeetingInviteVerifications,
          ),
          'Meeting invitation defaults',
        ),
    };
  }

  /**
   * Converts Prisma enum values into the public DTO enum shape.
   *
   * @param values - Persisted Prisma preference values.
   * @returns Public preference values.
   */
  private fromPrismaPreferenceValues(
    values: UserInviteVerificationPreference[] | undefined,
  ): UserInviteVerificationPreferenceValue[] | undefined {
    return values?.map(
      (value) => value as UserInviteVerificationPreferenceDtoValue,
    );
  }

  /**
   * Converts public DTO enum values into Prisma enum values.
   *
   * @param values - Public preference values accepted by the API.
   * @returns Prisma-compatible enum values.
   */
  private toPrismaPreferenceValues(
    values: UserInviteVerificationPreferenceValue[],
  ): UserInviteVerificationPreference[] {
    return values.map((value) => value as UserInviteVerificationPreference);
  }

  /**
   * Updates mutable profile fields for the authenticated user.
   *
   * - phoneNumber: updated directly if provided.
   * - email: if changed, the account is locked (isVerified + isActive → false)
   *   and a new verification email is sent. Throws ConflictException if the
   *   new address is already taken (checked before any writes).
   *
   * Returns the updated safe profile via getProfile().
   */
  async updateProfile(userId: string, dto: UpdateProfileDto) {
    // Load the current user to compare values
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        citizenIdentity: { select: { surName: true, postNames: true } },
      },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    const isEmailChanging = dto.email && dto.email !== user.email;

    // Guard: reject if the new email is already taken by another account
    if (isEmailChanging) {
      const taken = await this.prisma.user.findUnique({
        where: { email: dto.email },
        select: { id: true },
      });

      if (taken && taken.id !== userId) {
        throw new ConflictException(
          'An account with this email address already exists',
        );
      }
    }

    // Build the update payload — only include fields that were provided
    const updateData: Record<string, unknown> = {};

    if (dto.phoneNumber !== undefined) {
      updateData.phoneNumber = dto.phoneNumber;
    }

    if (isEmailChanging) {
      updateData.email = dto.email;
      // Lock the account until the new email is verified
      updateData.isVerified = false;
      updateData.isActive = false;
    }

    await this.prisma.user.update({
      where: { id: userId },
      data: updateData,
    });

    // If the email changed, issue a new verification token and send the email
    if (isEmailChanging) {
      const rawToken = crypto.randomBytes(32).toString('hex');
      const tokenHash = this.encryption.hash(rawToken);
      const tokenExpiry = new Date(Date.now() + this.TOKEN_EXPIRY_MS);

      // Upsert — replace any existing token for this user
      await this.prisma.emailVerificationToken.upsert({
        where: { userId },
        create: {
          userId,
          tokenHash,
          expiresAt: tokenExpiry,
          used: false,
        },
        update: {
          tokenHash,
          expiresAt: tokenExpiry,
          used: false,
          createdAt: new Date(),
        },
      });

      await this.mailer.sendVerificationEmail({
        to: dto.email!,
        surName: user.citizenIdentity?.surName ?? '',
        postNames: user.citizenIdentity?.postNames ?? '',
        userId,
        token: rawToken,
      });

      this.logger.log(
        `Email changed for user ${userId} — verification required for new address`,
      );
    }

    // Return the full updated profile
    return this.getProfile(userId);
  }

  /**
   * Replaces the user's profile image on S3.
   *
   * Flow:
   * 1. Delete the old image from S3 if one exists.
   * 2. Upload the new image to the profile-images folder.
   * 3. Update user.imageUrl with the new S3 key.
   * 4. Return a presigned URL for the new image so the client can display it
   *    immediately without a separate GET /profile round-trip.
   */
  async uploadProfileImage(
    userId: string,
    file: Express.Multer.File,
  ): Promise<{ profileImageUrl: string; profileImageExpiresAt: Date }> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { imageUrl: true },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    // Remove the old image before uploading the new one to avoid orphaned files
    if (user.imageUrl) {
      await this.s3.deleteObject(user.imageUrl);
    }

    // Upload new image — validateFile is called inside uploadProfileImage
    const { key } = await this.s3.uploadProfileImage(userId, file);

    // Persist the S3 key (not a URL — presigned on every read)
    await this.prisma.user.update({
      where: { id: userId },
      data: { imageUrl: key },
    });

    // Return a presigned URL so the caller can display it right away
    const { url, expiresAt } = await this.s3.getPresignedUrl(key);

    this.logger.log(`Profile image updated for user: ${userId}`);

    return { profileImageUrl: url, profileImageExpiresAt: expiresAt };
  }

  async resolveProfileImageAccess(
    imageUrl: string | null,
  ): Promise<{ url: string | null; expiresAt: Date | null }> {
    if (!imageUrl) {
      return { url: null, expiresAt: null };
    }

    if (/^https?:\/\//i.test(imageUrl)) {
      return { url: imageUrl, expiresAt: null };
    }

    const presigned = await this.s3.getPresignedUrl(imageUrl);
    return { url: presigned.url, expiresAt: presigned.expiresAt };
  }

  private async generatePostEmailVerificationTokens(
    userId: string,
    email: string,
  ): Promise<AuthTokens> {
    const payload: JwtPayload = { sub: userId, email, tokenType: 'limited' };
    const accessToken = this.jwtService.sign(payload, {
      expiresIn: this.LIMITED_ACCESS_TOKEN_EXPIRY,
      secret: this.config.get<string>('JWT_SECRET'),
    });
    const rawRefreshToken = crypto.randomBytes(40).toString('hex');
    const refreshTokenHash = this.encryption.hash(rawRefreshToken);
    const expiresAt = new Date(Date.now() + this.REFRESH_TOKEN_EXPIRY_MS);

    await this.prisma.refreshToken.create({
      data: {
        userId,
        tokenHash: refreshTokenHash,
        tokenType: 'limited',
        expiresAt,
      },
    });

    return {
      accessToken,
      refreshToken: rawRefreshToken,
      tokenType: 'limited',
    };
  }

  private buildVerificationSessionProfile(user: {
    id: string;
    email: string;
    phoneNumber: string | null;
    imageUrl: string | null;
    isIdVerified: boolean;
    idVerifiedAt: Date | null;
    createdAt: Date;
    citizenIdentity: {
      identityType: IdentityType;
      finEncrypted: string | null;
      surName: string;
      postNames: string;
      sex: string;
    } | null;
  }): SafeUserProfile {
    const fin =
      user.citizenIdentity?.identityType === IdentityType.FIN &&
      user.citizenIdentity.finEncrypted
        ? this.encryption.decrypt(user.citizenIdentity.finEncrypted)
        : null;

    return {
      userId: user.id,
      email: user.email,
      phoneNumber: user.phoneNumber,
      imageUrl: user.imageUrl,
      surName: user.citizenIdentity?.surName ?? '',
      postNames: user.citizenIdentity?.postNames ?? '',
      sex: user.citizenIdentity?.sex ?? '',
      identityType: user.citizenIdentity?.identityType ?? IdentityType.NID,
      fin,
      isIdVerified: user.isIdVerified,
      idVerifiedAt: user.idVerifiedAt,
      createdAt: user.createdAt,
    };
  }

  /**
   * Changes the user's password.
   *
   * Security requirements enforced here:
   * - currentPassword verified against the stored bcrypt hash (timing-safe compare).
   * - confirmNewPassword must equal newPassword (cross-field check).
   * - New password hashed at bcrypt cost 12.
   * - All active refresh tokens revoked to force re-login on all devices.
   */
  async changePassword(
    userId: string,
    dto: ChangePasswordDto,
  ): Promise<{ success: boolean; message: string }> {
    // Cross-field validation — class-validator can't do this declaratively
    if (dto.newPassword !== dto.confirmNewPassword) {
      throw new BadRequestException(
        'New password and confirmation do not match',
      );
    }

    // Fetch the stored hash — we need it to verify the current password
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { passwordHash: true },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    // Verify the current password — bcrypt.compare is timing-safe
    const isCurrentPasswordValid = await bcrypt.compare(
      dto.currentPassword,
      user.passwordHash,
    );

    if (!isCurrentPasswordValid) {
      throw new UnauthorizedException('Current password is incorrect');
    }

    // Prevent re-use of the current password
    const isSamePassword = await bcrypt.compare(
      dto.newPassword,
      user.passwordHash,
    );

    if (isSamePassword) {
      throw new BadRequestException(
        'New password must be different from the current password',
      );
    }

    // In changePassword() — after the DB update succeeds:
    void this.secEvent.logPasswordChanged({
      userId,
      metadata: { trigger: 'user_change_password' },
    });

    // Hash the new password at bcrypt cost 12
    const newPasswordHash = await bcrypt.hash(
      dto.newPassword,
      this.BCRYPT_ROUNDS,
    );

    // Update password and revoke all refresh tokens in a single transaction
    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: userId },
        data: { passwordHash: newPasswordHash },
      }),
      // Revoke all active refresh tokens — forces re-login on all devices
      this.prisma.refreshToken.updateMany({
        where: { userId, revoked: false },
        data: { revoked: true },
      }),
    ]);

    this.logger.log(
      `Password changed and all refresh tokens revoked for user: ${userId}`,
    );

    return {
      success: true,
      message:
        'Password changed successfully. You have been signed out of all other devices.',
    };
  }
}
