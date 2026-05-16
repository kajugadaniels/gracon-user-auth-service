// Regression tests for fake verified user generation.
// These tests keep seed data realistic without requiring a database connection.
import {
  FAKE_VERIFIED_USER_PASSWORD,
  RWANDAN_PHONE_PREFIXES,
  generateFakeVerifiedUsers,
} from './fake-verified-users';

describe('generateFakeVerifiedUsers', () => {
  it('generates the requested number of users', () => {
    const users = generateFakeVerifiedUsers(100);

    expect(users).toHaveLength(100);
  });

  it('generates unique emails, phones, NIDs, and PIDs', () => {
    const users = generateFakeVerifiedUsers(100);

    expect(new Set(users.map((user) => user.email)).size).toBe(users.length);
    expect(new Set(users.map((user) => user.phoneNumber)).size).toBe(
      users.length,
    );
    expect(new Set(users.map((user) => user.nid)).size).toBe(users.length);
    expect(new Set(users.map((user) => user.pid)).size).toBe(users.length);
  });

  it('generates Gmail addresses from the generated names', () => {
    const [user] = generateFakeVerifiedUsers(1);

    expect(user.email).toBe(
      `${user.surName}${user.postNames}`.toLowerCase() + '@gmail.com',
    );
  });

  it('respects Rwandan phone prefixes and fake NID shape', () => {
    const users = generateFakeVerifiedUsers(100);

    for (const user of users) {
      expect(
        RWANDAN_PHONE_PREFIXES.some((prefix) =>
          user.phoneNumber.startsWith(prefix),
        ),
      ).toBe(true);
      expect(user.phoneNumber).toMatch(/^\+250(?:78|72|73)\d{7}$/);
      expect(user.nid).toMatch(/^[12]\d{15}$/);
    }
  });

  it('keeps the shared seed password stable for login testing', () => {
    expect(FAKE_VERIFIED_USER_PASSWORD).toBe('Password!7');
  });
});
