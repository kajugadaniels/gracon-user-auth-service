import {
  Injectable,
  Logger,
  UnauthorizedException,
  ForbiddenException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { PrismaService } from '../../common/prisma/prisma.service';
import { EncryptionService } from '../../common/crypto/encryption.service';
import { UsersService } from '../users/users.service';
import { LoginDto } from './dto/login.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import {
  JwtPayload,
  AuthTokens,
  LoginResult,
  SafeUserProfile,
} from './interfaces/auth.interface';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  // Access token — short lived, used for API requests
  private readonly ACCESS_TOKEN_EXPIRY = '15m';

  // Refresh token — longer lived, used only to get new access tokens
  private readonly REFRESH_TOKEN_EXPIRY = '30d';
  private readonly REFRESH_TOKEN_EXPIRY_MS = 30 * 24 * 60 * 60 * 1000;

  // bcrypt cost for comparing passwords — same as registration
  // bcrypt.compare handles this automatically, just needs the hash

  constructor(
    private readonly prisma: PrismaService,
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly encryption: EncryptionService,
    private readonly config: ConfigService,
  ) {}

  // ─── Login ────────────────────────────────────────────────────────────────

  /**
   * Authenticates a user and issues access + refresh tokens.
   *
   * Gate checks in order:
   * 1. User exists (vague error — prevents user enumeration)
   * 2. Password matches bcrypt hash
   * 3. Email verified (isVerified = true)
   * 4. Account active (isActive = true)
   * 5. ID face verification passed (isIdVerified = true)
   *
   * All credential failures return the same vague message —
   * an attacker cannot determine whether the email exists or
   * the password was wrong.
   */
  async login(
    dto: LoginDto,
    ipAddress: string,
    userAgent: string,
  ): Promise<LoginResult> {
    // ── Gate 1 + 2: Find user and verify password
    const user = await this.usersService.findByEmail(dto.email);

    // Constant-time password comparison even if user not found
    // We run bcrypt.compare against a dummy hash to prevent timing attacks
    // that would reveal whether the email is registered
    const DUMMY_HASH =
      '$2b$12$invalidhashfortimingprotectiononly000000000000000000000';

    const passwordToCompare = user?.passwordHash ?? DUMMY_HASH;
    const passwordValid = await bcrypt.compare(dto.password, passwordToCompare);

    if (!user || !passwordValid) {
      // Vague message — never reveal which field was wrong
      throw new UnauthorizedException('Invalid email or password');
    }

    // ── Gate 3: Email must be verified
    if (!user.isVerified) {
      throw new ForbiddenException(
        'Please verify your email address before logging in. Check your inbox for the verification link.',
      );
    }

    // ── Gate 4: Account must be active
    if (!user.isActive) {
      throw new ForbiddenException(
        'Your account is not active. Please contact support.',
      );
    }

    // ── Gate 5: ID verification must be complete
    // This is the final gate — user must have passed face + document check
    if (!user.isIdVerified) {
      throw new ForbiddenException(
        'Identity verification required. Please complete the ID face verification step before logging in.',
      );
    }

    // ── All gates passed — issue tokens
    const tokens = await this.generateTokens(
      user.id,
      user.email,
      ipAddress,
      userAgent,
    );

    // Build safe profile — no sensitive fields
    const profile = await this.buildSafeProfile(user);

    this.logger.log(`Login successful: ${user.id}`);

    return {
      success: true,
      message: 'Login successful',
      data: {
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        user: profile,
      },
    };
  }

  // ─── Refresh Token ────────────────────────────────────────────────────────

  /**
   * Issues a new access token using a valid refresh token.
   * Implements token rotation — old refresh token is revoked,
   * new refresh token is issued alongside the new access token.
   *
   * This means a stolen refresh token can only be used once —
   * after rotation the original is invalid.
   */
  async refreshTokens(
    dto: RefreshTokenDto,
    ipAddress: string,
    userAgent: string,
  ): Promise<AuthTokens> {
    // Hash the provided refresh token for DB lookup
    const tokenHash = this.encryption.hash(dto.refreshToken);

    // Find the stored token record
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
    const storedToken = await this.prisma.refreshToken.findUnique({
      where: { tokenHash },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            isActive: true,
            isIdVerified: true,
          },
        },
      },
    });

    // Token not found — invalid or already rotated
    if (!storedToken) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    // Token was revoked (logout or previous rotation)
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    if (storedToken.revoked) {
      // Revoke ALL tokens for this user — possible token theft
      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-member-access
      await this.revokeAllUserTokens(storedToken.userId);
      this.logger.warn(
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        `Revoked refresh token reuse detected for user: ${storedToken.userId}`,
      );
      throw new UnauthorizedException(
        'Refresh token has been revoked. Please log in again.',
      );
    }

    // Token expired
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    if (new Date() > storedToken.expiresAt) {
      throw new UnauthorizedException(
        'Refresh token has expired. Please log in again.',
      );
    }

    // Account checks — state may have changed since token was issued
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    if (!storedToken.user.isActive) {
      throw new UnauthorizedException(
        'Account is not active. Please contact support.',
      );
    }

    // ── Rotate: revoke old token, issue new pair
    // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
    await this.prisma.refreshToken.update({
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
      where: { id: storedToken.id },
      data: { revoked: true },
    });

    const newTokens = await this.generateTokens(
      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-member-access
      storedToken.user.id,
      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-member-access
      storedToken.user.email,
      ipAddress,
      userAgent,
    );

    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    this.logger.log(`Token rotated for user: ${storedToken.userId}`);

    return newTokens;
  }

  // ─── Logout ───────────────────────────────────────────────────────────────

  /**
   * Revokes the provided refresh token.
   * Access token expiry is handled naturally (15 min TTL).
   * Frontend should delete the access token from memory on logout.
   */
  async logout(
    refreshToken: string,
  ): Promise<{ success: boolean; message: string }> {
    const tokenHash = this.encryption.hash(refreshToken);

    // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
    await this.prisma.refreshToken.updateMany({
      where: { tokenHash, revoked: false },
      data: { revoked: true },
    });

    return { success: true, message: 'Logged out successfully' };
  }

  /**
   * Logs the user out of all devices by revoking all refresh tokens.
   * Useful for security incidents or password changes.
   */
  async logoutAllDevices(
    userId: string,
  ): Promise<{ success: boolean; message: string }> {
    await this.revokeAllUserTokens(userId);
    this.logger.log(`All tokens revoked for user: ${userId}`);
    return { success: true, message: 'Logged out from all devices' };
  }

  // ─── Private helpers ──────────────────────────────────────────────────────

  /**
   * Generates an access token + refresh token pair.
   * Access token is a signed JWT — stateless, short lived.
   * Refresh token is a random hex string — hash stored in DB.
   */
  private async generateTokens(
    userId: string,
    email: string,
    ipAddress: string,
    userAgent: string,
  ): Promise<AuthTokens> {
    const payload: JwtPayload = { sub: userId, email };

    // Sign the JWT access token
    const accessToken = this.jwtService.sign(payload, {
      expiresIn: this.ACCESS_TOKEN_EXPIRY,
      secret: this.config.get<string>('JWT_SECRET'),
    });

    // Generate cryptographically random refresh token
    const rawRefreshToken = crypto.randomBytes(40).toString('hex'); // 80-char hex
    const refreshTokenHash = this.encryption.hash(rawRefreshToken);
    const expiresAt = new Date(Date.now() + this.REFRESH_TOKEN_EXPIRY_MS);

    // Store hashed refresh token in DB
    // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
    await this.prisma.refreshToken.create({
      data: {
        userId,
        tokenHash: refreshTokenHash,
        expiresAt,
        ipAddress,
        userAgent: userAgent?.substring(0, 512), // truncate long user-agent strings
      },
    });

    return {
      accessToken,
      refreshToken: rawRefreshToken, // raw token sent to client — only time it's available
    };
  }

  /**
   * Builds a safe user profile for the login response.
   * Decrypts PID only if needed for display — otherwise never decrypts.
   */
  private buildSafeProfile(
    user: NonNullable<Awaited<ReturnType<UsersService['findByEmail']>>>,
  ): SafeUserProfile {
    return {
      userId: user.id,
      email: user.email,
      phoneNumber: user.phoneNumber,
      imageUrl: user.imageUrl,
      surName: user.citizenIdentity?.surName ?? '',
      postNames: user.citizenIdentity?.postNames ?? '',
      sex: user.citizenIdentity?.sex ?? '',
      isIdVerified: user.isIdVerified,
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      idVerifiedAt: user.idVerifiedAt ?? null,
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      createdAt: user.createdAt,
    };
  }

  /**
   * Revokes all active refresh tokens for a user.
   * Called on suspicious token reuse or explicit logout-all.
   */
  private async revokeAllUserTokens(userId: string): Promise<void> {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
    await this.prisma.refreshToken.updateMany({
      where: { userId, revoked: false },
      data: { revoked: true },
    });
  }
}
