-- CreateEnum
CREATE TYPE "InstitutionType" AS ENUM ('COMPANY', 'NGO', 'GOVERNMENT', 'OTHER');

-- CreateEnum
CREATE TYPE "InstitutionKeyAlgorithm" AS ENUM ('RSA_2048', 'ED25519');

-- CreateTable
CREATE TABLE "institutions" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "InstitutionType" NOT NULL,
    "registrationNumber" TEXT NOT NULL,
    "country" TEXT NOT NULL DEFAULT 'RW',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdByAdminId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "institutions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "institution_members" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "institutionId" TEXT NOT NULL,
    "roleTitle" TEXT NOT NULL,
    "hasAdminRole" BOOLEAN NOT NULL DEFAULT false,
    "stampAuthority" BOOLEAN NOT NULL DEFAULT false,
    "resolutionId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "addedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "institution_members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "authority_resolutions" (
    "id" TEXT NOT NULL,
    "institutionId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "grantedBy" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "revokedAt" TIMESTAMP(3),
    "revokedReason" TEXT,
    "validFrom" TIMESTAMP(3) NOT NULL,
    "validUntil" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "authority_resolutions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "institution_stamp_images" (
    "id" TEXT NOT NULL,
    "institutionId" TEXT NOT NULL,
    "s3Key" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "uploadedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "institution_stamp_images_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "institution_key_pairs" (
    "id" TEXT NOT NULL,
    "institutionId" TEXT NOT NULL,
    "algorithm" "InstitutionKeyAlgorithm" NOT NULL,
    "publicKey" TEXT NOT NULL,
    "privateKeyEncrypted" TEXT,
    "keyHandle" TEXT,
    "fingerprint" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "generatedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "institution_key_pairs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "institution_certificates" (
    "id" TEXT NOT NULL,
    "institutionId" TEXT NOT NULL,
    "keyPairId" TEXT NOT NULL,
    "serialNumber" TEXT NOT NULL,
    "subjectCN" TEXT NOT NULL,
    "subjectO" TEXT NOT NULL DEFAULT 'ID Verification Platform',
    "subjectOU" TEXT NOT NULL DEFAULT 'Institutional Certificate',
    "subjectC" TEXT NOT NULL DEFAULT 'RW',
    "subjectInstId" TEXT NOT NULL,
    "notBefore" TIMESTAMP(3) NOT NULL,
    "notAfter" TIMESTAMP(3) NOT NULL,
    "certificatePem" TEXT NOT NULL,
    "isRevoked" BOOLEAN NOT NULL DEFAULT false,
    "revokedAt" TIMESTAMP(3),
    "revokedReason" TEXT,
    "issuedByAdminId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "institution_certificates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "institution_stamps" (
    "id" TEXT NOT NULL,
    "institutionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "resolutionId" TEXT NOT NULL,
    "institutionCertificateId" TEXT NOT NULL,
    "personalCertificateId" TEXT NOT NULL,
    "documentName" TEXT NOT NULL,
    "documentHash" TEXT NOT NULL,
    "institutionSignatureBytes" TEXT NOT NULL,
    "userSignatureBytes" TEXT NOT NULL,
    "roleTitle" TEXT NOT NULL,
    "metadata" JSONB,
    "stampedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "institution_stamps_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "institution_stamp_verifications" (
    "id" TEXT NOT NULL,
    "institutionCertificateId" TEXT NOT NULL,
    "personalCertificateId" TEXT NOT NULL,
    "verifiedByUserId" TEXT,
    "documentHash" TEXT NOT NULL,
    "institutionSigValid" BOOLEAN NOT NULL,
    "userSigValid" BOOLEAN NOT NULL,
    "result" BOOLEAN NOT NULL,
    "failReason" TEXT,
    "ipAddress" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "institution_stamp_verifications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "institutions_registrationNumber_key" ON "institutions"("registrationNumber");

-- CreateIndex
CREATE INDEX "institutions_registrationNumber_idx" ON "institutions"("registrationNumber");

-- CreateIndex
CREATE INDEX "institution_members_institutionId_idx" ON "institution_members"("institutionId");

-- CreateIndex
CREATE INDEX "institution_members_userId_idx" ON "institution_members"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "institution_members_userId_institutionId_key" ON "institution_members"("userId", "institutionId");

-- CreateIndex
CREATE INDEX "authority_resolutions_institutionId_idx" ON "authority_resolutions"("institutionId");

-- CreateIndex
CREATE INDEX "institution_stamp_images_institutionId_idx" ON "institution_stamp_images"("institutionId");

-- CreateIndex
CREATE INDEX "institution_key_pairs_institutionId_idx" ON "institution_key_pairs"("institutionId");

-- CreateIndex
CREATE UNIQUE INDEX "institution_certificates_keyPairId_key" ON "institution_certificates"("keyPairId");

-- CreateIndex
CREATE UNIQUE INDEX "institution_certificates_serialNumber_key" ON "institution_certificates"("serialNumber");

-- CreateIndex
CREATE INDEX "institution_certificates_institutionId_idx" ON "institution_certificates"("institutionId");

-- CreateIndex
CREATE INDEX "institution_certificates_serialNumber_idx" ON "institution_certificates"("serialNumber");

-- CreateIndex
CREATE INDEX "institution_stamps_institutionId_idx" ON "institution_stamps"("institutionId");

-- CreateIndex
CREATE INDEX "institution_stamps_userId_idx" ON "institution_stamps"("userId");

-- CreateIndex
CREATE INDEX "institution_stamps_documentHash_idx" ON "institution_stamps"("documentHash");

-- CreateIndex
CREATE INDEX "institution_stamps_stampedAt_idx" ON "institution_stamps"("stampedAt");

-- CreateIndex
CREATE INDEX "institution_stamp_verifications_institutionCertificateId_idx" ON "institution_stamp_verifications"("institutionCertificateId");

-- CreateIndex
CREATE INDEX "institution_stamp_verifications_personalCertificateId_idx" ON "institution_stamp_verifications"("personalCertificateId");

-- CreateIndex
CREATE INDEX "institution_stamp_verifications_createdAt_idx" ON "institution_stamp_verifications"("createdAt");

-- AddForeignKey
ALTER TABLE "institution_members" ADD CONSTRAINT "institution_members_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "institution_members" ADD CONSTRAINT "institution_members_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "institutions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "institution_members" ADD CONSTRAINT "institution_members_resolutionId_fkey" FOREIGN KEY ("resolutionId") REFERENCES "authority_resolutions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "authority_resolutions" ADD CONSTRAINT "authority_resolutions_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "institutions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "institution_stamp_images" ADD CONSTRAINT "institution_stamp_images_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "institutions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "institution_key_pairs" ADD CONSTRAINT "institution_key_pairs_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "institutions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "institution_certificates" ADD CONSTRAINT "institution_certificates_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "institutions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "institution_certificates" ADD CONSTRAINT "institution_certificates_keyPairId_fkey" FOREIGN KEY ("keyPairId") REFERENCES "institution_key_pairs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "institution_stamps" ADD CONSTRAINT "institution_stamps_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "institutions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "institution_stamps" ADD CONSTRAINT "institution_stamps_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "institution_stamps" ADD CONSTRAINT "institution_stamps_resolutionId_fkey" FOREIGN KEY ("resolutionId") REFERENCES "authority_resolutions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "institution_stamps" ADD CONSTRAINT "institution_stamps_institutionCertificateId_fkey" FOREIGN KEY ("institutionCertificateId") REFERENCES "institution_certificates"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
