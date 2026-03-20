import { IsEmail } from 'class-validator';
import { Transform } from 'class-transformer';

// DTO for resending verification email — user provides their email
export class ResendVerificationDto {
  @IsEmail({}, { message: 'Please provide a valid email address' })
  // eslint-disable-next-line @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
  @Transform(({ value }) => value?.toLowerCase().trim())
  email: string;
}
