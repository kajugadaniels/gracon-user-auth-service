/**
 * User preference normalization tests.
 */
import { BadRequestException } from '@nestjs/common';
import { UserInviteVerificationPreferenceDtoValue } from './dto/user-preferences.dto';
import { normalizeUserInviteVerificationPreferences } from './user-preferences.helper';

describe('normalizeUserInviteVerificationPreferences', () => {
  it('defaults to no verification when a preference field is omitted', () => {
    expect(
      normalizeUserInviteVerificationPreferences(
        undefined,
        'Document defaults',
      ),
    ).toEqual([UserInviteVerificationPreferenceDtoValue.NO_VERIFICATION]);
  });

  it('stores no verification as a single exclusive preference', () => {
    expect(
      normalizeUserInviteVerificationPreferences(
        [UserInviteVerificationPreferenceDtoValue.NO_VERIFICATION],
        'Meeting defaults',
      ),
    ).toEqual([UserInviteVerificationPreferenceDtoValue.NO_VERIFICATION]);
  });

  it('orders active verification gates consistently', () => {
    expect(
      normalizeUserInviteVerificationPreferences(
        [
          UserInviteVerificationPreferenceDtoValue.IDENTITY_VERIFICATION,
          UserInviteVerificationPreferenceDtoValue.EMAIL_OTP,
        ],
        'Meeting defaults',
      ),
    ).toEqual([
      UserInviteVerificationPreferenceDtoValue.EMAIL_OTP,
      UserInviteVerificationPreferenceDtoValue.IDENTITY_VERIFICATION,
    ]);
  });

  it('rejects no verification mixed with another verification gate', () => {
    expect(() =>
      normalizeUserInviteVerificationPreferences(
        [
          UserInviteVerificationPreferenceDtoValue.NO_VERIFICATION,
          UserInviteVerificationPreferenceDtoValue.EMAIL_OTP,
        ],
        'Document defaults',
      ),
    ).toThrow(BadRequestException);
  });
});
