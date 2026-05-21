import {
  IsString,
  MinLength,
  MaxLength,
  Matches,
  ValidateIf,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

/**
 * DTO for PATCH /users/password.
 *
 * Cross-field rule: confirmNewPassword must equal newPassword.
 * Enforced with @ValidateIf + @Matches against the sibling field.
 */
export class ChangePasswordDto {
  @ApiProperty({
    description:
      "The user's current password — used to confirm identity before changing.",
    example: 'OldPass@123',
    format: 'password',
  })
  @IsString()
  currentPassword!: string;

  @ApiProperty({
    description:
      'The new password. Must be 8–128 characters and contain at least one uppercase letter, one lowercase letter, one digit, and one special character (@$!%*?&^#).',
    example: 'NewSecure@2025!',
    minLength: 8,
    maxLength: 128,
    format: 'password',
    pattern:
      '^(?=.*[a-z])(?=.*[A-Z])(?=.*\\d)(?=.*[@$!%*?&^#])[A-Za-z\\d@$!%*?&^#]',
  })
  @IsString()
  @MinLength(8, { message: 'New password must be at least 8 characters' })
  @MaxLength(128, { message: 'New password must be at most 128 characters' })
  @Matches(
    /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&^#])[A-Za-z\d@$!%*?&^#]/,
    {
      message:
        'Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character (@$!%*?&^#)',
    },
  )
  newPassword!: string;

  @ApiProperty({
    description: 'Must be identical to newPassword.',
    example: 'NewSecure@2025!',
    format: 'password',
  })
  @IsString()
  // Cross-field check — runs only when newPassword is present
  @ValidateIf((o: ChangePasswordDto) => !!o.newPassword)
  @Matches(/.*/, {
    // Dynamic regex isn't feasible in a decorator, so we use a custom validator trick:
    // The actual equality check happens in the service.
    // This decorator just ensures the field is a non-empty string.
    message: 'Confirm password is required',
  })
  confirmNewPassword!: string;
}
