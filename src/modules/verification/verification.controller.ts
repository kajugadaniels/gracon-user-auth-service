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
} from '@nestjs/common';
import { FileFieldsInterceptor } from '@nestjs/platform-express';
import type { Request } from 'express';
import {
  ApiTags,
  ApiOperation,
  ApiOkResponse,
  ApiUnauthorizedResponse,
  ApiForbiddenResponse,
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiConsumes,
  ApiBody,
} from '@nestjs/swagger';
import { VerificationService } from './verification.service';
import { SubmitVerificationDto } from './dto/submit-verification.dto';
import { verificationUploadConfig } from '../../common/aws/s3/multer.config';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { UseGuards } from '@nestjs/common';

interface UploadedVerificationFiles {
  idCard?: Express.Multer.File[];
  selfie?: Express.Multer.File[];
}

@ApiTags('Verification')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard)
@Controller('verification')
export class VerificationController {
  constructor(private readonly verificationService: VerificationService) {}

  @Post('submit')
  @HttpCode(HttpStatus.OK)
  @ApiConsumes('multipart/form-data')
  @ApiOperation({
    summary: 'Submit biometric ID verification',
    description: `Performs a full identity verification check using the user's ID card photo, a live selfie, and their National ID number.

**Prerequisites:**
- The user must be logged in (valid JWT)
- The user's email must be verified
- The user must NOT have already passed verification

**Verification flow:**
1. **Document check** — The typed NID is decrypted and compared against the stored encrypted NID. This check happens entirely within the API — the raw NID is never sent to the engine.
2. **Image upload** — Both images are uploaded to a private S3 bucket (temp folder).
3. **Engine call** — The FastAPI verification engine receives only the S3 keys. It pulls the images directly from S3 and runs:
   - Face similarity (ID card photo vs selfie)
   - Liveness detection (prevents photo spoofing)
4. **Result stored** — Every attempt is written to an audit log regardless of outcome.
5. **Cleanup** — Both images are deleted from S3 immediately after the engine responds. Images are **never stored permanently**.
6. **Account update** — If passed, \`isIdVerified\` is set to \`true\` and the user can now log in.

**Scoring:**
- \`faceScore\` — AWS Rekognition CompareFaces similarity (0–100)
- \`livenessScore\` — AWS Rekognition FaceLiveness confidence (0–100)
- \`compositeScore\` — Weighted final score (0–100). Must be ≥ 80 AND documentMatch must be true to pass.

**Attempt limits:** Maximum **3 attempts per 24-hour window**. After 3 failures the user must wait before trying again.

**Accepted image formats:** JPEG, PNG, WebP. Maximum size: **5 MB** per image.`,
  })
  @ApiBody({
    description: 'Multipart form with two image files and the NID string.',
    schema: {
      type: 'object',
      required: ['idCard', 'selfie', 'documentNumber'],
      properties: {
        idCard: {
          type: 'string',
          format: 'binary',
          description:
            'A clear photo of the front of the National ID card. JPEG, PNG, or WebP. Max 5 MB.',
        },
        selfie: {
          type: 'string',
          format: 'binary',
          description:
            'A live selfie photo of the user face. Must be taken in good lighting. JPEG, PNG, or WebP. Max 5 MB.',
        },
        documentNumber: {
          type: 'string',
          description: 'The 16-digit National ID number.',
          example: '1199880012345678',
        },
      },
    },
  })
  @ApiOkResponse({
    description: 'Verification completed. Check `passed` field for outcome.',
    schema: {
      example: {
        success: true,
        passed: true,
        compositeScore: 91.4,
        faceScore: 94.2,
        livenessScore: 98.7,
        documentMatch: true,
        message: 'Identity verification successful. You can now log in.',
        failReason: null,
        attemptsUsed: 1,
        attemptsRemaining: 2,
      },
    },
  })
  @ApiBadRequestResponse({
    description: 'A required file is missing or the NID format is invalid.',
    schema: {
      example: {
        statusCode: 400,
        message:
          'ID card image is required. Please upload a clear photo of your ID card.',
        error: 'Bad Request',
      },
    },
  })
  @ApiUnauthorizedResponse({
    description: 'JWT access token is missing or expired.',
    schema: {
      example: {
        statusCode: 401,
        message: 'Unauthorized',
        error: 'Unauthorized',
      },
    },
  })
  @ApiForbiddenResponse({
    description:
      'Email not yet verified, or the user has already passed verification, or attempt limit reached.',
    schema: {
      example: {
        statusCode: 403,
        message:
          'Please verify your email address before attempting ID verification.',
        error: 'Forbidden',
      },
    },
  })
  @UseInterceptors(
    FileFieldsInterceptor(
      [
        { name: 'idCard', maxCount: 1 },
        { name: 'selfie', maxCount: 1 },
      ],
      verificationUploadConfig,
    ),
  )
  // eslint-disable-next-line @typescript-eslint/require-await
  async submitVerification(
    @UploadedFiles() files: UploadedVerificationFiles,
    @Body() dto: SubmitVerificationDto,
    // eslint-disable-next-line @typescript-eslint/no-unsafe-call
    @CurrentUser() userId: string,
    @Req() req: Request,
  ) {
    if (!files?.idCard?.[0]) {
      throw new BadRequestException(
        'ID card image is required. Please upload a clear photo of your ID card.',
      );
    }

    if (!files?.selfie?.[0]) {
      throw new BadRequestException(
        'Selfie image is required. Please take a clear photo of your face.',
      );
    }

    const ipAddress =
      (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ??
      req.socket.remoteAddress ??
      'unknown';

    // eslint-disable-next-line @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
    return this.verificationService.submitVerification(
      userId,
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      dto.documentNumber,
      files.idCard[0],
      files.selfie[0],
      ipAddress,
    );
  }

  @Get('status')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Get the current verification status of the authenticated user',
    description: `Returns the user's current ID verification status and attempt history within the current 24-hour window.

**Use this endpoint** on the frontend to decide which UI step to render:
- If \`isIdVerified: true\` — show "verification complete" screen
- If \`canAttempt: true\` — show the verification form
- If \`canAttempt: false\` and \`isIdVerified: false\` — show "attempt limit reached, try again later"

**Requires:** A valid JWT access token in the \`Authorization: Bearer\` header.`,
  })
  @ApiOkResponse({
    description: "User's current verification status.",
    schema: {
      example: {
        isIdVerified: false,
        attemptsUsed: 1,
        attemptsRemaining: 2,
        canAttempt: true,
        lastAttemptAt: '2024-03-15T09:45:00.000Z',
      },
    },
  })
  @ApiUnauthorizedResponse({
    description: 'JWT access token is missing or expired.',
    schema: {
      example: {
        statusCode: 401,
        message: 'Unauthorized',
        error: 'Unauthorized',
      },
    },
  })
  // eslint-disable-next-line @typescript-eslint/no-unsafe-call
  getStatus(@CurrentUser() userId: string) {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
    return this.verificationService.getVerificationStatus(userId);
  }
}
