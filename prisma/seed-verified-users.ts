// Development/test seed for fake verified Rwandan users.
// This script creates login-ready users through the same persistence shape used
// by registration: bcrypt password hashes plus encrypted/hash-backed NID and PID.
import { ConfigService } from '@nestjs/config';
import { IdentityType, PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import * as bcrypt from 'bcrypt';
import { randomInt } from 'crypto';
import { EncryptionService } from '../src/common/crypto/encryption.service';
import { PidService } from '../src/common/pid/pid.service';
import { normalizeDatabaseUrl } from '../src/common/prisma/database-url.util';

interface FakeVerifiedUserInput {
  email: string;
  phoneNumber: string;
  nid: string;
  pid: string;
  surName: string;
  postNames: string;
  sex: 'M' | 'F';
  dateOfBirth: Date;
}

const USER_COUNT = 100;
const SHARED_PASSWORD = 'Password!7';
const BCRYPT_ROUNDS = 12;
const REQUIRED_SEED_FLAG = 'ALLOW_FAKE_VERIFIED_USERS_SEED';
const PRODUCTION_SEED_FLAG = 'ALLOW_PRODUCTION_FAKE_VERIFIED_USERS_SEED';

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

const PHONE_PREFIXES = ['+25078', '+25072', '+25073'] as const;

const pidService = new PidService();

/**
 * Ensures fake verified users cannot be seeded by an accidental command.
 *
 * @returns Nothing. The process exits with an error when seeding is not allowed.
 */
function enforceSeedSafetyGate(): void {
  const isAllowed = process.env[REQUIRED_SEED_FLAG] === 'true';
  const isProduction = process.env.APP_ENV === 'production';
  const isProductionAllowed = process.env[PRODUCTION_SEED_FLAG] === 'true';

  if (!isAllowed) {
    console.error(
      `Refusing to seed fake users. Set ${REQUIRED_SEED_FLAG}=true to run this development/test seed.`,
    );
    process.exit(1);
  }

  if (isProduction && !isProductionAllowed) {
    console.error(
      `Refusing to seed fake users in production. Set ${PRODUCTION_SEED_FLAG}=true only for an approved controlled test environment.`,
    );
    process.exit(1);
  }
}

/**
 * Builds a lower-case Gmail address from a user's generated names.
 *
 * @param surName Rwandan family name.
 * @param givenName Christian or Muslim given name.
 * @param existingEmails Emails already reserved in this run.
 * @returns A unique email candidate for the seed run.
 */
function generateEmail(
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
 * @param existingPhones Phone numbers already reserved in this run.
 * @returns A unique E.164-style Rwandan mobile number.
 */
function generatePhoneNumber(existingPhones: Set<string>): string {
  let phoneNumber = '';

  do {
    const prefix = PHONE_PREFIXES[randomInt(0, PHONE_PREFIXES.length)];
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
function generateFakeNid(index: number, dateOfBirth: Date, sex: 'M' | 'F'): string {
  const year = dateOfBirth.getFullYear().toString();
  const month = (dateOfBirth.getMonth() + 1).toString().padStart(2, '0');
  const day = dateOfBirth.getDate().toString().padStart(2, '0');
  const sexDigit = sex === 'M' ? '1' : '2';
  const sequence = (9000000 + index).toString().padStart(7, '0');

  return `${sexDigit}${year}${month}${day}${sequence}`;
}

/**
 * Generates a realistic fake verified user payload.
 *
 * @param index Seed row index.
 * @param existingEmails Emails already reserved in this run.
 * @param existingPhones Phone numbers already reserved in this run.
 * @returns A complete user payload ready for secure persistence.
 */
function generateFakeUser(
  index: number,
  existingEmails: Set<string>,
  existingPhones: Set<string>,
): FakeVerifiedUserInput {
  const surName = RWANDAN_SURNAMES[index % RWANDAN_SURNAMES.length];
  const givenName = GIVEN_NAMES[(index * 7) % GIVEN_NAMES.length];
  const birthYear = 1975 + (index % 28);
  const birthMonth = index % 12;
  const birthDay = (index % 27) + 1;
  const dateOfBirth = new Date(Date.UTC(birthYear, birthMonth, birthDay));
  const sex: 'M' | 'F' = index % 2 === 0 ? 'M' : 'F';
  const nid = generateFakeNid(index + 1, dateOfBirth, sex);
  const pid = pidService.generate(dateOfBirth);

  return {
    email: generateEmail(surName, givenName, existingEmails),
    phoneNumber: generatePhoneNumber(existingPhones),
    nid,
    pid,
    surName,
    postNames: givenName,
    sex,
    dateOfBirth,
  };
}

/**
 * Creates fake verified users with secure hashes and encrypted identifiers.
 *
 * @returns The number of users created.
 */
async function seedVerifiedUsers(): Promise<number> {
  enforceSeedSafetyGate();

  if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL environment variable is not set.');
    process.exit(1);
  }

  const adapter = new PrismaPg({
    connectionString: normalizeDatabaseUrl(process.env.DATABASE_URL),
  });
  const prisma = new PrismaClient({ adapter });
  const encryption = new EncryptionService(new ConfigService());
  try {
    const passwordHash = await bcrypt.hash(SHARED_PASSWORD, BCRYPT_ROUNDS);
    const existingEmails = new Set<string>();
    const existingPhones = new Set<string>();
    const users = Array.from({ length: USER_COUNT }, (_, index) =>
      generateFakeUser(index, existingEmails, existingPhones),
    );
    const now = new Date();

    await prisma.$transaction(
      users.map((user) =>
        prisma.user.create({
          data: {
            email: user.email,
            phoneNumber: user.phoneNumber,
            passwordHash,
            isVerified: true,
            isActive: true,
            isIdVerified: true,
            idVerifiedAt: now,
            citizenIdentity: {
              create: {
                identityType: IdentityType.NID,
                nidEncrypted: encryption.encrypt(user.nid),
                nidHash: encryption.hash(user.nid),
                finEncrypted: null,
                finHash: null,
                surName: user.surName,
                postNames: user.postNames,
                sex: user.sex,
                dateOfBirth: user.dateOfBirth,
                countryOfBirth: 'Rwanda',
              },
            },
            platformId: {
              create: {
                pidEncrypted: encryption.encrypt(user.pid),
                pidHash: encryption.hash(user.pid),
              },
            },
          },
        }),
      ),
    );

    return users.length;
  } finally {
    await prisma.$disconnect();
  }
}

seedVerifiedUsers()
  .then((createdCount) => {
    console.log(
      `Created ${createdCount} fake verified users. Shared password: ${SHARED_PASSWORD}`,
    );
  })
  .catch((error: unknown) => {
    console.error('Fake verified user seed failed:', error);
    process.exit(1);
  });
