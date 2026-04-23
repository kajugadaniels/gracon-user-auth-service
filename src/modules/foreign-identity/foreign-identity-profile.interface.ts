/**
 * Safe foreign identity profile returned by api/foreign-identity.
 * This mirrors the read response used by auth registration when a user
 * signs up with a Foreign Identity Number instead of a Rwanda NID.
 */
export interface ForeignIdentityProfile {
  fin: string;
  firstName: string;
  lastName: string;
  gender: string;
  dateOfBirth: string;
  countryOfOrigin: string;
  nationality: string;
  maritalStatus: string;
  issuanceVersion: number;
  isActive: boolean;
}
