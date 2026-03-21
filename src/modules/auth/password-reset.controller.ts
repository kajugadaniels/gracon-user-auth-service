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
import {
  ThrottleAuth,
  ThrottleStrict,
} from '../../common/decorators/throttle.decorator';

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
  async resetPassword(@Body() dto: ResetPasswordDto) {
    return this.passwordResetService.resetPassword(dto);
  }
}
