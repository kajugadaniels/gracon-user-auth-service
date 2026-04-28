CREATE TYPE "CertificateAccessPolicyStatus" AS ENUM ('ALLOWED', 'BANNED');

CREATE TABLE "personal_certificate_access_policies" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" "CertificateAccessPolicyStatus" NOT NULL DEFAULT 'ALLOWED',
    "banReason" TEXT,
    "bannedByAdminId" TEXT,
    "bannedAt" TIMESTAMP(3),
    "unbanReason" TEXT,
    "unbannedByAdminId" TEXT,
    "unbannedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "personal_certificate_access_policies_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "personal_certificate_access_policies_userId_key"
ON "personal_certificate_access_policies"("userId");

CREATE INDEX "personal_certificate_access_policies_status_updatedAt_idx"
ON "personal_certificate_access_policies"("status", "updatedAt");

ALTER TABLE "personal_certificate_access_policies"
ADD CONSTRAINT "personal_certificate_access_policies_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "users"("id")
ON DELETE CASCADE
ON UPDATE CASCADE;

ALTER TYPE "AdminAction" ADD VALUE 'CERTIFICATE_ACCESS_BANNED';
ALTER TYPE "AdminAction" ADD VALUE 'CERTIFICATE_ACCESS_BAN_LIFTED';
