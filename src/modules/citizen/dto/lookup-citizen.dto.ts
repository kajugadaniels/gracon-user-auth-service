import { IsString, Length, Matches } from 'class-validator';

// DTO for when the frontend sends an NID number to pre-fill the registration form
// Validated automatically by NestJS global ValidationPipe before reaching the controller
export class LookupCitizenDto {
  @IsString()
  @Length(16, 16, { message: 'National ID number must be exactly 16 digits' })
  @Matches(/^\d{16}$/, {
    message: 'National ID number must contain only digits',
  })
  documentNumber: string | undefined;
}
