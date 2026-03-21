import { Injectable, Logger } from '@nestjs/common';
import { MailerService } from '@nestjs-modules/mailer';
import { ConfigService } from '@nestjs/config';

interface SendVerificationEmailParams {
  to: string;
  surName: string;
  postNames: string;
  userId: string;
  token: string;
}

interface SendWelcomeEmailParams {
  to: string;
  surName: string;
  postNames: string;
  platformId: string;
}

// New interface for password reset
interface SendPasswordResetEmailParams {
  to: string;
  surName: string;
  postNames: string;
  userId: string;
  token: string; // raw token — included in the reset link
}

@Injectable()
export class AppMailerService {
  private readonly logger = new Logger(AppMailerService.name);
  private readonly frontendUrl: string;

  constructor(
    private readonly mailerService: MailerService,
    private readonly configService: ConfigService,
  ) {
    this.frontendUrl = this.configService.get<string>('FRONTEND_URL')!;
  }

  // ── Email verification ────────────────────────────────────────

  async sendVerificationEmail(
    params: SendVerificationEmailParams,
  ): Promise<void> {
    const { to, surName, postNames, userId, token } = params;

    const verificationUrl = `${this.frontendUrl}/verify-email?userId=${userId}&token=${encodeURIComponent(token)}`;

    try {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
      await this.mailerService.sendMail({
        to,
        subject:  'Verify your email address',
        template: 'email-verification',
        context: {
          surName,
          postNames,
          verificationUrl,
          expiresIn: '24 hours',
          currentYear: new Date().getFullYear(),
        },
      });
      this.logger.log(`Verification email sent to ${to}`);
    } catch (error) {
      this.logger.error(`Failed to send verification email to ${to}`, error);
    }
  }

  // ── Welcome email ─────────────────────────────────────────────

  async sendWelcomeEmail(params: SendWelcomeEmailParams): Promise<void> {
    const { to, surName, postNames, platformId } = params;

    try {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
      await this.mailerService.sendMail({
        to,
        subject: 'Welcome — your account is active',
        template: 'welcome',
        context: {
          surName,
          postNames,
          platformId,
          loginUrl: `${this.frontendUrl}/login`,
          currentYear: new Date().getFullYear(),
        },
      });
      this.logger.log(`Welcome email sent to ${to}`);
    } catch (error) {
      this.logger.error(`Failed to send welcome email to ${to}`, error);
    }
  }

  // ── Password reset ────────────────────────────────────────────

  async sendPasswordResetEmail(
    params: SendPasswordResetEmailParams,
  ): Promise<void> {
    const { to, surName, postNames, userId, token } = params;

    // Reset link format: {FRONTEND_URL}/reset-password?userId=xxx&token=rawToken
    const resetUrl = `${this.frontendUrl}/reset-password?userId=${userId}&token=${encodeURIComponent(token)}`;

    try {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
      await this.mailerService.sendMail({
        to,
        subject: 'Reset your password',
        template: 'password-reset',
        context: {
          surName,
          postNames,
          resetUrl,
          expiresIn: '1 hour',
          currentYear: new Date().getFullYear(),
        },
      });
      this.logger.log(`Password reset email sent to ${to}`);
    } catch (error) {
      // Never throw — email failure must not break the API response
      this.logger.error(`Failed to send password reset email to ${to}`, error);
    }
  }
}
