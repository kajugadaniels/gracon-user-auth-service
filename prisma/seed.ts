// Prisma seed script — creates the first SUPER_ADMIN account.
// Run with: npx prisma db seed
//
// This script is IDEMPOTENT — safe to run multiple times.
// If a SUPER_ADMIN already exists it exits without making any changes.
//
// Required .env variables:
//   SUPER_ADMIN_EMAIL
//   SUPER_ADMIN_PASSWORD (min 8 chars, uppercase, lowercase, digit, special)
//   SUPER_ADMIN_FIRST_NAME
//   SUPER_ADMIN_LAST_NAME
import { PrismaClient, AdminRole } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import * as bcrypt from 'bcrypt';
import { normalizeDatabaseUrl } from '../src/common/prisma/database-url.util';

// Prisma 7 requires a driver adapter — datasource url in schema.prisma is no longer supported
if (!process.env.DATABASE_URL) {
  console.error('❌ DATABASE_URL environment variable is not set');
  process.exit(1);
}
const adapter = new PrismaPg({
  connectionString: normalizeDatabaseUrl(process.env.DATABASE_URL),
});
const prisma = new PrismaClient({ adapter });

// bcrypt cost — must match auth service setting
const BCRYPT_ROUNDS = 12;

async function main() {
  console.log('🌱 Starting seed...');

  // ── Read credentials from environment ──────────────────────────
  // All four are required — fail fast with a clear message if missing
  const email = process.env.SUPER_ADMIN_EMAIL;
  const password = process.env.SUPER_ADMIN_PASSWORD;
  const firstName = process.env.SUPER_ADMIN_FIRST_NAME;
  const lastName = process.env.SUPER_ADMIN_LAST_NAME;

  if (!email || !password || !firstName || !lastName) {
    console.error(
      '❌ Missing required environment variables:\n' +
        '   SUPER_ADMIN_EMAIL\n' +
        '   SUPER_ADMIN_PASSWORD\n' +
        '   SUPER_ADMIN_FIRST_NAME\n' +
        '   SUPER_ADMIN_LAST_NAME\n\n' +
        'Add them to your .env file before running the seed.',
    );
    process.exit(1);
  }

  // ── Check if SUPER_ADMIN already exists ───────────────────────
  // Idempotent check — never creates a duplicate
  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
  const existingSuperAdmin = await prisma.admin.findFirst({
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
    where: { role: AdminRole.SUPER_ADMIN },
  });

  if (existingSuperAdmin) {
    console.log(
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      `✅ SUPER_ADMIN already exists (${existingSuperAdmin.email}) — skipping seed.`,
    );
    return;
  }

  // ── Validate password strength ────────────────────────────────
  // Same rules enforced by the API — catch weak passwords at seed time
  const passwordRegex =
    /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&^#])[A-Za-z\d@$!%*?&^#]{8,}/;

  if (!passwordRegex.test(password)) {
    console.error(
      '❌ SUPER_ADMIN_PASSWORD does not meet requirements:\n' +
        '   - Minimum 8 characters\n' +
        '   - At least one uppercase letter\n' +
        '   - At least one lowercase letter\n' +
        '   - At least one number\n' +
        '   - At least one special character (@$!%*?&^#)',
    );
    process.exit(1);
  }

  // ── Create the SUPER_ADMIN ─────────────────────────────────────
  const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);

  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
  const superAdmin = await prisma.admin.create({
    data: {
      firstName,
      lastName,
      email: email.toLowerCase().trim(),
      passwordHash,
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
      role: AdminRole.SUPER_ADMIN,
      // SUPER_ADMIN is pre-verified — no invite flow needed
      isVerified: true,
      isActive: true,
      createdById: null, // seeded accounts have no creator
    },
  });

  console.log(
    `✅ SUPER_ADMIN created successfully:\n` +
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      `   ID:    ${superAdmin.id}\n` +
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      `   Name:  ${superAdmin.firstName} ${superAdmin.lastName}\n` +
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      `   Email: ${superAdmin.email}\n` +
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      `   Role:  ${superAdmin.role}\n\n` +
      `⚠️  Remove SUPER_ADMIN_PASSWORD from your .env after seeding in production.`,
  );
}

main()
  .catch((error) => {
    console.error('❌ Seed failed:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
