import {
  Controller,
  Post,
  Get,
  Body,
  Query,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBody,
  ApiQuery,
  ApiResponse,
} from '@nestjs/swagger';
import { PasswordResetService } from './password-reset.service';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import {
  ThrottleAuth,
  ThrottleStrict,
} from '../../common/decorators/throttle.decorator';

@ApiTags('Auth')
@Controller('auth/password-reset')
export class PasswordResetController {
  constructor(private readonly passwordResetService: PasswordResetService) {}

  /**
   * POST /api/v1/auth/password-reset/request
   * Auth limit: 5 per minute.
   * Prevents email flooding and user enumeration via timing.
   */
  @Post('request')
  @ThrottleAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Request a password reset email',
    description:
      'Triggers a password reset email to the provided address if an account with that email exists. ' +
      'The email contains a one-time reset link that embeds a `userId` and a raw 64-character hex token. ' +
      'The link is valid for **1 hour** from the moment of this request.\n\n' +
      'Only one active reset token exists per user at a time — any previously issued unused token ' +
      'is invalidated the moment a new request is made.\n\n' +
      '**Security note:** The response is always `200 OK` with the same message body regardless of ' +
      'whether the email is registered in the system. This prevents attackers from using this endpoint ' +
      'to discover which email addresses have accounts (user enumeration).\n\n' +
      '**Rate limit:** 5 requests per minute per IP address.',
  })
  @ApiBody({ type: ForgotPasswordDto })
  @ApiResponse({
    status: 200,
    description:
      'Request processed. If an account with this email exists, a reset link has been dispatched to the inbox. ' +
      'The identical response is returned whether or not the email is registered.',
    schema: {
      example: {
        success: true,
        message:
          'If an account with this email exists, a password reset link has been sent. Please check your inbox.',
      },
    },
  })
  @ApiResponse({
    status: 400,
    description:
      'Request body failed validation (e.g. the email field is not a valid email address).',
    schema: {
      example: {
        statusCode: 400,
        message: ['Please provide a valid email address'],
        error: 'Bad Request',
      },
    },
  })
  @ApiResponse({
    status: 429,
    description:
      'Rate limit exceeded — more than 5 requests per minute from this IP address.',
    schema: {
      example: {
        statusCode: 429,
        message: 'ThrottlerException: Too Many Requests',
      },
    },
  })
  async requestReset(@Body() dto: ForgotPasswordDto) {
    return this.passwordResetService.requestReset(dto);
  }

  /**
   * GET /api/v1/auth/password-reset/validate
   * Auth limit: 5 per minute.
   * Prevents token brute-forcing via rapid validate calls.
   */
  @Get('validate')
  @ThrottleAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Validate a password reset token',
    description:
      'Checks whether the reset token embedded in a reset link is still valid without consuming it. ' +
      'Use this to gate the reset-password form: call this endpoint when the user opens the link, ' +
      'and only render the form if `valid: true` is returned. If `valid: false`, redirect the user ' +
      'to request a new link.\n\n' +
      'A token is considered **invalid** if any of the following are true:\n' +
      '- It does not exist in the database\n' +
      '- It has already been used\n' +
      '- It expired (more than 1 hour has elapsed since issuance)\n\n' +
      'This endpoint is read-only — calling it does **not** consume or extend the token.\n\n' +
      '**Rate limit:** 5 requests per minute per IP address.',
  })
  @ApiQuery({
    name: 'userId',
    required: true,
    description:
      'The UUID of the user the reset token belongs to. Extracted from the reset link URL.',
    example: 'a3f2c1d4-8b7e-4f6a-9c2d-1e5b3a7f8d9c',
    schema: { type: 'string', format: 'uuid' },
  })
  @ApiQuery({
    name: 'token',
    required: true,
    description:
      'The raw 64-character hex reset token extracted from the reset link URL. ' +
      'Hashed with SHA-256 before being compared to the stored hash.',
    example: 'f3a1c9e2b7d4a8f1c3e9b2d7a4f8c1e3b9d2a7f4c8e1b3d9a2f7c4e8b1d3a9f2',
    schema: { type: 'string' },
  })
  @ApiResponse({
    status: 200,
    description:
      'Validation result returned. Check `valid` to determine whether to show the reset form.',
    schema: {
      example: {
        valid: true,
        message:
          'Reset token is valid. You may proceed to reset your password.',
      },
    },
  })
  @ApiResponse({
    status: 200,
    description:
      'Token is invalid or expired. The `valid` field will be `false`.',
    schema: {
      example: {
        valid: false,
        message:
          'This reset link has expired or has already been used. Please request a new one.',
      },
    },
  })
  @ApiResponse({
    status: 429,
    description:
      'Rate limit exceeded — more than 5 validation attempts per minute from this IP address.',
    schema: {
      example: {
        statusCode: 429,
        message: 'ThrottlerException: Too Many Requests',
      },
    },
  })
  async validateToken(
    @Query('userId') userId: string,
    @Query('token') token: string,
  ) {
    return this.passwordResetService.validateResetToken(userId, token);
  }

  /**
   * POST /api/v1/auth/password-reset/reset
   * Strict limit: 3 per 10 minutes.
   * Password changes are high-value targets — tightest restriction.
   */
  @Post('reset')
  @ThrottleStrict()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Set a new password using a reset token',
    description:
      "Consumes a valid reset token and replaces the account's password with the new value. " +
      'The reset token is one-time use — this endpoint marks it as used so it cannot be replayed.\n\n' +
      '**What happens after a successful reset:**\n' +
      '1. The new password is hashed with bcrypt (12 rounds) and stored\n' +
      '2. The reset token is marked as used and can no longer be submitted\n' +
      '3. **All active refresh tokens** on all devices are revoked — the user is forced to re-login everywhere\n\n' +
      'After this call succeeds, direct the user to `POST /api/v1/auth/login` to obtain fresh tokens.\n\n' +
      '**Rate limit:** 3 requests per 10 minutes per IP address — this is the tightest limit in the system ' +
      'because a successful brute-force here would give full account access.',
  })
  @ApiBody({ type: ResetPasswordDto })
  @ApiResponse({
    status: 200,
    description:
      'Password reset successful. All existing sessions have been revoked. ' +
      'The user must log in again with the new password.',
    schema: {
      example: {
        success: true,
        message:
          'Password reset successfully. Please log in with your new password.',
      },
    },
  })
  @ApiResponse({
    status: 400,
    description:
      'Reset failed due to one of: invalid/expired token, `newPassword` and `confirmPassword` do not match, ' +
      'new password does not meet complexity requirements, or the new password is identical to the current one.',
    schema: {
      example: {
        statusCode: 400,
        message:
          'This reset link is invalid or has expired. Please request a new one.',
      },
    },
  })
  @ApiResponse({
    status: 429,
    description:
      'Rate limit exceeded — more than 3 reset attempts per 10 minutes from this IP address.',
    schema: {
      example: {
        statusCode: 429,
        message: 'ThrottlerException: Too Many Requests',
      },
    },
  })
  async resetPassword(@Body() dto: ResetPasswordDto) {
    return this.passwordResetService.resetPassword(dto);
  }
}
