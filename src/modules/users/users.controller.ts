import {
  Controller,
  Post,
  Body,
  HttpCode,
  HttpStatus,
  Get,
  Query,
} from '@nestjs/common';
import { UsersService } from './users.service';
import { RegisterDto } from './dto/register.dto';
import { VerifyEmailDto } from './dto/verify-email.dto';
import { ResendVerificationDto } from './dto/resend-verification.dto';

// All routes prefixed with /api/v1/users
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  // POST /api/v1/users/register
  // Accepts NID, email, phone, password — runs full registration flow
  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  async register(@Body() dto: RegisterDto) {
    return this.usersService.register(dto);
  }

  // GET /api/v1/users/verify-email?userId=xxx&token=yyy
  // Called when user clicks the link in their verification email
  // GET is correct here — clicking a link is always a GET request
  @Get('verify-email')
  @HttpCode(HttpStatus.OK)
  async verifyEmail(@Query() dto: VerifyEmailDto) {
    return this.usersService.verifyEmail(dto);
  }

  // POST /api/v1/users/resend-verification
  // Allows user to request a new verification email
  @Post('resend-verification')
  @HttpCode(HttpStatus.OK)
  async resendVerification(@Body() dto: ResendVerificationDto) {
    return this.usersService.resendVerificationEmail(dto);
  }
}
