import { IsString, IsUUID, IsNotEmpty } from 'class-validator';

// DTO for email verification — user clicks link with userId + token in URL
export class VerifyEmailDto {
  @IsUUID('4', { message: 'Invalid verification link' })
  userId: string;

  @IsString()
  @IsNotEmpty({ message: 'Verification token is required' })
  token: string;
}
