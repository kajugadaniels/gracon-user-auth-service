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
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiBody,
  ApiResponse,
} from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import {
  ThrottleAuth,
  ThrottleGeneral,
} from '../../common/decorators/throttle.decorator';

@ApiTags('Auth')
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
  @ApiOperation({
    summary: 'Authenticate a user',
    description:
      'Validates credentials against five sequential security gates:\n\n' +
      '1. **User exists** — email must be registered in the system\n' +
      '2. **Password valid** — bcrypt comparison (12 rounds, ~400 ms deliberate delay)\n' +
      '3. **Email verified** — the account must have completed email verification\n' +
      '4. **Account active** — the account must not be suspended or deactivated\n' +
      '5. **ID verification status** — determines which token type is issued\n\n' +
      'If the user\'s National ID has **not** yet been verified a **limited** access token is issued ' +
      '(2-hour expiry) that only unlocks `GET /api/v1/verification/status` and `POST /api/v1/verification/submit`. ' +
      'Once ID verification passes, a **full** access token (15-minute expiry) with unrestricted access is issued.\n\n' +
      'A dummy bcrypt comparison always runs regardless of whether the user exists, ' +
      'eliminating response-time differences that could reveal valid email addresses (timing-attack prevention).\n\n' +
      '**Rate limit:** 5 requests per minute per IP address.',
  })
  @ApiBody({ type: LoginDto })
  @ApiResponse({
    status: 200,
    description:
      'Authentication successful. `tokenType` is `"full"` when the user\'s ID is verified, or `"limited"` when ID verification is still pending.',
    schema: {
      example: {
        success: true,
        message: 'Login successful.',
        tokenType: 'full',
        data: {
          accessToken:
            'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiJhM2YyYzFkNC04YjdlLTRmNmEtOWMyZC0xZTViM2E3ZjhkOWMiLCJlbWFpbCI6Imt3aXplcmEuZ2VydmFpc0BnbWFpbC5jb20iLCJ0b2tlblR5cGUiOiJmdWxsIiwiaWF0IjoxNzExMDAwMDAwLCJleHAiOjE3MTEwMDA5MDB9.signature',
          refreshToken:
            'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiJhM2YyYzFkNC04YjdlLTRmNmEtOWMyZC0xZTViM2E3ZjhkOWMiLCJpYXQiOjE3MTEwMDAwMDAsImV4cCI6MTcxMzU5MjAwMH0.signature',
          user: {
            id: 'a3f2c1d4-8b7e-4f6a-9c2d-1e5b3a7f8d9c',
            email: 'kwizera.gervais@gmail.com',
            surName: 'KWIZERA',
            postNames: 'Gervais',
            isIdVerified: true,
            idVerifiedAt: '2024-03-15T09:22:14.000Z',
          },
        },
      },
    },
  })
  @ApiResponse({
    status: 401,
    description:
      'Authentication failed. Returned when any gate fails (user not found, wrong password, email not verified, account inactive). ' +
      'The message is intentionally generic — the exact failing gate is never disclosed to prevent user enumeration.',
    schema: {
      example: {
        statusCode: 401,
        message: 'Invalid email or password.',
      },
    },
  })
  @ApiResponse({
    status: 429,
    description: 'Rate limit exceeded — more than 5 login attempts per minute from this IP address.',
    schema: {
      example: {
        statusCode: 429,
        message: 'ThrottlerException: Too Many Requests',
      },
    },
  })
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
  @ApiOperation({
    summary: 'Rotate a refresh token',
    description:
      'Exchanges a valid refresh token for a brand-new access token + refresh token pair. ' +
      'Implements **single-use token rotation** — the submitted token is revoked immediately upon receipt ' +
      'and a new pair is issued in its place. Storing the previous token after a successful refresh will cause ' +
      'the next call to fail with 401.\n\n' +
      '**Replay-attack detection:** If a token that has already been revoked is submitted ' +
      '(a strong signal of token theft), **all** refresh tokens for that user are immediately invalidated, ' +
      'forcing a full re-login on every device.\n\n' +
      '| Token | Lifetime |\n' +
      '|-------|----------|\n' +
      '| Access token (full) | 15 minutes |\n' +
      '| Access token (limited) | 2 hours |\n' +
      '| Refresh token | 30 days |\n\n' +
      '**Rate limit:** 5 requests per minute per IP address.',
  })
  @ApiBody({ type: RefreshTokenDto })
  @ApiResponse({
    status: 200,
    description:
      'Token rotation successful. The submitted refresh token is now permanently revoked. ' +
      'Replace both tokens stored on the client with the new values returned here.',
    schema: {
      example: {
        accessToken:
          'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiJhM2YyYzFkNC04YjdlLTRmNmEtOWMyZC0xZTViM2E3ZjhkOWMiLCJlbWFpbCI6Imt3aXplcmEuZ2VydmFpc0BnbWFpbC5jb20iLCJ0b2tlblR5cGUiOiJmdWxsIiwiaWF0IjoxNzExMDAwOTAwLCJleHAiOjE3MTEwMDE4MDB9.signature',
        refreshToken:
          'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiJhM2YyYzFkNC04YjdlLTRmNmEtOWMyZC0xZTViM2E3ZjhkOWMiLCJpYXQiOjE3MTEwMDA5MDAsImV4cCI6MTcxMzU5MjkwMH0.signature',
        tokenType: 'full',
      },
    },
  })
  @ApiResponse({
    status: 401,
    description:
      'Refresh token is invalid, expired, already used, or belongs to a deactivated account. ' +
      'If this is returned for a token that was recently valid, re-authenticate via `POST /api/v1/auth/login`.',
    schema: {
      example: {
        statusCode: 401,
        message: 'Invalid or expired refresh token.',
      },
    },
  })
  @ApiResponse({
    status: 429,
    description: 'Rate limit exceeded — more than 5 refresh requests per minute from this IP address.',
    schema: {
      example: {
        statusCode: 429,
        message: 'ThrottlerException: Too Many Requests',
      },
    },
  })
  async refresh(@Body() dto: RefreshTokenDto, @Req() req: Request) {
    const ipAddress = this.extractIp(req);
    const userAgent = req.headers['user-agent'] ?? 'unknown';
    return this.authService.refreshTokens(dto, ipAddress, userAgent);
  }

  /**
   * POST /api/v1/auth/logout
   * General limit — not a sensitive write, but still protected globally.
   * Explicitly scoped to prevent strict/auth throttlers from applying.
   */
  @Post('logout')
  @ThrottleGeneral()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Log out from the current device',
    description:
      'Revokes the submitted refresh token, ending the session for the device that holds it. ' +
      'The access token continues to be valid until its natural expiry (maximum 15 minutes for full tokens) — ' +
      'there is no server-side access token revocation. The client must discard both tokens from memory immediately.\n\n' +
      'To invalidate sessions on **every** device at once, use `POST /api/v1/auth/logout-all`.\n\n' +
      '**Authentication:** Full JWT access token required in `Authorization: Bearer <token>` header.',
  })
  @ApiBody({ type: RefreshTokenDto })
  @ApiResponse({
    status: 200,
    description: 'Logout successful. The submitted refresh token is now permanently revoked.',
    schema: {
      example: {
        success: true,
        message: 'Logged out successfully.',
      },
    },
  })
  @ApiResponse({
    status: 401,
    description: 'Access token is missing, malformed, expired, or the account is inactive.',
    schema: {
      example: {
        statusCode: 401,
        message: 'Unauthorized',
      },
    },
  })
  async logout(@Body() dto: RefreshTokenDto) {
    return this.authService.logout(dto.refreshToken);
  }

  /**
   * POST /api/v1/auth/logout-all
   * General limit — revokes all sessions for the authenticated user.
   * Explicitly scoped to prevent strict/auth throttlers from applying.
   */
  @Post('logout-all')
  @ThrottleGeneral()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Log out from all devices',
    description:
      'Revokes **every** refresh token associated with the authenticated user\'s account simultaneously. ' +
      'This is the "sign out everywhere" action — useful after a suspected account compromise or ' +
      'after changing a password from a new device.\n\n' +
      'Devices that still hold valid access tokens will continue to work for up to 15 minutes ' +
      '(the maximum access token lifetime) before being forced to re-authenticate.\n\n' +
      '**Authentication:** Full JWT access token required in `Authorization: Bearer <token>` header.',
  })
  @ApiResponse({
    status: 200,
    description:
      'All sessions revoked. Every device that held a refresh token for this account is now logged out.',
    schema: {
      example: {
        success: true,
        message: 'Logged out from all devices successfully.',
      },
    },
  })
  @ApiResponse({
    status: 401,
    description: 'Access token is missing, malformed, expired, or the account is inactive.',
    schema: {
      example: {
        statusCode: 401,
        message: 'Unauthorized',
      },
    },
  })
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
