import { IsEmail } from 'class-validator';
import { Transform } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

export class ForgotPasswordDto {
  @ApiProperty({
    description:
      'The email address associated with the account. If an account with this address exists, ' +
      'a password reset link valid for 1 hour will be sent to the inbox. ' +
      'The response is always identical regardless of whether the email is registered — ' +
      'this prevents attackers from discovering which email addresses have accounts (user enumeration prevention).',
    example: 'kwizera.gervais@gmail.com',
    format: 'email',
  })
  @IsEmail({}, { message: 'Please provide a valid email address' })
  @Transform(({ value }) => value?.toLowerCase().trim())
  email!: string;
}
