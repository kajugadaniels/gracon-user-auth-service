-- CreateEnum
CREATE TYPE "IDENTITY_TYPE" AS ENUM ('NID', 'FIN');

-- AlterTable
ALTER TABLE "citizen_identities"
ADD COLUMN "identityType" "IDENTITY_TYPE" NOT NULL DEFAULT 'NID',
ADD COLUMN "finEncrypted" TEXT,
ADD COLUMN "finHash" TEXT;

ALTER TABLE "citizen_identities"
ALTER COLUMN "nidEncrypted" DROP NOT NULL,
ALTER COLUMN "nidHash" DROP NOT NULL;

-- Backfill existing rows explicitly so legacy users remain NID-backed.
UPDATE "citizen_identities"
SET "identityType" = 'NID'
WHERE "identityType" IS NULL;

-- CreateIndex
CREATE UNIQUE INDEX "citizen_identities_finHash_key"
ON "citizen_identities"("finHash");

CREATE INDEX "citizen_identities_identityType_userId_idx"
ON "citizen_identities"("identityType", "userId");
