import {
  Controller,
  Post,
  Body,
  HttpCode,
  HttpStatus,
  Get,
  Patch,
  Query,
  UseGuards,
  UseInterceptors,
  UploadedFile,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiTags,
  ApiOperation,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiUnauthorizedResponse,
  ApiConsumes,
  ApiBody,
  ApiQuery,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { profileUploadConfig } from '../../common/aws/s3/multer.config';
import { UsersService } from './users.service';
import { RegisterDto } from './dto/register.dto';
import { VerifyEmailDto } from './dto/verify-email.dto';
import { ResendVerificationDto } from './dto/resend-verification.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { ChangePasswordDto } from './dto/change-password.dto';

@ApiTags('Users')
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Register a new user account',
    description: `Creates a new user account using a verified National ID number.

**Registration flow (all steps run atomically):**
1. Validates the NID format and fetches citizen data from the national ID API
2. Checks that the email address is not already registered
3. Checks that the NID is not already registered (via stored hash — the NID is never stored in plain text)
4. Hashes the password with bcrypt (cost factor 12)
5. Encrypts the NID with AES-256-CBC
6. Generates a unique Platform ID (PID) and encrypts it
7. Generates a SHA-256 email verification token
8. Persists all data in a single database transaction — if any step fails, everything is rolled back
9. Sends a verification email with a 24-hour expiry link

**The Platform ID** is returned once in the registration response and is never available again in plain text. Users should save it.

**Note:** The account is not active until the email is verified.`,
  })
  @ApiCreatedResponse({
    description: 'Account created successfully. Verification email sent.',
    schema: {
      example: {
        success: true,
        message:
          'Registration successful. Please check your email to verify your account.',
        data: {
          userId: 'a3f2c1d4-8b7e-4f6a-9c2d-1e5b3a7f8d9c',
          email: 'amani.uwase@gmail.com',
          surName: 'UWASE',
          postNames: 'Amani Grace',
          platformId: '19980412839421',
        },
      },
    },
  })
  @ApiBadRequestResponse({
    description:
      'Validation failed — one or more fields are missing or invalid.',
    schema: {
      example: {
        statusCode: 400,
        message: [
          'National ID number must be exactly 16 digits',
          'Please provide a valid email address',
          'Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character (@$!%*?&^#)',
        ],
        error: 'Bad Request',
      },
    },
  })
  @ApiConflictResponse({
    description:
      'An account with this email address or National ID already exists.',
    schema: {
      example: {
        statusCode: 409,
        message: 'An account with this email address already exists',
        error: 'Conflict',
      },
    },
  })
  async register(@Body() dto: RegisterDto) {
    return this.usersService.register(dto);
  }

  @Get('verify-email')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Verify a user email address',
    description: `Activates a user account by verifying the token from the email link.

**How it works:**
- The user receives an email with a link containing \`userId\` and \`token\` as query parameters
- The browser opens this URL as a GET request (standard link-click behaviour)
- The raw token is hashed and compared against the stored token hash
- If valid and not expired, the account is activated (\`isVerified = true\`, \`isActive = true\`)
- A welcome email is sent with the user's Platform ID

**Token rules:**
- Expires after **24 hours**
- Single-use — cannot be used again after successful verification
- Invalidated if a resend is requested (replaced by a new token)`,
  })
  @ApiQuery({
    name: 'userId',
    description: 'The user UUID from the verification link.',
    example: 'a3f2c1d4-8b7e-4f6a-9c2d-1e5b3a7f8d9c',
  })
  @ApiQuery({
    name: 'token',
    description: 'The raw 64-character hex verification token from the link.',
    example:
      'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2',
  })
  @ApiOkResponse({
    description: 'Email verified and account activated.',
    schema: {
      example: {
        success: true,
        message: 'Email verified successfully. Your account is now active.',
      },
    },
  })
  @ApiBadRequestResponse({
    description: 'Token is invalid, expired, or already used.',
    schema: {
      example: {
        statusCode: 400,
        message: 'This verification link has expired. Please request a new one.',
        error: 'Bad Request',
      },
    },
  })
  async verifyEmail(@Query() dto: VerifyEmailDto) {
    return this.usersService.verifyEmail(dto);
  }

  @Post('resend-verification')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Resend the email verification link',
    description: `Generates a new verification token and resends the verification email.

**Rate limiting:** Maximum **3 requests per hour** per email address.

**Security:** This endpoint always returns the same success response regardless of whether the email is registered or already verified. This prevents user enumeration attacks — an attacker cannot determine whether an email address is registered by calling this endpoint.

**Token behaviour:** Issuing a new token invalidates any previously issued token for that user.`,
  })
  @ApiOkResponse({
    description:
      'Always returns success — even if the email is not registered or already verified.',
    schema: {
      example: {
        success: true,
        message:
          'If this email is registered and unverified, a new verification email has been sent.',
      },
    },
  })
  @ApiBadRequestResponse({
    description: 'Provided value is not a valid email address.',
    schema: {
      example: {
        statusCode: 400,
        message: ['Please provide a valid email address'],
        error: 'Bad Request',
      },
    },
  })
  async resendVerification(@Body() dto: ResendVerificationDto) {
    return this.usersService.resendVerificationEmail(dto);
  }

  // ─── Authenticated profile endpoints ──────────────────────────────────────

  @Get('profile')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Get the authenticated user\'s profile',
    description: `Returns the full safe profile for the currently authenticated user.

**Includes:**
- Basic account info (email, phone, verification status)
- Citizen identity (name, sex, date of birth, country of birth)
- Decrypted Platform ID (only the value — never the ciphertext)
- A 1-hour presigned URL for the profile image (if one has been uploaded)

**Never returns:** passwordHash, nidEncrypted, pidEncrypted`,
  })
  @ApiOkResponse({
    description: 'User profile returned successfully.',
    schema: {
      example: {
        id: 'a3f2c1d4-8b7e-4f6a-9c2d-1e5b3a7f8d9c',
        email: 'amani.uwase@gmail.com',
        phoneNumber: '+250788123456',
        isVerified: true,
        isActive: true,
        isIdVerified: true,
        idVerifiedAt: '2024-03-01T10:00:00.000Z',
        platformId: '19980412839421',
        profileImageUrl: 'https://s3.amazonaws.com/bucket/profile-images/...',
        profileImageExpiresAt: '2024-03-01T11:00:00.000Z',
        citizenIdentity: {
          surName: 'UWASE',
          postNames: 'Amani Grace',
          sex: 'F',
          dateOfBirth: '1998-04-12T00:00:00.000Z',
          countryOfBirth: 'RW',
        },
      },
    },
  })
  @ApiUnauthorizedResponse({ description: 'JWT missing or invalid.' })
  async getProfile(@CurrentUser() userId: string) {
    return this.usersService.getProfile(userId);
  }

  @Patch('profile')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Update phone number or email',
    description: `Updates mutable profile fields.

**Phone number** is updated immediately.

**Email change** locks the account until the new address is verified:
- \`isVerified\` and \`isActive\` are set to \`false\`
- A new 24-hour verification email is sent to the new address
- The user must re-verify before they can log in again

Throws **409 Conflict** if the new email is already taken by another account.`,
  })
  @ApiOkResponse({ description: 'Profile updated. Full safe profile returned.' })
  @ApiBadRequestResponse({ description: 'Validation failed.' })
  @ApiConflictResponse({ description: 'New email already in use.' })
  @ApiUnauthorizedResponse({ description: 'JWT missing or invalid.' })
  async updateProfile(
    @CurrentUser() userId: string,
    @Body() dto: UpdateProfileDto,
  ) {
    return this.usersService.updateProfile(userId, dto);
  }

  @Post('profile/image')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  @UseInterceptors(FileInterceptor('image', profileUploadConfig))
  @ApiBearerAuth()
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    description: 'Profile image upload. Accepted types: JPEG, PNG, WebP. Max size: 3 MB.',
    schema: {
      type: 'object',
      properties: {
        image: {
          type: 'string',
          format: 'binary',
        },
      },
      required: ['image'],
    },
  })
  @ApiOperation({
    summary: 'Upload or replace the profile image',
    description: `Uploads a new profile photo.

- If a previous image exists, it is **deleted from S3** before the new one is uploaded.
- Accepted formats: **JPEG, PNG, WebP**
- Maximum file size: **3 MB**
- Returns a **presigned URL** (valid 1 hour) so the client can display the new image immediately.

The raw S3 key is never exposed — only the temporary presigned URL.`,
  })
  @ApiOkResponse({
    description: 'Image uploaded. Presigned URL returned.',
    schema: {
      example: {
        profileImageUrl: 'https://s3.amazonaws.com/bucket/profile-images/...',
        profileImageExpiresAt: '2024-03-01T11:00:00.000Z',
      },
    },
  })
  @ApiBadRequestResponse({ description: 'No file provided, wrong type, or file too large.' })
  @ApiUnauthorizedResponse({ description: 'JWT missing or invalid.' })
  async uploadProfileImage(
    @CurrentUser() userId: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.usersService.uploadProfileImage(userId, file);
  }

  @Patch('password')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Change the account password',
    description: `Securely changes the user's password.

**Requirements:**
- \`currentPassword\` must match the stored bcrypt hash
- \`newPassword\` must satisfy the strength policy (8–128 chars, upper + lower + digit + special)
- \`confirmNewPassword\` must be identical to \`newPassword\`
- New password must differ from the current one

**Security effect:** All active refresh tokens are revoked immediately after the password is changed, forcing a re-login on every other device.`,
  })
  @ApiOkResponse({
    description: 'Password changed and all refresh tokens revoked.',
    schema: {
      example: {
        success: true,
        message: 'Password changed successfully. You have been signed out of all other devices.',
      },
    },
  })
  @ApiBadRequestResponse({ description: 'Passwords do not match or strength policy not met.' })
  @ApiUnauthorizedResponse({ description: 'Current password is incorrect or JWT invalid.' })
  async changePassword(
    @CurrentUser() userId: string,
    @Body() dto: ChangePasswordDto,
  ) {
    return this.usersService.changePassword(userId, dto);
  }
}
