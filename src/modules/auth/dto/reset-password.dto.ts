import { IsString, IsUUID, IsNotEmpty, Length, Matches } from 'class-validator';

export class ResetPasswordDto {
  @IsUUID('4', { message: 'Invalid reset link' })
  userId: string;

  @IsString()
  @IsNotEmpty({ message: 'Reset token is required' })
  token: string;

  @IsString()
  @Length(8, 128, { message: 'Password must be between 8 and 128 characters' })
  @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&^#])/, {
    message:
      'Password must contain uppercase, lowercase, number, and special character',
  })
  newPassword: string;

  @IsString()
  @IsNotEmpty({ message: 'Please confirm your new password' })
  confirmPassword: string;
}
