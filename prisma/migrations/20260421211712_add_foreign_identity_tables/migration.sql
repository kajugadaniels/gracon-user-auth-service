-- CreateEnum
CREATE TYPE "ForeignGender" AS ENUM ('MALE', 'FEMALE');

-- CreateEnum
CREATE TYPE "MaritalStatus" AS ENUM ('SINGLE', 'MARRIED', 'DIVORCED', 'WIDOWED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "AdminAction" ADD VALUE 'BOOTSTRAP_COMPLETED';
ALTER TYPE "AdminAction" ADD VALUE 'FOREIGN_IDENTITY_REGISTERED';
ALTER TYPE "AdminAction" ADD VALUE 'FOREIGN_IDENTITY_UPDATED';
ALTER TYPE "AdminAction" ADD VALUE 'FOREIGN_IDENTITY_DEACTIVATED';
ALTER TYPE "AdminAction" ADD VALUE 'FOREIGN_IDENTITY_REACTIVATED';
ALTER TYPE "AdminAction" ADD VALUE 'FOREIGN_IDENTITY_VIEWED';
ALTER TYPE "AdminAction" ADD VALUE 'FOREIGN_IDENTITY_PASSPORT_DECRYPTED';
ALTER TYPE "AdminAction" ADD VALUE 'FOREIGN_IDENTITY_IMAGE_UPLOADED';
ALTER TYPE "AdminAction" ADD VALUE 'FOREIGN_IDENTITY_IMAGE_REMOVED';

-- CreateTable
CREATE TABLE "foreign_identities" (
    "id" TEXT NOT NULL,
    "fin" TEXT NOT NULL,
    "finHash" TEXT NOT NULL,
    "firstName" VARCHAR(100) NOT NULL,
    "lastName" VARCHAR(100) NOT NULL,
    "passportNumberEncrypted" TEXT NOT NULL,
    "passportNumberHash" TEXT NOT NULL,
    "gender" "ForeignGender" NOT NULL,
    "dateOfBirth" TIMESTAMP(3) NOT NULL,
    "countryOfOrigin" VARCHAR(2) NOT NULL,
    "nationality" VARCHAR(100) NOT NULL,
    "maritalStatus" "MaritalStatus" NOT NULL,
    "imageUrl" TEXT,
    "imageS3Key" TEXT,
    "sequenceNumber" INTEGER NOT NULL,
    "issuanceVersion" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "registeredByAdminId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "foreign_identities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fin_sequences" (
    "id" TEXT NOT NULL,
    "birthYear" INTEGER NOT NULL,
    "genderCode" INTEGER NOT NULL,
    "lastSequence" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "fin_sequences_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "foreign_identities_fin_key" ON "foreign_identities"("fin");

-- CreateIndex
CREATE UNIQUE INDEX "foreign_identities_finHash_key" ON "foreign_identities"("finHash");

-- CreateIndex
CREATE UNIQUE INDEX "foreign_identities_passportNumberHash_key" ON "foreign_identities"("passportNumberHash");

-- CreateIndex
CREATE INDEX "foreign_identities_countryOfOrigin_idx" ON "foreign_identities"("countryOfOrigin");

-- CreateIndex
CREATE INDEX "foreign_identities_dateOfBirth_idx" ON "foreign_identities"("dateOfBirth");

-- CreateIndex
CREATE INDEX "foreign_identities_isActive_createdAt_idx" ON "foreign_identities"("isActive", "createdAt");

-- CreateIndex
CREATE INDEX "foreign_identities_registeredByAdminId_idx" ON "foreign_identities"("registeredByAdminId");

-- CreateIndex
CREATE UNIQUE INDEX "fin_sequences_birthYear_genderCode_key" ON "fin_sequences"("birthYear", "genderCode");

-- AddForeignKey
ALTER TABLE "foreign_identities" ADD CONSTRAINT "foreign_identities_registeredByAdminId_fkey" FOREIGN KEY ("registeredByAdminId") REFERENCES "admins"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
