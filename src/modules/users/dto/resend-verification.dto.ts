import { IsEmail } from 'class-validator';
import { Transform } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

export class ResendVerificationDto {
  @ApiProperty({
    description:
      'The email address associated with the unverified account. A new verification email will be sent if this email exists and has not yet been verified. Rate-limited to 3 requests per hour per email address.',
    example: 'amani.uwase@gmail.com',
    format: 'email',
  })
  @IsEmail({}, { message: 'Please provide a valid email address' })
  // eslint-disable-next-line @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
  @Transform(({ value }) => value?.toLowerCase().trim())
  email!: string;
}
