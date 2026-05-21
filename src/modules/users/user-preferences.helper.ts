/**
 * Normalization helpers for user-owned cross-platform invitation defaults.
 */
import { BadRequestException } from '@nestjs/common';
import { UserInviteVerificationPreferenceDtoValue } from './dto/user-preferences.dto';

export const DEFAULT_USER_INVITE_VERIFICATION_PREFERENCES = [
  UserInviteVerificationPreferenceDtoValue.NO_VERIFICATION,
] as const;

export type UserInviteVerificationPreferenceValue =
  UserInviteVerificationPreferenceDtoValue;

/**
 * Normalizes a user-provided invitation preference list into a stable order.
 *
 * @param values - Candidate preference values submitted by the client.
 * @param fieldName - Human-readable field name used in validation errors.
 * @returns A stable, deduplicated preference list that can be persisted.
 */
export function normalizeUserInviteVerificationPreferences(
  values: UserInviteVerificationPreferenceValue[] | undefined,
  fieldName: string,
): UserInviteVerificationPreferenceValue[] {
  const normalizedValues =
    values && values.length > 0
      ? Array.from(new Set(values))
      : [...DEFAULT_USER_INVITE_VERIFICATION_PREFERENCES];

  const hasNoVerification = normalizedValues.includes(
    UserInviteVerificationPreferenceDtoValue.NO_VERIFICATION,
  );

  if (hasNoVerification && normalizedValues.length > 1) {
    throw new BadRequestException(
      `${fieldName} cannot combine NO_VERIFICATION with EMAIL_OTP or IDENTITY_VERIFICATION.`,
    );
  }

  if (hasNoVerification) {
    return [UserInviteVerificationPreferenceDtoValue.NO_VERIFICATION];
  }

  return [
    UserInviteVerificationPreferenceDtoValue.EMAIL_OTP,
    UserInviteVerificationPreferenceDtoValue.IDENTITY_VERIFICATION,
  ].filter((preference) => normalizedValues.includes(preference));
}
