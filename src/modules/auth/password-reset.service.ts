import {
  Injectable,
  Logger,
  BadRequestException,
  InternalServerErrorException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'crypto';
import * as bCrypt from 'bcrypt';
import { PrismaService } from '../../common/prisma/prisma.service';
import { EncryptionService } from '../../common/crypto/encryption.service';
import { AppMailerService } from '../../common/mailer/mailer.service';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { SecurityEventService } from 'src/common/security/security-event.service';

@Injectable()
export class PasswordResetService {
  private readonly logger = new Logger(PasswordResetService.name);

  // Token expires after 1 hour — short window limits attack surface
  private readonly TOKEN_EXPIRY_MS = 60 * 60 * 1000;

  // bcrypt cost — same as registration
  private readonly BCRYPT_ROUNDS = 12;

  constructor(
    private readonly prisma: PrismaService,
    private readonly encryption: EncryptionService,
    private readonly mailer: AppMailerService,
    private readonly config: ConfigService,
    private readonly secEvent: SecurityEventService,
  ) {}

  // ── Request password reset ────────────────────────────────────

  /**
   * Initiates password reset flow.
   *
   * Security: always returns the same response regardless of whether
   * the email exists — prevents user enumeration attacks.
   * The actual email is only sent if the account exists and is active.
   */
  async requestReset(dto: ForgotPasswordDto): Promise<{
    success: boolean;
    message: string;
  }> {
    // Vague response — same regardless of outcome
    const safeResponse = {
      success: true,
      message:
        'If an account with this email exists, a password reset link has been sent.',
    };

    // Look up the user quietly — no error thrown if not found
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
      select: {
        id: true,
        email: true,
        isActive: true,
        citizenIdentity: {
          select: { surName: true, postNames: true },
        },
      },
    });

    // Exit silently — do not reveal whether email is registered
    if (!user || !user.isActive) {
      return safeResponse;
    }

    // Invalidate any existing unused reset tokens for this user
    // Only one active reset token at a time
    await this.prisma.passwordResetToken.updateMany({
      where: { userId: user.id, used: false },
      data: { used: true },
    });

    // Generate cryptographically secure raw token
    const rawToken = bcrypt.randomBytes(32).toString('hex');
    const tokenHash = this.encryption.hash(rawToken);
    const expiresAt = new Date(Date.now() + this.TOKEN_EXPIRY_MS);

    // Store hashed token — raw token only lives in the email
    try {
      await this.prisma.passwordResetToken.create({
        data: {
          userId: user.id,
          tokenHash,
          expiresAt,
          used: false,
        },
      });
    } catch (error) {
      this.logger.error(
        `Failed to create password reset token for user: ${user.id}`,
        error,
      );
      throw new InternalServerErrorException(
        'Failed to process reset request. Please try again.',
      );
    }

    // Send email — failure is logged but does not affect response
    await this.mailer.sendPasswordResetEmail({
      to: user.email,
      surName: user.citizenIdentity?.surName ?? '',
      postNames: user.citizenIdentity?.postNames ?? '',
      userId: user.id,
      token: rawToken,
    });

    this.logger.log(`Password reset requested for user: ${user.id}`);
    return safeResponse;
  }

  // ── Validate token (used by frontend to check link before showing form) ──

  /**
   * Checks if a reset token is valid and not expired.
   * Called when the reset page loads — avoids showing the form
   * for an already-expired or used token.
   */
  async validateResetToken(
    userId: string,
    token: string,
  ): Promise<{ valid: boolean; message: string }> {
    const result = await this.findValidToken(userId, token);

    if (!result.valid) {
      return { valid: false, message: result.reason };
    }

    return {
      valid: true,
      message: 'Token is valid.',
    };
  }

  // ── Execute password reset ────────────────────────────────────

  /**
   * Validates the token and updates the password.
   *
   * After success:
   * - Token is marked as used (can never be replayed)
   * - ALL refresh tokens revoked (force re-login everywhere)
   * - bcrypt hash updated with new password
   */
  async resetPassword(dto: ResetPasswordDto): Promise<{
    success: boolean;
    message: string;
  }> {
    // Confirm passwords match — also validated at DTO level but
    // double-checking here for defence in depth
    if (dto.newPassword !== dto.confirmPassword) {
      throw new BadRequestException('Passwords do not match.');
    }

    // Find and validate the token
    const tokenLookup = await this.findValidToken(dto.userId, dto.token);

    if (!tokenLookup.valid || !tokenLookup.record) {
      throw new BadRequestException(tokenLookup.reason);
    }

    // Hash the new password
    const passwordHash = await bCrypt.hash(dto.newPassword, this.BCRYPT_ROUNDS);

    // Execute atomically — all succeed or all roll back
    await this.prisma.$transaction(async (tx) => {
      // Update password
      await tx.user.update({
        where: { id: dto.userId },
        data: { passwordHash },
      });

      // Mark token as used — prevents replay attacks
      await tx.passwordResetToken.update({
        where: { id: tokenLookup.record.id },
        data: { used: true },
      });

      // Revoke ALL refresh tokens — force re-login on all devices
      // This ensures old sessions cannot be used after a password change
      await tx.refreshToken.updateMany({
        where: { userId: dto.userId, revoked: false },
        data: { revoked: true },
      });
    });

    this.logger.log(
      `Password reset successful for user: ${dto.userId} — all sessions revoked`,
    );

    return {
      success: true,
      message:
        'Your password has been reset successfully. Please log in with your new password.',
    };
  }

  // ── Private helpers ───────────────────────────────────────────

  /**
   * Finds a valid (unused, unexpired) token for the given user.
   * Returns the record on success so the caller can mark it used.
   */
  private async findValidToken(
    userId: string,
    rawToken: string,
  ): Promise<
    | { valid: true; record: { id: string }; reason: null }
    | { valid: false; record: null; reason: string }
  > {
    const tokenHash = this.encryption.hash(rawToken);

    const record = await this.prisma.passwordResetToken.findFirst({
      where: { userId, tokenHash },
      select: { id: true, used: true, expiresAt: true },
    });

    if (!record) {
      return {
        valid: false,
        record: null,
        reason: 'Invalid or expired reset link. Please request a new one.',
      };
    }

    if (record.used) {
      return {
        valid: false,
        record: null,
        reason:
          'This reset link has already been used. Please request a new one.',
      };
    }

    if (new Date() > record.expiresAt) {
      return {
        valid: false,
        record: null,
        reason:
          'This reset link has expired. Links are valid for 1 hour. Please request a new one.',
      };
    }

    // In requestReset() — after sending the email:
    void this.secEvent.logPasswordResetRequested({
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      userId: user.id,
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      metadata: { email: dto.email },
    });

    // In resetPassword() — after the transaction succeeds:
    void this.secEvent.logPasswordChanged({
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
      userId: dto.userId,
      metadata: { trigger: 'password_reset_flow' },
    });

    return { valid: true, record: { id: record.id }, reason: null };
  }
}
