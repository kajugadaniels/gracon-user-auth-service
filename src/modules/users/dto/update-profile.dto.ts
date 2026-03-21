import { IsEmail, IsString, IsOptional, Matches } from 'class-validator';
import { Transform } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';

/**
 * DTO for PATCH /users/profile.
 * All fields are optional — only provided fields are updated.
 *
 * Email change triggers re-verification:
 *   isVerified → false, isActive → false, new verification token generated.
 */
export class UpdateProfileDto {
  @ApiPropertyOptional({
    description:
      'New email address. If changed, the account will be locked until the new address is verified.',
    example: 'new.email@gmail.com',
    format: 'email',
  })
  @IsOptional()
  @IsEmail({}, { message: 'Please provide a valid email address' })
  // Normalise email before validation — prevents casing dupes
  @Transform(({ value }) => (value as string)?.toLowerCase().trim())
  email?: string;

  @ApiPropertyOptional({
    description:
      'Phone number. E.164 recommended (+250788123456). Accepts digits, spaces, dashes, parentheses, and a leading +.',
    example: '+250788123456',
    pattern: '^\\+?[\\d\\s\\-()]{7,20}$',
  })
  @IsOptional()
  @IsString()
  @Transform(({ value }) => (value as string)?.trim())
  @Matches(/^\+?[\d\s\-()]{7,20}$/, {
    message: 'Please provide a valid phone number',
  })
  phoneNumber?: string;
}
