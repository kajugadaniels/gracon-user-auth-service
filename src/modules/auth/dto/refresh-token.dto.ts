import { IsString, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class RefreshTokenDto {
  @ApiProperty({
    description:
      'The refresh token received during login or a previous token refresh. Each refresh token is single-use — it is revoked immediately upon use and replaced with a new one (token rotation).',
    example:
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJhM2YyYzFkNC04YjdlLTRmNmEtOWMyZC0xZTViM2E3ZjhkOWMiLCJlbWFpbCI6ImFtYW5pLnV3YXNlQGdtYWlsLmNvbSIsImlhdCI6MTcwMDAwMDAwMCwiZXhwIjoxNzAyNTkyMDAwfQ.signature',
  })
  @IsString()
  @IsNotEmpty({ message: 'Refresh token is required' })
  refreshToken!: string;
}
