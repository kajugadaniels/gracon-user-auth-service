/**
 * DTOs for cross-platform user invitation defaults.
 */
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ArrayUnique, IsArray, IsEnum, IsOptional } from 'class-validator';

/**
 * Supported user-level defaults for invitation verification gates.
 */
export enum UserInviteVerificationPreferenceDtoValue {
  NO_VERIFICATION = 'NO_VERIFICATION',
  EMAIL_OTP = 'EMAIL_OTP',
  IDENTITY_VERIFICATION = 'IDENTITY_VERIFICATION',
}

export class UserPreferencesResponseDto {
  @ApiProperty({
    enum: UserInviteVerificationPreferenceDtoValue,
    isArray: true,
    example: [UserInviteVerificationPreferenceDtoValue.NO_VERIFICATION],
    description:
      'Default extra verification gates selected when this user shares a document. NO_VERIFICATION must not be combined with other values.',
  })
  defaultDocumentInviteVerifications!: UserInviteVerificationPreferenceDtoValue[];

  @ApiProperty({
    enum: UserInviteVerificationPreferenceDtoValue,
    isArray: true,
    example: [UserInviteVerificationPreferenceDtoValue.NO_VERIFICATION],
    description:
      'Default extra verification gates selected when this user invites meeting participants. NO_VERIFICATION must not be combined with other values.',
  })
  defaultMeetingInviteVerifications!: UserInviteVerificationPreferenceDtoValue[];
}

export class UpdateUserPreferencesDto {
  @ApiPropertyOptional({
    enum: UserInviteVerificationPreferenceDtoValue,
    isArray: true,
    example: [UserInviteVerificationPreferenceDtoValue.EMAIL_OTP],
    description:
      'Optional replacement for document invitation defaults. Use [NO_VERIFICATION] to disable extra verification by default.',
  })
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsEnum(UserInviteVerificationPreferenceDtoValue, { each: true })
  defaultDocumentInviteVerifications?: UserInviteVerificationPreferenceDtoValue[];

  @ApiPropertyOptional({
    enum: UserInviteVerificationPreferenceDtoValue,
    isArray: true,
    example: [
      UserInviteVerificationPreferenceDtoValue.EMAIL_OTP,
      UserInviteVerificationPreferenceDtoValue.IDENTITY_VERIFICATION,
    ],
    description:
      'Optional replacement for meeting invitation defaults. Use [NO_VERIFICATION] to disable extra verification by default.',
  })
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsEnum(UserInviteVerificationPreferenceDtoValue, { each: true })
  defaultMeetingInviteVerifications?: UserInviteVerificationPreferenceDtoValue[];
}
