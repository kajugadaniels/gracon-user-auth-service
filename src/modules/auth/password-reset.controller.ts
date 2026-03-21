import {
  Controller,
  Post,
  Get,
  Body,
  Query,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { PasswordResetService } from './password-reset.service';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';

// Routes: /api/v1/auth/password-reset/*
// No JWT required — user is not authenticated during this flow
@Controller('auth/password-reset')
export class PasswordResetController {
  constructor(private readonly passwordResetService: PasswordResetService) {}

  /**
   * POST /api/v1/auth/password-reset/request
   * User submits their email to receive a reset link.
   * Always returns 200 regardless of whether email exists.
   */
  @Post('request')
  @HttpCode(HttpStatus.OK)
  async requestReset(@Body() dto: ForgotPasswordDto) {
    return this.passwordResetService.requestReset(dto);
  }

  /**
   * GET /api/v1/auth/password-reset/validate?userId=xxx&token=yyy
   * Called when the reset page loads — checks token validity
   * before showing the new password form.
   */
  @Get('validate')
  @HttpCode(HttpStatus.OK)
  async validateToken(
    @Query('userId') userId: string,
    @Query('token') token: string,
  ) {
    return this.passwordResetService.validateResetToken(userId, token);
  }

  /**
   * POST /api/v1/auth/password-reset/reset
   * User submits new password along with their token.
   * On success: all sessions revoked, redirect to login.
   */
  @Post('reset')
  @HttpCode(HttpStatus.OK)
  async resetPassword(@Body() dto: ResetPasswordDto) {
    return this.passwordResetService.resetPassword(dto);
  }
}
