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
  @UseInterceptors(
    FileFieldsInterceptor(
      [
        { name: 'idCard', maxCount: 1 },
        { name: 'selfie', maxCount: 1 },
      ],
      verificationUploadConfig,
    ),
  )
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
  async getStatus(@CurrentUser() userId: string) {
    return this.verificationService.getVerificationStatus(userId);
  }
}
