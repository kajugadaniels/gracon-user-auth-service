import {
  Injectable,
  Logger,
  UnauthorizedException,
  ForbiddenException,
} from '@nestjs/common';
import { IdentityType } from '@prisma/client';
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
import { SecurityEventService } from '../../common/security/security-event.service';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  private readonly ACCESS_TOKEN_EXPIRY = '15m';
  private readonly LIMITED_ACCESS_TOKEN_EXPIRY = '2h'; // enough to complete ID verify
  private readonly REFRESH_TOKEN_EXPIRY = '30d';
  private readonly REFRESH_TOKEN_EXPIRY_MS = 30 * 24 * 60 * 60 * 1000;
  private readonly pendingRefreshes = new Map<string, Promise<AuthTokens>>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly encryption: EncryptionService,
    private readonly config: ConfigService,
    private readonly secEvent: SecurityEventService,
  ) {}

  // ─── Login ────────────────────────────────────────────────────────────────

  async login(
    dto: LoginDto,
    ipAddress: string,
    userAgent: string,
  ): Promise<LoginResult> {
    // ── Gate 1 + 2: Find user and verify password
    const user = await this.usersService.findByEmail(dto.email);

    const DUMMY_HASH =
      '$2b$12$invalidhashfortimingprotectiononly000000000000000000000';
    const passwordValid = await bcrypt.compare(
      dto.password,
      user?.passwordHash ?? DUMMY_HASH,
    );

    if (!user || !passwordValid) {
      // Fire-and-forget — do not await, never block the response
      void this.secEvent.logLoginFailed({
        userId: user?.id,
        ipAddress,
        metadata: { email: dto.email, reason: 'invalid_credentials' },
      });
      throw new UnauthorizedException('Invalid email or password');
    }

    void this.secEvent.logLoginSuccess({
      userId: user.id,
      ipAddress,
      metadata: { tokenType: 'full' },
    });

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

    // ── Gate 5: ID verification check
    // Instead of blocking — issue a limited token so user can reach verify-identity
    if (!user.isIdVerified) {
      const limitedTokens = await this.generateTokens(
        user.id,
        user.email,
        ipAddress,
        userAgent,
        'limited', // restricted token type
      );

      const profile = await this.buildSafeProfile(user);

      this.logger.log(`Limited token issued for unverified user: ${user.id}`);

      return {
        success: true,
        // Clear message — frontend uses this to redirect
        message: 'Please complete your identity verification to continue.',
        tokenType: 'limited',
        data: {
          accessToken: limitedTokens.accessToken,
          refreshToken: limitedTokens.refreshToken,
          user: profile,
        },
      };
    }

    // ── All gates passed — issue full token
    const tokens = await this.generateTokens(
      user.id,
      user.email,
      ipAddress,
      userAgent,
      'full',
    );

    const profile = await this.buildSafeProfile(user);
    this.logger.log(`Full login successful: ${user.id}`);

    return {
      success: true,
      message: 'Login successful',
      tokenType: 'full',
      data: {
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        user: profile,
      },
    };
  }

  // ─── Refresh Token ────────────────────────────────────────────────────────

  async refreshTokens(
    dto: RefreshTokenDto,
    ipAddress: string,
    userAgent: string,
  ): Promise<AuthTokens> {
    const tokenHash = this.encryption.hash(dto.refreshToken);

    return this.runSingleFlightRefresh(tokenHash, () =>
      this.rotateRefreshToken(tokenHash, ipAddress, userAgent, false),
    );
  }

  /**
   * Rotates a refresh token into a full session once identity verification has
   * completed. This lets frontends recover from a stale limited session without
   * forcing a logout/login cycle.
   */
  async upgradeSession(
    dto: RefreshTokenDto,
    ipAddress: string,
    userAgent: string,
  ): Promise<AuthTokens> {
    const tokenHash = this.encryption.hash(dto.refreshToken);

    const tokens = await this.runSingleFlightRefresh(tokenHash, () =>
      this.rotateRefreshToken(tokenHash, ipAddress, userAgent, true),
    );

    if (tokens.tokenType !== 'full') {
      throw new ForbiddenException(
        'Identity verification is required before this session can be upgraded.',
      );
    }

    return tokens;
  }

  /**
   * Ensures concurrent refresh attempts for the same token share one rotation.
   * This keeps legitimate parallel browser/proxy requests from being mistaken
   * for refresh-token replay.
   */
  private runSingleFlightRefresh(
    tokenHash: string,
    task: () => Promise<AuthTokens>,
  ): Promise<AuthTokens> {
    const pending = this.pendingRefreshes.get(tokenHash);
    if (pending) return pending;

    const refresh = task().finally(() => {
      this.pendingRefreshes.delete(tokenHash);
    });

    this.pendingRefreshes.set(tokenHash, refresh);
    return refresh;
  }

  private async rotateRefreshToken(
    tokenHash: string,
    ipAddress: string,
    userAgent: string,
    requireFullToken: boolean,
  ): Promise<AuthTokens> {
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

    if (!storedToken) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    if (storedToken.revoked) {
      await this.revokeAllUserTokens(storedToken.userId);
      void this.secEvent.logRevokedTokenReuse({
        userId: storedToken.userId,
        ipAddress,
        metadata: { tokenHash: 'redacted' },
      });
      throw new UnauthorizedException('Refresh token has been revoked...');
    }

    if (new Date() > storedToken.expiresAt) {
      throw new UnauthorizedException(
        'Refresh token has expired. Please log in again.',
      );
    }

    if (!storedToken.user.isActive) {
      throw new UnauthorizedException(
        'Account is not active. Please contact support.',
      );
    }

    if (requireFullToken && !storedToken.user.isIdVerified) {
      throw new ForbiddenException(
        'Identity verification is required before this session can be upgraded.',
      );
    }

    // Revoke old, issue new. Limited sessions are upgraded automatically once
    // the source-of-truth user record says identity verification has passed.
    await this.prisma.refreshToken.update({
      where: { id: storedToken.id },
      data: { revoked: true },
    });

    const currentTokenType =
      (storedToken.tokenType as 'full' | 'limited') ?? 'full';
    const tokenType =
      storedToken.user.isIdVerified && currentTokenType === 'limited'
        ? 'full'
        : currentTokenType;

    const newTokens = await this.generateTokens(
      storedToken.user.id,
      storedToken.user.email,
      ipAddress,
      userAgent,
      tokenType,
    );

    this.logger.log(`Token rotated for user: ${storedToken.userId}`);
    return newTokens;
  }

  // ─── Upgrade limited → full token after ID verification ──────────────────

  /**
   * Called by VerificationService after a successful ID verification.
   * Revokes the limited token and issues a full access token.
   */
  async upgradeToken(
    userId: string,
    ipAddress: string,
    userAgent: string,
  ): Promise<AuthTokens> {
    // Revoke all existing limited tokens for this user
    await this.prisma.refreshToken.updateMany({
      where: { userId, tokenType: 'limited', revoked: false },
      data: { revoked: true },
    });

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true },
    });

    if (!user) throw new Error(`User not found: ${userId}`);

    const tokens = await this.generateTokens(
      user.id,
      user.email,
      ipAddress,
      userAgent,
      'full',
    );

    this.logger.log(`Token upgraded to full for user: ${userId}`);
    return tokens;
  }

  // ─── Logout ───────────────────────────────────────────────────────────────

  async logout(
    refreshToken: string,
  ): Promise<{ success: boolean; message: string }> {
    const tokenHash = this.encryption.hash(refreshToken);

    await this.prisma.refreshToken.updateMany({
      where: { tokenHash, revoked: false },
      data: { revoked: true },
    });

    return { success: true, message: 'Logged out successfully' };
  }

  async logoutAllDevices(
    userId: string,
  ): Promise<{ success: boolean; message: string }> {
    await this.revokeAllUserTokens(userId);
    void this.secEvent.logSessionsRevokedByUser({
      userId,
      metadata: { trigger: 'user_requested' },
    });
    this.logger.log(`All tokens revoked for user: ${userId}`);
    return { success: true, message: 'Logged out from all devices' };
  }

  // ─── Private helpers ──────────────────────────────────────────────────────

  private async generateTokens(
    userId: string,
    email: string,
    ipAddress: string,
    userAgent: string,
    tokenType: 'full' | 'limited' = 'full',
  ): Promise<AuthTokens> {
    const payload: JwtPayload = { sub: userId, email, tokenType };

    const expiry =
      tokenType === 'limited'
        ? this.LIMITED_ACCESS_TOKEN_EXPIRY
        : this.ACCESS_TOKEN_EXPIRY;

    const accessToken = this.jwtService.sign(payload, {
      expiresIn: expiry,
      secret: this.config.get<string>('JWT_SECRET'),
    });

    const rawRefreshToken = crypto.randomBytes(40).toString('hex');
    const refreshTokenHash = this.encryption.hash(rawRefreshToken);
    const expiresAt = new Date(Date.now() + this.REFRESH_TOKEN_EXPIRY_MS);

    await this.prisma.refreshToken.create({
      data: {
        userId,
        tokenHash: refreshTokenHash,
        tokenType,
        expiresAt,
        ipAddress,
        userAgent: userAgent?.substring(0, 512),
      },
    });

    return {
      accessToken,
      refreshToken: rawRefreshToken,
      tokenType,
    };
  }

  private async buildSafeProfile(
    user: NonNullable<Awaited<ReturnType<UsersService['findByEmail']>>>,
  ): Promise<SafeUserProfile> {
    const { url: imageUrl } = await this.usersService.resolveProfileImageAccess(
      user.imageUrl,
    );
    const fin =
      user.citizenIdentity?.identityType === IdentityType.FIN &&
      user.citizenIdentity.finEncrypted
        ? this.encryption.decrypt(user.citizenIdentity.finEncrypted)
        : null;

    return {
      userId: user.id,
      email: user.email,
      phoneNumber: user.phoneNumber,
      imageUrl,
      surName: user.citizenIdentity?.surName ?? '',
      postNames: user.citizenIdentity?.postNames ?? '',
      sex: user.citizenIdentity?.sex ?? '',
      identityType: user.citizenIdentity?.identityType ?? IdentityType.NID,
      fin,
      isIdVerified: user.isIdVerified,
      idVerifiedAt: user.idVerifiedAt ?? null,
      createdAt: user.createdAt,
    };
  }

  private async revokeAllUserTokens(userId: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { userId, revoked: false },
      data: { revoked: true },
    });
  }
}
