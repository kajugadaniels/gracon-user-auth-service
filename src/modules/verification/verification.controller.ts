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

// All routes: /api/v1/verification
@Controller('verification')
@UseGuards(JwtAuthGuard) // all endpoints require a valid JWT
export class VerificationController {
  constructor(private readonly verificationService: VerificationService) {}

  /**
   * POST /api/v1/verification/submit
   * Accepts multipart/form-data with:
   *   - idCard: image file (ID card photo)
   *   - selfie: image file (live selfie)
   *   - documentNumber: string (typed NID)
   *
   * User must be logged in (JWT) but NOT yet ID-verified.
   * Returns composite score and pass/fail result.
   */
  @Post('submit')
  @HttpCode(HttpStatus.OK)
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
    // Validate both files are present — Multer only validates type and size
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

    // Extract client IP for audit logging
    // x-forwarded-for handles requests through load balancers/proxies
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

  /**
   * GET /api/v1/verification/status
   * Returns the user's current verification status.
   * Called by the frontend to decide which step to show.
   */
  @Get('status')
  @HttpCode(HttpStatus.OK)
  // eslint-disable-next-line @typescript-eslint/no-unsafe-call
  getStatus(@CurrentUser() userId: string) {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
    return this.verificationService.getVerificationStatus(userId);
  }
}
