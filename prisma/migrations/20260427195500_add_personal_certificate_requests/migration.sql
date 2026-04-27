-- CreateEnum
CREATE TYPE "CertificateRequestStatus" AS ENUM (
  'PENDING',
  'APPROVED',
  'REJECTED',
  'CANCELLED'
);

-- CreateTable
CREATE TABLE "personal_certificate_requests" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "keyPairId" TEXT NOT NULL,
  "status" "CertificateRequestStatus" NOT NULL DEFAULT 'PENDING',
  "requestedValidityYears" INTEGER NOT NULL DEFAULT 2,
  "reviewReason" TEXT,
  "cancellationReason" TEXT,
  "reviewedByAdminId" TEXT,
  "reviewedAt" TIMESTAMP(3),
  "cancelledAt" TIMESTAMP(3),
  "issuedCertificateId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "personal_certificate_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "personal_certificate_requests_issuedCertificateId_key"
ON "personal_certificate_requests"("issuedCertificateId");

CREATE INDEX "personal_certificate_requests_userId_status_createdAt_idx"
ON "personal_certificate_requests"("userId", "status", "createdAt");

CREATE INDEX "personal_certificate_requests_keyPairId_status_idx"
ON "personal_certificate_requests"("keyPairId", "status");

-- AddForeignKey
ALTER TABLE "personal_certificate_requests"
ADD CONSTRAINT "personal_certificate_requests_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "users"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "personal_certificate_requests"
ADD CONSTRAINT "personal_certificate_requests_keyPairId_fkey"
FOREIGN KEY ("keyPairId") REFERENCES "personal_key_pairs"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "personal_certificate_requests"
ADD CONSTRAINT "personal_certificate_requests_issuedCertificateId_fkey"
FOREIGN KEY ("issuedCertificateId") REFERENCES "personal_certificates"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
