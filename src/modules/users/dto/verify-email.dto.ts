import { IsString, IsUUID, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class VerifyEmailDto {
  @ApiProperty({
    description:
      'The UUID of the user whose email is being verified. Provided in the verification link sent to their inbox.',
    example: 'a3f2c1d4-8b7e-4f6a-9c2d-1e5b3a7f8d9c',
    format: 'uuid',
  })
  @IsUUID('4', { message: 'Invalid verification link' })
  userId!: string;

  @ApiProperty({
    description:
      'The raw verification token included in the email link. A 64-character hex string that is hashed before being compared to the stored token hash.',
    example:
      'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2',
  })
  @IsString()
  @IsNotEmpty({ message: 'Verification token is required' })
  token!: string;
}
