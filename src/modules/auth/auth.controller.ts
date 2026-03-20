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
  ApiOperation,
  ApiOkResponse,
  ApiUnauthorizedResponse,
  ApiForbiddenResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Log in and obtain access + refresh tokens',
    description: `Authenticates a user through five sequential gates. All gates must pass.

**Gate 1 — Credentials:** Email and password are validated. bcrypt constant-time comparison is used even for non-existent emails to prevent timing attacks.

**Gate 2 — Email verified:** The account must have a confirmed email address.

**Gate 3 — Account active:** The account must be active (set automatically after email verification).

**Gate 4 — ID verified:** The user must have passed the biometric ID verification step.

**Tokens issued:**
- **Access token** — JWT, valid for **15 minutes**. Include in \`Authorization: Bearer <token>\` header for protected endpoints.
- **Refresh token** — Opaque token, valid for **30 days**. Used only to obtain new token pairs. Stored hashed in the database. Rotated on every use.

**Tracking:** The request IP address and User-Agent are recorded with the refresh token for security auditing.`,
  })
  @ApiOkResponse({
    description: 'Login successful. Access and refresh tokens returned.',
    schema: {
      example: {
        success: true,
        message: 'Login successful.',
        data: {
          accessToken:
            'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJhM2YyYzFkNC04YjdlLTRmNmEtOWMyZC0xZTViM2E3ZjhkOWMiLCJlbWFpbCI6ImFtYW5pLnV3YXNlQGdtYWlsLmNvbSIsImlhdCI6MTcwMDAwMDAwMCwiZXhwIjoxNzAwMDAwOTAwfQ.signature',
          refreshToken:
            'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJhM2YyYzFkNC04YjdlLTRmNmEtOWMyZC0xZTViM2E3ZjhkOWMiLCJlbWFpbCI6ImFtYW5pLnV3YXNlQGdtYWlsLmNvbSIsImlhdCI6MTcwMDAwMDAwMCwiZXhwIjoxNzAyNTkyMDAwfQ.signature',
          user: {
            userId: 'a3f2c1d4-8b7e-4f6a-9c2d-1e5b3a7f8d9c',
            email: 'amani.uwase@gmail.com',
            phoneNumber: '+250788123456',
            imageUrl: null,
            surName: 'UWASE',
            postNames: 'Amani Grace',
            sex: 'F',
            isIdVerified: true,
            idVerifiedAt: '2024-03-15T10:30:00.000Z',
            createdAt: '2024-03-10T08:00:00.000Z',
          },
        },
      },
    },
  })
  @ApiUnauthorizedResponse({
    description: 'Invalid email or password.',
    schema: {
      example: {
        statusCode: 401,
        message: 'Invalid email or password',
        error: 'Unauthorized',
      },
    },
  })
  @ApiForbiddenResponse({
    description:
      'Credentials are correct but the account has not completed a required step (email verification or ID verification).',
    schema: {
      example: {
        statusCode: 403,
        message:
          'Identity verification required. Please complete the ID face verification step before logging in.',
        error: 'Forbidden',
      },
    },
  })
  async login(@Body() dto: LoginDto, @Req() req: Request) {
    const ipAddress = this.extractIp(req);
    const userAgent = req.headers['user-agent'] ?? 'unknown';
    return this.authService.login(dto, ipAddress, userAgent);
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Refresh the access token using a refresh token',
    description: `Exchanges a valid refresh token for a new access token and a new refresh token.

**Token rotation:** The provided refresh token is immediately revoked and replaced with a fresh one. If the same refresh token is used twice (replay attack), all tokens for that user are revoked automatically.

**Use this endpoint** before the access token expires (every ~14 minutes) to maintain a seamless session without requiring the user to log in again.`,
  })
  @ApiOkResponse({
    description: 'New token pair issued. Old refresh token is now invalid.',
    schema: {
      example: {
        success: true,
        message: 'Tokens refreshed successfully.',
        data: {
          accessToken:
            'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJhM2YyYzFkNC04YjdlLTRmNmEtOWMyZC0xZTViM2E3ZjhkOWMiLCJlbWFpbCI6ImFtYW5pLnV3YXNlQGdtYWlsLmNvbSIsImlhdCI6MTcwMDAwMDkwMCwiZXhwIjoxNzAwMDAxODAwfQ.signature',
          refreshToken:
            'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJhM2YyYzFkNC04YjdlLTRmNmEtOWMyZC0xZTViM2E3ZjhkOWMiLCJlbWFpbCI6ImFtYW5pLnV3YXNlQGdtYWlsLmNvbSIsImlhdCI6MTcwMDAwMDkwMCwiZXhwIjoxNzAyNTkyOTAwfQ.signature',
        },
      },
    },
  })
  @ApiUnauthorizedResponse({
    description:
      'Refresh token is invalid, expired, revoked, or has been used before (replay detected).',
    schema: {
      example: {
        statusCode: 401,
        message: 'Invalid or expired refresh token',
        error: 'Unauthorized',
      },
    },
  })
  async refresh(@Body() dto: RefreshTokenDto, @Req() req: Request) {
    const ipAddress = this.extractIp(req);
    const userAgent = req.headers['user-agent'] ?? 'unknown';
    return this.authService.refreshTokens(dto, ipAddress, userAgent);
  }

  @Post('logout')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth('access-token')
  @ApiOperation({
    summary: 'Log out from the current device',
    description: `Revokes the provided refresh token, ending the session on the current device.

The access token remains technically valid until its natural 15-minute expiry (JWTs cannot be revoked), but without a valid refresh token it cannot be renewed. The frontend should discard the access token immediately upon logout.

**Requires:** A valid JWT access token in the \`Authorization: Bearer\` header.`,
  })
  @ApiOkResponse({
    description: 'Refresh token revoked. Session ended on this device.',
    schema: {
      example: {
        success: true,
        message: 'Logged out successfully.',
      },
    },
  })
  @ApiUnauthorizedResponse({
    description: 'Access token is missing or invalid.',
    schema: {
      example: {
        statusCode: 401,
        message: 'Unauthorized',
        error: 'Unauthorized',
      },
    },
  })
  async logout(@Body() dto: RefreshTokenDto) {
    return this.authService.logout(dto.refreshToken);
  }

  @Post('logout-all')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth('access-token')
  @ApiOperation({
    summary: 'Log out from all devices',
    description: `Revokes **all** active refresh tokens for the authenticated user, ending every active session across all devices.

**When to use:**
- User suspects their account is compromised
- User changes their password
- User wants to force re-authentication on all devices

**Requires:** A valid JWT access token in the \`Authorization: Bearer\` header.`,
  })
  @ApiOkResponse({
    description: 'All refresh tokens revoked. User is logged out everywhere.',
    schema: {
      example: {
        success: true,
        message: 'Logged out from all devices successfully.',
        data: {
          revokedCount: 3,
        },
      },
    },
  })
  @ApiUnauthorizedResponse({
    description: 'Access token is missing or invalid.',
    schema: {
      example: {
        statusCode: 401,
        message: 'Unauthorized',
        error: 'Unauthorized',
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
