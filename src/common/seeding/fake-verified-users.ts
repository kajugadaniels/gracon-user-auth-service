// Fake verified user generation for development and controlled test seeding.
// The generator is pure so uniqueness and formatting can be tested without a database.
import { randomInt } from 'crypto';
import { PidService } from '../pid/pid.service';

export interface FakeVerifiedUserInput {
  email: string;
  phoneNumber: string;
  nid: string;
  pid: string;
  surName: string;
  postNames: string;
  sex: 'M' | 'F';
  dateOfBirth: Date;
}

export const FAKE_VERIFIED_USER_PASSWORD = 'Password!7';

const RWANDAN_SURNAMES = [
  'HABIMANA',
  'MUGISHA',
  'UWASE',
  'NIYONZIMA',
  'IRADUKUNDA',
  'MUKAMANA',
  'KAYITESI',
  'NDAYISABA',
  'BIZIMANA',
  'TUYISHIME',
  'UWIMANA',
  'HAKIZIMANA',
  'NSENGIYUMVA',
  'MUREKATETE',
  'ISHIMWE',
  'MUTUYIMANA',
  'NIYONKURU',
  'MUKESHIMANA',
  'GASANA',
  'RUTAYISIRE',
] as const;

const GIVEN_NAMES = [
  'Daniel',
  'Salomon',
  'Aline',
  'Jean',
  'Grace',
  'Amina',
  'Yusuf',
  'Emmanuel',
  'Claudine',
  'Patrick',
  'Immaculee',
  'Olivier',
  'Nadine',
  'Theogene',
  'Fatuma',
  'Eric',
  'Alice',
  'Moses',
  'Sarah',
  'Ange',
] as const;

export const RWANDAN_PHONE_PREFIXES = ['+25078', '+25072', '+25073'] as const;

const pidService = new PidService();

/**
 * Builds a lower-case Gmail address from a user's generated names.
 *
 * @param surName Rwandan family name.
 * @param givenName Christian or Muslim given name.
 * @param existingEmails Emails already reserved by the database or current run.
 * @returns A unique email candidate for the seed run.
 */
export function generateFakeVerifiedUserEmail(
  surName: string,
  givenName: string,
  existingEmails: Set<string>,
): string {
  const base = `${surName}${givenName}`.toLowerCase().replace(/[^a-z]/g, '');
  let email = `${base}@gmail.com`;

  while (existingEmails.has(email)) {
    email = `${base}${randomInt(100, 9999)}@gmail.com`;
  }

  existingEmails.add(email);
  return email;
}

/**
 * Generates a unique Rwandan phone number with the allowed local prefixes.
 *
 * @param existingPhones Phone numbers already reserved by the database or current run.
 * @returns A unique E.164-style Rwandan mobile number.
 */
export function generateFakeVerifiedUserPhoneNumber(
  existingPhones: Set<string>,
): string {
  let phoneNumber = '';

  do {
    const prefix =
      RWANDAN_PHONE_PREFIXES[randomInt(0, RWANDAN_PHONE_PREFIXES.length)];
    let suffix = '';

    for (let index = 0; index < 7; index += 1) {
      suffix += randomInt(0, 10).toString();
    }

    phoneNumber = `${prefix}${suffix}`;
  } while (existingPhones.has(phoneNumber));

  existingPhones.add(phoneNumber);
  return phoneNumber;
}

/**
 * Generates a fake 16-digit NID-shaped value that is unique for the seed batch.
 *
 * @param index Seed row index.
 * @param dateOfBirth User date of birth.
 * @param sex User sex, used only to keep the generated number stable.
 * @returns A fake National ID number suitable for local testing.
 */
export function generateFakeVerifiedUserNid(
  index: number,
  dateOfBirth: Date,
  sex: 'M' | 'F',
): string {
  const year = dateOfBirth.getFullYear().toString();
  const month = (dateOfBirth.getMonth() + 1).toString().padStart(2, '0');
  const day = dateOfBirth.getDate().toString().padStart(2, '0');
  const sexDigit = sex === 'M' ? '1' : '2';
  const sequence = (9000000 + index).toString().padStart(7, '0');

  return `${sexDigit}${year}${month}${day}${sequence}`;
}

/**
 * Generates login-ready fake verified users for seeding.
 *
 * @param count Number of fake users to generate.
 * @param existingEmails Emails already present in the database.
 * @param existingPhones Phone numbers already present in the database.
 * @returns Fake verified user payloads ready for encrypted persistence.
 */
export function generateFakeVerifiedUsers(
  count: number,
  existingEmails = new Set<string>(),
  existingPhones = new Set<string>(),
): FakeVerifiedUserInput[] {
  return Array.from({ length: count }, (_, index) => {
    const surName = RWANDAN_SURNAMES[index % RWANDAN_SURNAMES.length];
    const givenName = GIVEN_NAMES[(index * 7) % GIVEN_NAMES.length];
    const birthYear = 1975 + (index % 28);
    const birthMonth = index % 12;
    const birthDay = (index % 27) + 1;
    const dateOfBirth = new Date(Date.UTC(birthYear, birthMonth, birthDay));
    const sex: 'M' | 'F' = index % 2 === 0 ? 'M' : 'F';
    const nid = generateFakeVerifiedUserNid(index + 1, dateOfBirth, sex);
    const pid = pidService.generate(dateOfBirth);

    return {
      email: generateFakeVerifiedUserEmail(surName, givenName, existingEmails),
      phoneNumber: generateFakeVerifiedUserPhoneNumber(existingPhones),
      nid,
      pid,
      surName,
      postNames: givenName,
      sex,
      dateOfBirth,
    };
  });
}
