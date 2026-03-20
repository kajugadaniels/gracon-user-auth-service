import {
  Controller,
  Post,
  Body,
  HttpCode,
  HttpStatus,
  UseGuards,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

// All routes: /api/v1/auth
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  /**
   * POST /api/v1/auth/login
   * Authenticates user — all 5 gates must pass.
   * Returns access token (15min) + refresh token (30 days).
   */
  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(@Body() dto: LoginDto, @Req() req: Request) {
    const ipAddress = this.extractIp(req);
    const userAgent = req.headers['user-agent'] ?? 'unknown';
    return this.authService.login(dto, ipAddress, userAgent);
  }

  /**
   * POST /api/v1/auth/refresh
   * Issues new access + refresh tokens using a valid refresh token.
   * Old refresh token is revoked (token rotation).
   */
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(@Body() dto: RefreshTokenDto, @Req() req: Request) {
    const ipAddress = this.extractIp(req);
    const userAgent = req.headers['user-agent'] ?? 'unknown';
    return this.authService.refreshTokens(dto, ipAddress, userAgent);
  }

  /**
   * POST /api/v1/auth/logout
   * Revokes the provided refresh token.
   * Requires valid JWT — user must be authenticated to logout.
   */
  @Post('logout')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  async logout(@Body() dto: RefreshTokenDto) {
    return this.authService.logout(dto.refreshToken);
  }

  /**
   * POST /api/v1/auth/logout-all
   * Revokes ALL refresh tokens for the authenticated user.
   * Use when account is compromised or password changes.
   */
  @Post('logout-all')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  async logoutAll(@CurrentUser() userId: string) {
    return this.authService.logoutAllDevices(userId);
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  private extractIp(req: Request): string {
    return (
      (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ??
      req.socket.remoteAddress ??
      'unknown'
    );
  }
}
