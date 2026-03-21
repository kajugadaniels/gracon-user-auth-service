import {
  Controller,
  Post,
  Get,
  Patch,
  Body,
  UseInterceptors,
  UploadedFile,
  HttpCode,
  HttpStatus,
  UseGuards,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiBody,
  ApiConsumes,
  ApiResponse,
} from '@nestjs/swagger';
import { UsersService } from './users.service';
import { RegisterDto } from './dto/register.dto';
import { VerifyEmailDto } from './dto/verify-email.dto';
import { ResendVerificationDto } from './dto/resend-verification.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { profileUploadConfig } from '../../common/aws/s3/multer.config';
import {
  ThrottleAuth,
  ThrottleStrict,
} from '../../common/decorators/throttle.decorator';

@ApiTags('Users')
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  /**
   * POST /api/v1/users/register
   * Auth limit: 5 per minute.
   * Prevents mass account creation from a single IP.
   */
  @Post('register')
  @ThrottleAuth()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Create a new user account',
    description:
      'Registers a new account by linking a Rwandan National ID number to an email and password. ' +
      'The process runs 10 sequential steps in a single atomic database transaction:\n\n' +
      '1. **NID validation** — validates the 16-digit format and calls the national citizen API to fetch the citizen record\n' +
      '2. **Email uniqueness** — rejects if the email is already registered\n' +
      '3. **NID uniqueness** — rejects if the NID has already been linked to another account (SHA-256 hash comparison, preventing duplicate identities)\n' +
      '4. **Password hashing** — bcrypt with 12 rounds (~400 ms)\n' +
      '5. **NID encryption** — AES-256-CBC with a random IV; the encrypted value is stored and a SHA-256 hash is kept for lookup\n' +
      '6. **Platform ID generation** — a unique identifier in the format `YYYY` + 6 random digits + `1` (e.g. `19990384729`), encrypted and hashed\n' +
      '7. **Email verification token** — 32 bytes of cryptographic randomness; the raw token goes into the email link, the SHA-256 hash is stored (expires 24 hours)\n' +
      '8. **Atomic write** — creates `User`, `CitizenIdentity`, `PlatformId`, and `EmailVerificationToken` in one transaction\n' +
      '9. **Verification email** — dispatched asynchronously after the transaction commits\n' +
      '10. **Platform ID disclosed** — returned once at registration; access it again later via `GET /api/v1/users/profile`\n\n' +
      'The account is inactive until the email is verified via `GET /api/v1/users/verify-email`.\n\n' +
      '**Rate limit:** 5 requests per minute per IP address.',
  })
  @ApiBody({ type: RegisterDto })
  @ApiResponse({
    status: 201,
    description:
      'Account created successfully. A verification email has been sent to the provided address. ' +
      'The Platform ID shown here is the user\'s permanent identifier within this system — store it securely.',
    schema: {
      example: {
        success: true,
        message:
          'Registration successful. Please check your email to verify your account before logging in.',
        data: {
          userId: 'a3f2c1d4-8b7e-4f6a-9c2d-1e5b3a7f8d9c',
          email: 'kwizera.gervais@gmail.com',
          surName: 'KWIZERA',
          postNames: 'Gervais',
          platformId: '19990384729',
        },
      },
    },
  })
  @ApiResponse({
    status: 400,
    description:
      'Validation failed. Common causes: NID is not exactly 16 digits, NID not found in the citizen database, ' +
      'password does not meet complexity requirements, or phone number format is invalid.',
    schema: {
      example: {
        statusCode: 400,
        message: 'No citizen record found for the provided National ID number.',
      },
    },
  })
  @ApiResponse({
    status: 409,
    description:
      'Conflict — either the email address or the National ID number is already linked to an existing account.',
    schema: {
      example: {
        statusCode: 409,
        message: 'An account with this email address already exists.',
      },
    },
  })
  @ApiResponse({
    status: 429,
    description: 'Rate limit exceeded — more than 5 registration requests per minute from this IP address.',
    schema: {
      example: {
        statusCode: 429,
        message: 'ThrottlerException: Too Many Requests',
      },
    },
  })
  async register(@Body() dto: RegisterDto) {
    return this.usersService.register(dto);
  }

  /**
   * GET /api/v1/users/verify-email
   * Auth limit — clicking a link multiple times should still work,
   * but rapid automated calls are blocked.
   */
  @Get('verify-email')
  @ThrottleAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Verify an email address',
    description:
      'Activates the account associated with the `userId` and `token` embedded in the verification link ' +
      'that was emailed after registration or after `POST /api/v1/users/resend-verification`.\n\n' +
      'The server hashes the submitted raw token with SHA-256 and compares it against the stored hash ' +
      'using a constant-time comparison to prevent timing attacks.\n\n' +
      '**Verification succeeds when all of the following hold:**\n' +
      '- The token record exists for the given `userId`\n' +
      '- The token has not already been used\n' +
      '- The token was issued fewer than 24 hours ago\n\n' +
      'On success:\n' +
      '1. The user\'s `isVerified` and `isActive` flags are set to `true`\n' +
      '2. The token is marked as used (cannot be replayed)\n' +
      '3. A welcome email containing the Platform ID is dispatched\n\n' +
      'After verification, proceed to `POST /api/v1/auth/login` to obtain tokens.\n\n' +
      '**Rate limit:** 5 requests per minute per IP address.',
  })
  @ApiBody({ type: VerifyEmailDto })
  @ApiResponse({
    status: 200,
    description: 'Email verified successfully. The account is now active and the user may log in.',
    schema: {
      example: {
        success: true,
        message: 'Email verified successfully. You can now log in.',
      },
    },
  })
  @ApiResponse({
    status: 400,
    description:
      'Verification failed. Causes: token not found, token already used, or token expired (older than 24 hours). ' +
      'Use `POST /api/v1/users/resend-verification` to obtain a fresh token.',
    schema: {
      example: {
        statusCode: 400,
        message: 'This verification link has expired. Please request a new one.',
      },
    },
  })
  async verifyEmail(@Body() dto: VerifyEmailDto) {
    return this.usersService.verifyEmail(dto);
  }

  /**
   * POST /api/v1/users/resend-verification
   * Auth limit: prevents email flooding by limiting resend attempts.
   */
  @Post('resend-verification')
  @ThrottleAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Resend the email verification link',
    description:
      'Issues a new email verification token and dispatches a fresh verification email. ' +
      'Any previously unused verification token for this account is invalidated.\n\n' +
      '**Per-email rate limit:** A maximum of 3 resend requests are allowed per hour per email address. ' +
      'This is enforced server-side by inspecting the creation timestamp of the most recent token — ' +
      'not by the IP-level throttler.\n\n' +
      '**Security note:** The response is always identical regardless of whether the email is registered ' +
      'or already verified. This prevents user enumeration.\n\n' +
      '**Rate limit:** 5 requests per minute per IP address (plus the 3/hour per-email business rule).',
  })
  @ApiBody({ type: ResendVerificationDto })
  @ApiResponse({
    status: 200,
    description:
      'Request processed. If the email is registered and unverified, a new verification link has been sent.',
    schema: {
      example: {
        success: true,
        message:
          'If this email is registered and unverified, a new verification link has been sent. Please check your inbox.',
      },
    },
  })
  @ApiResponse({
    status: 400,
    description:
      'Resend limit reached — more than 3 resend requests have been made for this email address within the past hour.',
    schema: {
      example: {
        statusCode: 400,
        message: 'You have requested too many verification emails. Please wait before trying again.',
      },
    },
  })
  async resendVerification(@Body() dto: ResendVerificationDto) {
    return this.usersService.resendVerificationEmail(dto);
  }

  /**
   * GET /api/v1/users/profile
   * General limit — authenticated read, no special restriction needed.
   */
  @Get('profile')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Retrieve the authenticated user\'s profile',
    description:
      'Returns the full profile of the currently authenticated user. ' +
      'Sensitive fields (`passwordHash`, `nidEncrypted`, `pidEncrypted`) are **never** included in the response — ' +
      'they are stripped at the database query level using Prisma `select`.\n\n' +
      '**Computed fields returned:**\n' +
      '- `platformId` — decrypted in-memory from AES-256-CBC; never persisted in plaintext\n' +
      '- `profileImageUrl` — a 1-hour presigned S3 URL (not a direct S3 key); a new URL is generated on every call\n' +
      '- `profileImageExpiresAt` — the exact UTC timestamp when the presigned URL expires\n\n' +
      '**Authentication:** Full JWT access token required in `Authorization: Bearer <token>` header.',
  })
  @ApiResponse({
    status: 200,
    description: 'Profile returned successfully.',
    schema: {
      example: {
        id: 'a3f2c1d4-8b7e-4f6a-9c2d-1e5b3a7f8d9c',
        email: 'kwizera.gervais@gmail.com',
        phoneNumber: '+250788456123',
        imageUrl: 'profile-images/a3f2c1d4-8b7e-4f6a-9c2d-1e5b3a7f8d9c/photo.jpg',
        isVerified: true,
        isActive: true,
        isIdVerified: true,
        idVerifiedAt: '2024-03-15T09:22:14.000Z',
        createdAt: '2024-03-10T07:45:00.000Z',
        updatedAt: '2024-03-15T09:22:14.000Z',
        platformId: '19990384729',
        profileImageUrl:
          'https://gracon-bucket.s3.amazonaws.com/profile-images/a3f2c1d4/photo.jpg?X-Amz-Signature=abc123&X-Amz-Expires=3600',
        profileImageExpiresAt: '2024-03-20T11:00:00.000Z',
        citizenIdentity: {
          surName: 'KWIZERA',
          postNames: 'Gervais',
          sex: 'M',
          dateOfBirth: '1999-06-14T00:00:00.000Z',
          countryOfBirth: 'Rwanda',
        },
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
  // eslint-disable-next-line @typescript-eslint/require-await
  async getProfile(@CurrentUser() userId: string) {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-call
    return this.usersService.getProfile(userId);
  }

  /**
   * PATCH /api/v1/users/profile
   * General limit — authenticated write.
   */
  @Patch('profile')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Update profile email or phone number',
    description:
      'Updates one or both of the mutable profile fields: `email` and `phoneNumber`. ' +
      'All fields are optional — only the fields present in the request body are updated.\n\n' +
      '**Email change behaviour (important):**\n' +
      'Changing the email address triggers a full re-verification cycle:\n' +
      '1. `isVerified` and `isActive` are set to `false` — the account is locked immediately\n' +
      '2. A new 24-hour verification token is generated and emailed to the **new** address\n' +
      '3. The user must verify the new address before they can log in again\n\n' +
      '**Phone number** is updated directly with no side effects.\n\n' +
      'The response is the full updated profile (same shape as `GET /api/v1/users/profile`).\n\n' +
      '**Authentication:** Full JWT access token required in `Authorization: Bearer <token>` header.',
  })
  @ApiBody({ type: UpdateProfileDto })
  @ApiResponse({
    status: 200,
    description:
      'Profile updated. If the email was changed the account is now locked pending re-verification — ' +
      'the returned profile will show `isVerified: false` and `isActive: false`.',
    schema: {
      example: {
        id: 'a3f2c1d4-8b7e-4f6a-9c2d-1e5b3a7f8d9c',
        email: 'gervais.kwizera@gmail.com',
        phoneNumber: '+250788456123',
        isVerified: false,
        isActive: false,
        isIdVerified: true,
        platformId: '19990384729',
        citizenIdentity: {
          surName: 'KWIZERA',
          postNames: 'Gervais',
          sex: 'M',
          dateOfBirth: '1999-06-14T00:00:00.000Z',
          countryOfBirth: 'Rwanda',
        },
      },
    },
  })
  @ApiResponse({
    status: 401,
    description: 'Access token is missing, malformed, expired, or the account is inactive.',
    schema: {
      example: { statusCode: 401, message: 'Unauthorized' },
    },
  })
  @ApiResponse({
    status: 409,
    description: 'The new email address is already registered to a different account.',
    schema: {
      example: {
        statusCode: 409,
        message: 'An account with this email address already exists.',
      },
    },
  })
  // eslint-disable-next-line @typescript-eslint/require-await
  async updateProfile(
    @CurrentUser() userId: string,
    @Body() dto: UpdateProfileDto,
  ) {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-call
    return this.usersService.updateProfile(userId, dto);
  }

  /**
   * POST /api/v1/users/profile/image
   * General limit — file upload, validated by Multer before it reaches here.
   */
  @Post('profile/image')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @UseInterceptors(FileInterceptor('image', profileUploadConfig))
  @HttpCode(HttpStatus.OK)
  @ApiConsumes('multipart/form-data')
  @ApiOperation({
    summary: 'Upload or replace the profile photo',
    description:
      'Accepts a profile photo upload and stores it in S3 under the `profile-images/` prefix. ' +
      'If the user already has a profile photo, the **previous image is deleted from S3** before the new one is uploaded — ' +
      'there is never more than one profile image per user in storage.\n\n' +
      '**Accepted formats:** JPEG, JPG, PNG, WebP\n' +
      '**Maximum file size:** 5 MB\n\n' +
      'The raw S3 key is stored in the database. The response returns a **1-hour presigned URL** — ' +
      'not the S3 key directly. Clients must use this URL to display the image and must refresh it ' +
      'by calling `GET /api/v1/users/profile` before `profileImageExpiresAt`.\n\n' +
      '**Authentication:** Full JWT access token required in `Authorization: Bearer <token>` header.',
  })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['image'],
      properties: {
        image: {
          type: 'string',
          format: 'binary',
          description: 'Profile photo file. Accepted: JPEG, JPG, PNG, WebP. Maximum size: 5 MB.',
        },
      },
    },
  })
  @ApiResponse({
    status: 200,
    description:
      'Photo uploaded successfully. The presigned URL is valid for 1 hour. ' +
      'After expiry, retrieve a fresh URL from `GET /api/v1/users/profile`.',
    schema: {
      example: {
        profileImageUrl:
          'https://gracon-bucket.s3.amazonaws.com/profile-images/a3f2c1d4/photo.jpg?X-Amz-Signature=abc123&X-Amz-Expires=3600',
        profileImageExpiresAt: '2024-03-20T12:00:00.000Z',
      },
    },
  })
  @ApiResponse({
    status: 400,
    description:
      'Upload rejected. Causes: no file attached, file exceeds 5 MB, or MIME type is not jpeg/png/webp.',
    schema: {
      example: {
        statusCode: 400,
        message: 'Only image files (jpeg, png, webp) are allowed.',
      },
    },
  })
  @ApiResponse({
    status: 401,
    description: 'Access token is missing, malformed, expired, or the account is inactive.',
    schema: {
      example: { statusCode: 401, message: 'Unauthorized' },
    },
  })
  // eslint-disable-next-line @typescript-eslint/require-await
  async uploadProfileImage(
    @CurrentUser() userId: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-call
    return this.usersService.uploadProfileImage(userId, file);
  }

  /**
   * PATCH /api/v1/users/password
   * Strict limit: 3 per 10 minutes.
   * Password changes are high-value — same limit as password reset.
   */
  @Patch('password')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ThrottleStrict()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Change the account password',
    description:
      'Allows an authenticated user to change their password by providing their current password for identity confirmation.\n\n' +
      '**Validation sequence:**\n' +
      '1. `currentPassword` is verified against the stored bcrypt hash (timing-safe comparison)\n' +
      '2. `newPassword` and `confirmNewPassword` must match\n' +
      '3. `newPassword` must differ from `currentPassword` (same password rejected)\n' +
      '4. `newPassword` must meet complexity requirements\n\n' +
      '**After a successful change:**\n' +
      '- The new password is hashed with bcrypt (12 rounds)\n' +
      '- **All active refresh tokens across all devices are revoked** — every device must re-login\n\n' +
      'This is intentional security behaviour: a password change is a high-severity event and any ' +
      'pre-existing session that an attacker may have obtained is immediately invalidated.\n\n' +
      '**Authentication:** Full JWT access token required in `Authorization: Bearer <token>` header.\n\n' +
      '**Rate limit:** 3 requests per 10 minutes per IP address.',
  })
  @ApiBody({ type: ChangePasswordDto })
  @ApiResponse({
    status: 200,
    description:
      'Password changed successfully. All existing sessions on all devices have been revoked. ' +
      'The user must log in again with the new password.',
    schema: {
      example: {
        success: true,
        message: 'Password changed successfully. Please log in again.',
      },
    },
  })
  @ApiResponse({
    status: 400,
    description:
      'Password change rejected. Causes: current password is wrong, passwords do not match, ' +
      'new password does not meet complexity requirements, or new password is the same as the current one.',
    schema: {
      example: {
        statusCode: 400,
        message: 'Current password is incorrect.',
      },
    },
  })
  @ApiResponse({
    status: 401,
    description: 'Access token is missing, malformed, expired, or the account is inactive.',
    schema: {
      example: { statusCode: 401, message: 'Unauthorized' },
    },
  })
  @ApiResponse({
    status: 429,
    description: 'Rate limit exceeded — more than 3 password-change attempts per 10 minutes from this IP.',
    schema: {
      example: {
        statusCode: 429,
        message: 'ThrottlerException: Too Many Requests',
      },
    },
  })
  // eslint-disable-next-line @typescript-eslint/require-await
  async changePassword(
    @CurrentUser() userId: string,
    @Body() dto: ChangePasswordDto,
  ) {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-call
    return this.usersService.changePassword(userId, dto);
  }
}
