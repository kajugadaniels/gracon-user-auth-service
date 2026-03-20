import { IsEmail, IsString, IsNotEmpty, Length } from 'class-validator';
import { Transform } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

export class LoginDto {
  @ApiProperty({
    description:
      'The email address used during registration. Automatically normalized to lowercase.',
    example: 'amani.uwase@gmail.com',
    format: 'email',
  })
  @IsEmail({}, { message: 'Please provide a valid email address' })
  // eslint-disable-next-line @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
  @Transform(({ value }) => value?.toLowerCase().trim())
  email!: string;

  @ApiProperty({
    description: 'The account password.',
    example: 'Secure@2024!',
    format: 'password',
    minLength: 1,
    maxLength: 128,
  })
  @IsString()
  @IsNotEmpty({ message: 'Password is required' })
  @Length(1, 128)
  password!: string;
}
