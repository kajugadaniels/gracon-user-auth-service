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

  private readonly ACCESS_TOKEN_EXPIRY = '15m';
  private readonly LIMITED_ACCESS_TOKEN_EXPIRY = '2h'; // enough to complete ID verify
  private readonly REFRESH_TOKEN_EXPIRY = '30d';
  private readonly REFRESH_TOKEN_EXPIRY_MS = 30 * 24 * 60 * 60 * 1000;

  constructor(
    private readonly prisma: PrismaService,
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly encryption: EncryptionService,
    private readonly config: ConfigService,
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
      this.logger.warn(
        `Revoked token reuse detected for user: ${storedToken.userId}`,
      );
      throw new UnauthorizedException(
        'Refresh token has been revoked. Please log in again.',
      );
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

    // Revoke old, issue new — preserve token type
    await this.prisma.refreshToken.update({
      where: { id: storedToken.id },
      data: { revoked: true },
    });

    const tokenType = (storedToken.tokenType as 'full' | 'limited') ?? 'full';

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
