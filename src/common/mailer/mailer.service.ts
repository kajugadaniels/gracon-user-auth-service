import { Injectable, Logger } from '@nestjs/common';
import { MailerService } from '@nestjs-modules/mailer';
import { ConfigService } from '@nestjs/config';

interface SendVerificationEmailParams {
  to: string;
  surName: string;
  postNames: string;
  userId: string;
  token: string; // raw token — included in the email link
}

interface SendWelcomeEmailParams {
  to: string;
  surName: string;
  postNames: string;
  platformId: string;
}

@Injectable()
export class AppMailerService {
  private readonly logger = new Logger(AppMailerService.name);
  private readonly frontendUrl: string;

  constructor(
    private readonly mailerService: MailerService,
    private readonly configService: ConfigService,
  ) {
    const frontendUrl = this.configService.get<string>('FRONTEND_URL');
    if (!frontendUrl) throw new Error('FRONTEND_URL environment variable is not set');
    this.frontendUrl = frontendUrl;
  }

  // Sends the email verification link after registration
  // Link format: {FRONTEND_URL}/verify-email?userId=xxx&token=rawToken
  async sendVerificationEmail(
    params: SendVerificationEmailParams,
  ): Promise<void> {
    const { to, surName, postNames, userId, token } = params;

    // Build the full verification URL the user clicks
    const verificationUrl = `${this.frontendUrl}/verify-email?userId=${userId}&token=${encodeURIComponent(token)}`;

    try {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
      await this.mailerService.sendMail({
        to,
        subject: 'Verify your email address',
        template: 'email-verification', // → src/common/mailer/templates/email-verification.hbs
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
      // Log but don't throw — a mail failure shouldn't crash registration
      // The user can request a resend
      this.logger.error(`Failed to send verification email to ${to}`, error);
    }
  }

  // Sends a welcome email after successful email verification
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
}
