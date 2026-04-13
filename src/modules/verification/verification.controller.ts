import {
  Controller,
  Post,
  Get,
  Body,
  UseInterceptors,
  UploadedFiles,
  HttpCode,
  HttpStatus,
  BadRequestException,
  Req,
  UseGuards,
} from '@nestjs/common';
import { FileFieldsInterceptor } from '@nestjs/platform-express';
import type { Request } from 'express';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiConsumes,
  ApiBody,
  ApiResponse,
} from '@nestjs/swagger';
import { VerificationService } from './verification.service';
import { SubmitVerificationDto } from './dto/submit-verification.dto';
import { verificationUploadConfig } from '../../common/aws/s3/multer.config';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RequireTokenType } from '../../common/decorators/token-type.decorator';
import {
  ThrottleStrict,
  SkipThrottle,
} from '../../common/decorators/throttle.decorator';

interface UploadedVerificationFiles {
  idCard?: Express.Multer.File[];
  selfie?: Express.Multer.File[];
}

@ApiTags('Verification')
@ApiBearerAuth()
@Controller('verification')
@UseGuards(JwtAuthGuard)
@RequireTokenType('any') // limited and full tokens both accepted here
export class VerificationController {
  constructor(private readonly verificationService: VerificationService) {}

  /**
   * POST /api/v1/verification/submit
   * Strict limit: 3 per 10 minutes per IP.
   * Each submission calls AWS Rekognition — has a real cost.
   * Also mirrors the business rule of max 3 attempts per day.
   */
  @Post('submit')
  @ThrottleStrict()
  @HttpCode(HttpStatus.OK)
  @ApiConsumes('multipart/form-data')
  @ApiOperation({
    summary: 'Submit ID card and selfie for identity verification',
    description:
      'Runs a full biometric identity verification by comparing the user\'s selfie against the photo on their National ID card ' +
      'and checking face liveness. Accepts both **limited** and **full** JWT tokens — this is the endpoint ' +
      'a freshly registered user (with a limited token) calls to upgrade their account to full access.\n\n' +
      '**Seven-step processing pipeline:**\n' +
      '1. **Gate checks** — user must exist, email must be verified, account must be active, and not yet ID-verified\n' +
      '2. **Attempt limit** — maximum 3 attempts per 24-hour window (hard business rule); remaining count returned in every response\n' +
      '3. **NID match** — the submitted `documentNumber` is compared against the AES-256-CBC encrypted NID stored at registration; ' +
      'the raw NID is never forwarded to the verification engine\n' +
      '4. **Parallel S3 upload** — both images are uploaded simultaneously to `verification-temp/` in S3\n' +
      '5. **Engine call** — the internal FastAPI engine receives the S3 keys and a `document_match` boolean; ' +
      'it runs AWS Rekognition face comparison + liveness detection (45-second timeout)\n' +
      '6. **Audit log** — every attempt (pass or fail) is recorded with scores, IP address, and attempt number\n' +
      '7. **S3 cleanup** — both images are **permanently deleted** from S3 regardless of outcome; no biometric data is retained\n\n' +
      '**On verification pass:**\n' +
      '- User\'s `isIdVerified` flag is set to `true`\n' +
      '- All limited tokens are revoked\n' +
      '- A new **full** access token + refresh token pair is issued and returned in `upgradedTokens`\n\n' +
      '**Score fields (all values between 0.0 and 1.0):**\n' +
      '| Field | Meaning |\n' +
      '|-------|---------|\n' +
      '| `faceScore` | Similarity between selfie and ID card photo (AWS Rekognition) |\n' +
      '| `livenessScore` | Confidence that the selfie is a live person, not a photo |\n' +
      '| `documentMatch` | 1.0 if `documentNumber` matched stored NID, 0.0 otherwise |\n' +
      '| `compositeScore` | Weighted combination of all three scores |\n\n' +
      '**Authentication:** Limited or full JWT access token accepted.\n\n' +
      '**Rate limit:** 3 requests per 10 minutes per IP address.',
  })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['documentNumber', 'idCard', 'selfie'],
      properties: {
        documentNumber: {
          type: 'string',
          minLength: 16,
          maxLength: 16,
          pattern: '^\\d{16}$',
          description:
            'The 16-digit Rwanda National ID number. Must match the NID provided at registration. ' +
            'Compared server-side against the encrypted stored value — never sent to the verification engine.',
          example: '1199901234567890',
        },
        idCard: {
          type: 'string',
          format: 'binary',
          description:
            'A clear photo of the front face of the Rwanda National ID card. ' +
            'Accepted formats: JPEG, JPG, PNG, WebP. Maximum size: 5 MB. ' +
            'The photo must be well-lit, in focus, and the full card must be visible.',
        },
        selfie: {
          type: 'string',
          format: 'binary',
          description:
            'A live selfie photo of the applicant\'s face taken at the time of submission. ' +
            'Accepted formats: JPEG, JPG, PNG, WebP. Maximum size: 5 MB. ' +
            'The face must be clearly visible, unobstructed, and the photo must represent a live person ' +
            '(liveness is verified by the engine).',
        },
      },
    },
  })
  @ApiResponse({
    status: 200,
    description:
      'Verification attempt processed. Check the `passed` field to determine the outcome. ' +
      'If `passed` is `true`, the `upgradedTokens` field contains a new full-access token pair — ' +
      'replace the client\'s current tokens immediately.',
    schema: {
      example: {
        success: true,
        passed: true,
        compositeScore: 0.94,
        faceScore: 0.97,
        livenessScore: 0.98,
        documentMatch: 1.0,
        message: 'Identity verification passed. Your account now has full access.',
        attemptsUsed: 1,
        attemptsRemaining: 2,
        idInfo: {
          fullName: 'KWIZERA Gervais',
          dateOfBirth: '1999-06-14',
          documentNumber: '1199901234567890',
        },
        upgradedTokens: {
          accessToken:
            'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiJhM2YyYzFkNC04YjdlLTRmNmEtOWMyZC0xZTViM2E3ZjhkOWMiLCJlbWFpbCI6Imt3aXplcmEuZ2VydmFpc0BnbWFpbC5jb20iLCJ0b2tlblR5cGUiOiJmdWxsIiwiaWF0IjoxNzExMDAwMDAwLCJleHAiOjE3MTEwMDA5MDB9.signature',
          refreshToken:
            'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiJhM2YyYzFkNC04YjdlLTRmNmEtOWMyZC0xZTViM2E3ZjhkOWMiLCJpYXQiOjE3MTEwMDAwMDAsImV4cCI6MTcxMzU5MjAwMH0.signature',
          tokenType: 'full',
        },
      },
    },
  })
  @ApiResponse({
    status: 200,
    description:
      'Verification attempt processed but did **not** pass. ' +
      '`passed` is `false`. `failReason` describes why. The user may retry up to the attempt limit.',
    schema: {
      example: {
        success: true,
        passed: false,
        compositeScore: 0.41,
        faceScore: 0.38,
        livenessScore: 0.88,
        documentMatch: 1.0,
        message: 'Identity verification did not pass. Please try again with clearer photos.',
        failReason: 'Face similarity score below required threshold.',
        attemptsUsed: 2,
        attemptsRemaining: 1,
        upgradedTokens: null,
      },
    },
  })
  @ApiResponse({
    status: 400,
    description:
      'Submission rejected before the engine is called. Common causes: ' +
      'missing `idCard` or `selfie` file, `documentNumber` does not match the one registered at sign-up, ' +
      'or account preconditions not met (email unverified, account inactive, or already ID-verified).',
    schema: {
      example: {
        statusCode: 400,
        message:
          'The National ID number does not match the one used during registration.',
      },
    },
  })
  @ApiResponse({
    status: 403,
    description:
      'The 3-attempt daily limit has been reached. The user must wait until 24 hours have elapsed since their first attempt today.',
    schema: {
      example: {
        statusCode: 403,
        message:
          'You have reached the maximum number of verification attempts for today. Please try again tomorrow.',
      },
    },
  })
  @ApiResponse({
    status: 401,
    description: 'Access token is missing, malformed, or expired.',
    schema: {
      example: { statusCode: 401, message: 'Unauthorized' },
    },
  })
  @ApiResponse({
    status: 429,
    description: 'Rate limit exceeded — more than 3 submission requests per 10 minutes from this IP.',
    schema: {
      example: {
        statusCode: 429,
        message: 'ThrottlerException: Too Many Requests',
      },
    },
  })
  async submitVerification(
    @UploadedFiles() files: UploadedVerificationFiles,
    @Body() dto: SubmitVerificationDto,
    @CurrentUser() userId: string,
    @Req() req: Request,
  ) {
    if (!files?.idCard?.[0]) {
      throw new BadRequestException('ID card image is required.');
    }
    if (!files?.selfie?.[0]) {
      throw new BadRequestException('Selfie image is required.');
    }

    const ipAddress =
      (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ??
      req.socket.remoteAddress ??
      'unknown';

    return this.verificationService.submitVerification(
      userId,
      dto.documentNumber,
      files.idCard[0],
      files.selfie[0],
      ipAddress,
      dto.challengeMode === 'INVITATION' ? 'INVITATION' : 'STANDARD',
    );
  }

  /**
   * GET /api/v1/verification/status
   * Skip throttle — this is a lightweight read used by the frontend
   * on every page load of the verify-identity page. Throttling it
   * would cause UX issues without any security benefit.
   */
  @Get('status')
  @SkipThrottle()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Get the current verification status and attempt count',
    description:
      'Returns a lightweight summary of the authenticated user\'s ID verification state. ' +
      'Designed to be called on every page load of the verification UI — it is deliberately excluded ' +
      'from rate limiting because throttling a status read would degrade UX with no security benefit.\n\n' +
      '**Fields explained:**\n' +
      '| Field | Type | Meaning |\n' +
      '|-------|------|---------|\n' +
      '| `isIdVerified` | boolean | Whether the user has passed ID verification |\n' +
      '| `attemptsUsed` | number | Number of attempts made within the current 24-hour window |\n' +
      '| `attemptsRemaining` | number | How many more attempts are available today (max 3 per 24 h) |\n' +
      '| `canAttempt` | boolean | `true` if `attemptsRemaining > 0` and account is not yet verified |\n' +
      '| `lastAttemptAt` | string \\| null | ISO timestamp of the most recent submission, or `null` if none |\n\n' +
      '**Authentication:** Limited or full JWT access token accepted (same as `POST /submit`).',
  })
  @ApiResponse({
    status: 200,
    description: 'Status returned successfully.',
    schema: {
      example: {
        isIdVerified: false,
        attemptsUsed: 1,
        attemptsRemaining: 2,
        canAttempt: true,
        lastAttemptAt: '2024-03-19T14:33:07.000Z',
      },
    },
  })
  @ApiResponse({
    status: 200,
    description: 'User has already passed verification — no further attempts needed.',
    schema: {
      example: {
        isIdVerified: true,
        attemptsUsed: 1,
        attemptsRemaining: 2,
        canAttempt: false,
        lastAttemptAt: '2024-03-15T09:22:10.000Z',
      },
    },
  })
  @ApiResponse({
    status: 401,
    description: 'Access token is missing, malformed, or expired.',
    schema: {
      example: { statusCode: 401, message: 'Unauthorized' },
    },
  })
  async getStatus(@CurrentUser() userId: string) {
    return this.verificationService.getVerificationStatus(userId);
  }
}
