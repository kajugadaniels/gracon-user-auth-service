import { IsString, Length, Matches } from 'class-validator';
import { Transform } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

export class SubmitVerificationDto {
  @ApiProperty({
    description:
      'The 16-digit National ID number the user types during verification. This is compared against the encrypted NID stored at registration — the comparison happens server-side and the raw NID is never forwarded to the verification engine.',
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
}
