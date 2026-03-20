-- AlterTable
ALTER TABLE "users" ADD COLUMN     "idVerifiedAt" TIMESTAMP(3),
ADD COLUMN     "isIdVerified" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "verificationAttempts" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "id_verifications" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "attemptNumber" INTEGER NOT NULL,
    "documentMatch" BOOLEAN NOT NULL,
    "faceScore" DOUBLE PRECISION NOT NULL,
    "livenessScore" DOUBLE PRECISION NOT NULL,
    "compositeScore" DOUBLE PRECISION NOT NULL,
    "passed" BOOLEAN NOT NULL,
    "failReason" TEXT,
    "ipAddress" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "id_verifications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "id_verifications_userId_createdAt_idx" ON "id_verifications"("userId", "createdAt");

-- AddForeignKey
ALTER TABLE "id_verifications" ADD CONSTRAINT "id_verifications_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
