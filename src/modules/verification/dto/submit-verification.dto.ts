import { IsString, Length, Matches } from 'class-validator';
import { Transform } from 'class-transformer';

// DTO for the text fields in the verification multipart form
// Images are handled separately by Multer interceptors
export class SubmitVerificationDto {
  // The NID the user types — we compare this against their stored encrypted NID
  @IsString()
  // eslint-disable-next-line @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
  @Transform(({ value }) => value?.trim())
  @Length(16, 16, { message: 'National ID number must be exactly 16 digits' })
  @Matches(/^\d{16}$/, {
    message: 'National ID number must contain only digits',
  })
  documentNumber: string;
}
