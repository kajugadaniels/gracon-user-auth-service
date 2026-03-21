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

    const verificationUrl = `${this.frontendUrl}/verify-email?userId=${userId}&token=${encodeURIComponent(token)}`;
    const currentYear = new Date().getFullYear();

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>Verify your email</title>
  <style>
    body { margin: 0; padding: 0; background: #f4f6f9; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; }
    .wrapper { max-width: 560px; margin: 40px auto; background: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 2px 12px rgba(0,0,0,0.08); }
    .header { background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%); padding: 36px 40px; text-align: center; }
    .header h1 { color: #ffffff; font-size: 22px; font-weight: 600; margin: 0; letter-spacing: -0.3px; }
    .header p { color: rgba(255,255,255,0.65); font-size: 13px; margin: 6px 0 0; }
    .body { padding: 40px; }
    .greeting { font-size: 16px; color: #1a1a2e; font-weight: 500; margin-bottom: 12px; }
    .text { font-size: 14px; color: #555e6d; line-height: 1.7; margin-bottom: 28px; }
    .btn { display: block; width: fit-content; margin: 0 auto 28px; padding: 14px 36px; background: linear-gradient(135deg, #4f46e5, #7c3aed); color: #ffffff; text-decoration: none; border-radius: 8px; font-size: 15px; font-weight: 600; letter-spacing: 0.2px; }
    .expires { text-align: center; font-size: 12px; color: #9ca3af; margin-bottom: 28px; }
    .divider { border: none; border-top: 1px solid #f0f0f0; margin: 0 0 24px; }
    .fallback { font-size: 12px; color: #9ca3af; line-height: 1.6; word-break: break-all; }
    .fallback a { color: #4f46e5; }
    .footer { background: #f8f9fb; padding: 20px 40px; text-align: center; font-size: 12px; color: #9ca3af; }
  </style>
</head>
<body>
  <div class="wrapper">
    <div class="header">
      <h1>ID Verification Platform</h1>
      <p>Secure Identity Management</p>
    </div>
    <div class="body">
      <p class="greeting">Hello, ${postNames} ${surName}</p>
      <p class="text">
        Thank you for registering. To activate your account, please verify
        your email address by clicking the button below.
      </p>
      <a href="${verificationUrl}" class="btn">Verify Email Address</a>
      <p class="expires">This link expires in 24 hours.</p>
      <hr class="divider" />
      <p class="fallback">
        If the button doesn't work, copy and paste this link into your browser:<br/>
        <a href="${verificationUrl}">${verificationUrl}</a>
      </p>
    </div>
    <div class="footer">
      &copy; ${currentYear} ID Verification Platform. All rights reserved.<br/>
      If you did not create an account, you can safely ignore this email.
    </div>
  </div>
</body>
</html>`;

    try {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
      await this.mailerService.sendMail({
        to,
        subject: 'Verify your email address',
        html,
      });

      this.logger.log(`Verification email sent to ${to}`);
    } catch (error) {
      this.logger.error(`Failed to send verification email to ${to}`, error);
    }
  }

  // Sends a welcome email after successful email verification
  async sendWelcomeEmail(params: SendWelcomeEmailParams): Promise<void> {
    const { to, surName, postNames, platformId } = params;
    const loginUrl = `${this.frontendUrl}/login`;
    const currentYear = new Date().getFullYear();

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>Welcome</title>
  <style>
    body { margin: 0; padding: 0; background: #f4f6f9; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; }
    .wrapper { max-width: 560px; margin: 40px auto; background: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 2px 12px rgba(0,0,0,0.08); }
    .header { background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%); padding: 36px 40px; text-align: center; }
    .header h1 { color: #ffffff; font-size: 22px; font-weight: 600; margin: 0; }
    .header p { color: rgba(255,255,255,0.65); font-size: 13px; margin: 6px 0 0; }
    .body { padding: 40px; }
    .greeting { font-size: 16px; color: #1a1a2e; font-weight: 500; margin-bottom: 12px; }
    .text { font-size: 14px; color: #555e6d; line-height: 1.7; margin-bottom: 24px; }
    .pid-box { background: #f8f7ff; border: 1px solid #e0e0ff; border-radius: 8px; padding: 16px 20px; margin-bottom: 28px; }
    .pid-label { font-size: 11px; font-weight: 600; color: #7c3aed; text-transform: uppercase; letter-spacing: 0.8px; margin-bottom: 6px; }
    .pid-value { font-size: 22px; font-weight: 700; color: #1a1a2e; letter-spacing: 3px; font-family: monospace; }
    .btn { display: block; width: fit-content; margin: 0 auto 28px; padding: 14px 36px; background: linear-gradient(135deg, #4f46e5, #7c3aed); color: #ffffff; text-decoration: none; border-radius: 8px; font-size: 15px; font-weight: 600; }
    .footer { background: #f8f9fb; padding: 20px 40px; text-align: center; font-size: 12px; color: #9ca3af; }
  </style>
</head>
<body>
  <div class="wrapper">
    <div class="header">
      <h1>Account Activated</h1>
      <p>Your identity has been verified</p>
    </div>
    <div class="body">
      <p class="greeting">Welcome, ${postNames} ${surName}!</p>
      <p class="text">
        Your email has been verified and your account is now fully active.
        Your Platform ID is shown below — keep it safe, you may need it
        to recover your account.
      </p>
      <div class="pid-box">
        <div class="pid-label">Your Platform ID</div>
        <div class="pid-value">${platformId}</div>
      </div>
      <a href="${loginUrl}" class="btn">Go to Login</a>
    </div>
    <div class="footer">
      &copy; ${currentYear} ID Verification Platform. All rights reserved.
    </div>
  </div>
</body>
</html>`;

    try {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
      await this.mailerService.sendMail({
        to,
        subject: 'Welcome — your account is active',
        html,
      });

      this.logger.log(`Welcome email sent to ${to}`);
    } catch (error) {
      this.logger.error(`Failed to send welcome email to ${to}`, error);
    }
  }
}
