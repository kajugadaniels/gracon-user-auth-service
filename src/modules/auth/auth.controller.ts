import {
  Controller,
  Post,
  Body,
  HttpCode,
  HttpStatus,
  UseGuards,
  Req,
} from '@nestjs/common';
import { Request } from 'express';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ThrottleAuth } from '../../common/decorators/throttle.decorator';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  /**
   * POST /api/v1/auth/login
   * Strict rate limit: 5 attempts per minute per IP.
   * Prevents brute-force credential attacks.
   */
  @Post('login')
  @ThrottleAuth()
  @HttpCode(HttpStatus.OK)
  async login(@Body() dto: LoginDto, @Req() req: Request) {
    const ipAddress = this.extractIp(req);
    const userAgent = req.headers['user-agent'] ?? 'unknown';
    return this.authService.login(dto, ipAddress, userAgent);
  }

  /**
   * POST /api/v1/auth/refresh
   * Standard auth limit: 5 per minute.
   * Prevents token harvesting via rapid refresh calls.
   */
  @Post('refresh')
  @ThrottleAuth()
  @HttpCode(HttpStatus.OK)
  async refresh(@Body() dto: RefreshTokenDto, @Req() req: Request) {
    const ipAddress = this.extractIp(req);
    const userAgent = req.headers['user-agent'] ?? 'unknown';
    return this.authService.refreshTokens(dto, ipAddress, userAgent);
  }

  /**
   * POST /api/v1/auth/logout
   * General limit — not a sensitive write, but still protected globally.
   */
  @Post('logout')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  async logout(@Body() dto: RefreshTokenDto) {
    return this.authService.logout(dto.refreshToken);
  }

  /**
   * POST /api/v1/auth/logout-all
   * General limit — revokes all sessions for the authenticated user.
   */
  @Post('logout-all')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  async logoutAll(@CurrentUser() userId: string) {
    return this.authService.logoutAllDevices(userId);
  }

  private extractIp(req: Request): string {
    return (
      (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ??
      req.socket.remoteAddress ??
      'unknown'
    );
  }
}
