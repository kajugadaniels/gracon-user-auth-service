import { IsString, IsUUID, IsNotEmpty, Length, Matches } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ResetPasswordDto {
  @ApiProperty({
    description:
      "The UUID of the user performing the reset. Embedded in the reset link sent to the user's inbox. " +
      'Copy it exactly from the URL — do not modify it.',
    example: 'a3f2c1d4-8b7e-4f6a-9c2d-1e5b3a7f8d9c',
    format: 'uuid',
  })
  @IsUUID('4', { message: 'Invalid reset link' })
  userId!: string;

  @ApiProperty({
    description:
      'The raw password reset token embedded in the reset link. ' +
      'A 64-character hex string derived from 32 bytes of cryptographically secure randomness. ' +
      'On the server this value is hashed with SHA-256 and compared against the stored hash — ' +
      'the raw token is never persisted. Tokens expire 1 hour after issuance and can only be used once.',
    example: 'f3a1c9e2b7d4a8f1c3e9b2d7a4f8c1e3b9d2a7f4c8e1b3d9a2f7c4e8b1d3a9f2',
  })
  @IsString()
  @IsNotEmpty({ message: 'Reset token is required' })
  token!: string;

  @ApiProperty({
    description:
      'The new password. Must be 8–128 characters and contain at least one uppercase letter, ' +
      'one lowercase letter, one digit, and one special character from: `@$!%*?&^#`. ' +
      'After a successful reset, all active refresh tokens are revoked on every device, ' +
      'requiring a fresh login everywhere.',
    example: 'NewKwizera@2025!',
    minLength: 8,
    maxLength: 128,
    format: 'password',
    pattern:
      '^(?=.*[a-z])(?=.*[A-Z])(?=.*\\d)(?=.*[@$!%*?&^#])[A-Za-z\\d@$!%*?&^#]',
  })
  @IsString()
  @Length(8, 128, { message: 'Password must be between 8 and 128 characters' })
  @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&^#])/, {
    message:
      'Password must contain uppercase, lowercase, number, and special character',
  })
  newPassword!: string;

  @ApiProperty({
    description:
      'Must be identical to `newPassword`. Used to confirm the user typed the intended password correctly.',
    example: 'NewKwizera@2025!',
    format: 'password',
  })
  @IsString()
  @IsNotEmpty({ message: 'Please confirm your new password' })
  confirmPassword!: string;
}
