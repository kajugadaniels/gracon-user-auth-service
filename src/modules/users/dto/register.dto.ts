import {
  IsEmail,
  IsString,
  Length,
  Matches,
  IsOptional,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class RegisterDto {
  @ApiProperty({
    description:
      'The 16-digit National ID number of the user. Must match an existing citizen record in the national ID database.',
    example: '1199880012345678',
    minLength: 16,
    maxLength: 16,
    pattern: '^\\d{16}$',
  })
  @IsString()
  // eslint-disable-next-line @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
  @Transform(({ value }) => value?.trim())
  @Length(16, 16, { message: 'National ID number must be exactly 16 digits' })
  @Matches(/^\d{16}$/, {
    message: 'National ID number must contain only digits',
  })
  documentNumber!: string;

  @ApiProperty({
    description:
      'The email address of the user. Must be unique across all accounts. Automatically normalized to lowercase.',
    example: 'amani.uwase@gmail.com',
    format: 'email',
  })
  @IsEmail({}, { message: 'Please provide a valid email address' })
  // eslint-disable-next-line @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
  @Transform(({ value }) => value?.toLowerCase().trim())
  email!: string;

  @ApiPropertyOptional({
    description:
      'Phone number of the user. Optional at registration. Recommended format: E.164 (e.g. +250788123456 for Rwanda). Accepts digits, spaces, dashes, parentheses, and a leading +.',
    example: '+250788123456',
    pattern: '^\\+?[\\d\\s\\-()]{7,20}$',
  })
  @IsOptional()
  @IsString()
  // eslint-disable-next-line @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
  @Transform(({ value }) => value?.trim())
  @Matches(/^\+?[\d\s\-()]{7,20}$/, {
    message: 'Please provide a valid phone number',
  })
  phoneNumber?: string;

  @ApiProperty({
    description:
      'Account password. Must be 8–128 characters and contain at least one uppercase letter, one lowercase letter, one digit, and one special character from: @$!%*?&^#',
    example: 'Secure@2024!',
    minLength: 8,
    maxLength: 128,
    format: 'password',
    pattern:
      '^(?=.*[a-z])(?=.*[A-Z])(?=.*\\d)(?=.*[@$!%*?&^#])[A-Za-z\\d@$!%*?&^#]',
  })
  @IsString()
  @Length(8, 128, { message: 'Password must be between 8 and 128 characters' })
  @Matches(
    /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&^#])[A-Za-z\d@$!%*?&^#]/,
    {
      message:
        'Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character (@$!%*?&^#)',
    },
  )
  password!: string;
}
