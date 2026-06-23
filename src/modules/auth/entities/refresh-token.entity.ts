import { RefreshToken as PrismaRefreshToken } from '@gracon/database';

/**
 * RefreshToken entity type — re-exported from Prisma generated client.
 *
 * The actual database schema is defined in api/database/prisma/schema.prisma.
 * Prisma generates all TypeScript types automatically from that schema.
 * This file exists purely for documentation and convenient importing.
 *
 * Schema summary:
 * - id        UUID primary key
 * - userId    FK → users.id (cascade delete)
 * - tokenHash SHA-256 hash of raw refresh token (unique)
 * - expiresAt 30 days from issue date
 * - revoked   true after logout or token rotation
 * - ipAddress client IP at time of issue (for fraud detection)
 * - userAgent browser/device info (for fraud detection)
 * - createdAt auto-set on creation
 */
export type RefreshToken = PrismaRefreshToken;

/**
 * Safe shape for refresh token — excludes tokenHash.
 * Use this when returning token metadata to the client.
 */
export type SafeRefreshToken = Omit<RefreshToken, 'tokenHash'>;
