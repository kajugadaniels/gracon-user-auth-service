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
  async resendVerification(@Body() dto: ResendVerificationDto) {
    return this.usersService.resendVerificationEmail(dto);
  }

  /**
   * GET /api/v1/users/profile
   * General limit — authenticated read, no special restriction needed.
   */
  @Get('profile')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
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
  @HttpCode(HttpStatus.OK)
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
  @UseInterceptors(FileInterceptor('image', profileUploadConfig))
  @HttpCode(HttpStatus.OK)
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
  @ThrottleStrict()
  @HttpCode(HttpStatus.OK)
  // eslint-disable-next-line @typescript-eslint/require-await
  async changePassword(
    @CurrentUser() userId: string,
    @Body() dto: ChangePasswordDto,
  ) {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-call
    return this.usersService.changePassword(userId, dto);
  }
}
