import { IsString, Length, Matches } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class LookupCitizenDto {
  @ApiProperty({
    description:
      'The 16-digit National ID number of the citizen to look up. Must contain digits only.',
    example: '1199880012345678',
    minLength: 16,
    maxLength: 16,
    pattern: '^\\d{16}$',
  })
  @IsString()
  @Length(16, 16, { message: 'National ID number must be exactly 16 digits' })
  @Matches(/^\d{16}$/, {
    message: 'National ID number must contain only digits',
  })
  documentNumber!: string;
}
