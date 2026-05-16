// Development/test seed for fake verified Rwandan users.
// This script creates login-ready users through the same persistence shape used
// by registration: bcrypt password hashes plus encrypted/hash-backed NID and PID.
import { ConfigService } from '@nestjs/config';
import { IdentityType, Prisma, PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import * as bcrypt from 'bcrypt';
import { EncryptionService } from '../src/common/crypto/encryption.service';
import { normalizeDatabaseUrl } from '../src/common/prisma/database-url.util';
import {
  FAKE_VERIFIED_USER_PASSWORD,
  FakeVerifiedUserInput,
  generateFakeVerifiedUsers,
} from '../src/common/seeding/fake-verified-users';

const USER_COUNT = 100;
const BCRYPT_ROUNDS = 12;
const TRANSACTION_MAX_WAIT_MS = 20_000;
const TRANSACTION_TIMEOUT_MS = 120_000;
const REQUIRED_SEED_FLAG = 'ALLOW_FAKE_VERIFIED_USERS_SEED';
const PRODUCTION_SEED_FLAG = 'ALLOW_PRODUCTION_FAKE_VERIFIED_USERS_SEED';

interface FakeVerifiedUserSeedResult {
  created: number;
  skipped: number;
}

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
 * Persists one login-ready verified user through the same secure columns used by
 * production registration.
 *
 * @param tx Active Prisma transaction client.
 * @param user Fake verified user payload.
 * @param passwordHash Shared password hash generated once per seed run.
 * @param encryption Encryption service used for reversible NID/PID ciphertext.
 * @param verifiedAt Timestamp shared by all generated users in this batch.
 * @returns Nothing.
 */
async function createVerifiedUser(
  tx: Prisma.TransactionClient,
  user: FakeVerifiedUserInput,
  passwordHash: string,
  encryption: EncryptionService,
  verifiedAt: Date,
): Promise<void> {
  await tx.user.create({
    data: {
      email: user.email,
      phoneNumber: user.phoneNumber,
      passwordHash,
      isVerified: true,
      isActive: true,
      isIdVerified: true,
      idVerifiedAt: verifiedAt,
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
  });
}

/**
 * Loads existing user contact values so generated users do not collide with
 * real development data.
 *
 * @param prisma Prisma client connected to the target database.
 * @returns Existing emails and phone numbers as sets.
 */
async function loadExistingContactSets(
  prisma: PrismaClient,
): Promise<{ emails: Set<string>; phones: Set<string> }> {
  const existingUsers = await prisma.user.findMany({
    select: { email: true, phoneNumber: true },
  });

  return {
    emails: new Set(existingUsers.map((user) => user.email)),
    phones: new Set(
      existingUsers
        .map((user) => user.phoneNumber)
        .filter((phoneNumber): phoneNumber is string => Boolean(phoneNumber)),
    ),
  };
}

/**
 * Creates fake verified users with secure hashes and encrypted identifiers.
 *
 * @returns The number of created and skipped users.
 */
async function seedVerifiedUsers(): Promise<FakeVerifiedUserSeedResult> {
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
    const passwordHash = await bcrypt.hash(
      FAKE_VERIFIED_USER_PASSWORD,
      BCRYPT_ROUNDS,
    );
    const existingContacts = await loadExistingContactSets(prisma);
    const users = generateFakeVerifiedUsers(
      USER_COUNT,
      existingContacts.emails,
      existingContacts.phones,
    );
    const now = new Date();
    let created = 0;
    let skipped = 0;

    await prisma.$transaction(
      async (tx) => {
        // Keep writes sequential so Prisma does not have to queue 100 nested
        // creates while the transaction is still trying to start.
        for (const user of users) {
          const existingIdentity = await tx.citizenIdentity.findFirst({
            where: { nidHash: encryption.hash(user.nid) },
            select: { id: true },
          });

          if (existingIdentity) {
            skipped += 1;
            continue;
          }

          await createVerifiedUser(tx, user, passwordHash, encryption, now);
          created += 1;
        }
      },
      {
        maxWait: TRANSACTION_MAX_WAIT_MS,
        timeout: TRANSACTION_TIMEOUT_MS,
      },
    );

    return { created, skipped };
  } finally {
    await prisma.$disconnect();
  }
}

seedVerifiedUsers()
  .then((result) => {
    console.log(
      `Created ${result.created} fake verified users. Skipped ${result.skipped} existing users. Shared password: ${FAKE_VERIFIED_USER_PASSWORD}`,
    );
  })
  .catch((error: unknown) => {
    console.error('Fake verified user seed failed:', error);
    process.exit(1);
  });
