import { IsEmail, IsOptional, IsUUID, ValidateIf } from 'class-validator';
import { Transform } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

export class ResendVerificationDto {
  @ApiProperty({
    description:
      'The email address associated with the unverified account. A new verification email will be sent if this email exists and has not yet been verified. Rate-limited to 3 requests per hour per email address.',
    example: 'amani.uwase@gmail.com',
    format: 'email',
    required: false,
  })
  @ValidateIf((dto: ResendVerificationDto) => !dto.userId)
  @IsEmail({}, { message: 'Please provide a valid email address' })
  // eslint-disable-next-line @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
  @Transform(({ value }) => value?.toLowerCase().trim())
  email?: string;

  @ApiProperty({
    description:
      'The user id from an existing verification link. Used by the verify-email page to request a fresh link without exposing the email address in the URL.',
    example: 'a3f2c1d4-8b7e-4f6a-9c2d-1e5b3a7f8d9c',
    format: 'uuid',
    required: false,
  })
  @ValidateIf((dto: ResendVerificationDto) => !dto.email)
  @IsUUID('4', { message: 'Invalid verification link' })
  @IsOptional()
  userId?: string;
}
