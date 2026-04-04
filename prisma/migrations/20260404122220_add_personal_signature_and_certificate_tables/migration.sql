-- CreateEnum
CREATE TYPE "PersonalKeyAlgorithm" AS ENUM ('RSA_2048', 'ED25519');

-- CreateTable
CREATE TABLE "personal_signature_images" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "s3Key" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "personal_signature_images_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "personal_key_pairs" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "algorithm" "PersonalKeyAlgorithm" NOT NULL,
    "publicKey" TEXT NOT NULL,
    "privateKeyEncrypted" TEXT,
    "keyHandle" TEXT,
    "fingerprint" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "personal_key_pairs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "personal_certificates" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "keyPairId" TEXT NOT NULL,
    "serialNumber" TEXT NOT NULL,
    "subjectCN" TEXT NOT NULL,
    "subjectO" TEXT NOT NULL DEFAULT 'ID Verification Platform',
    "subjectC" TEXT NOT NULL DEFAULT 'RW',
    "subjectUserId" TEXT NOT NULL,
    "notBefore" TIMESTAMP(3) NOT NULL,
    "notAfter" TIMESTAMP(3) NOT NULL,
    "certificatePem" TEXT NOT NULL,
    "isRevoked" BOOLEAN NOT NULL DEFAULT false,
    "revokedAt" TIMESTAMP(3),
    "revokedReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "personal_certificates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "personal_signed_documents" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "certificateId" TEXT NOT NULL,
    "documentName" TEXT NOT NULL,
    "documentHash" TEXT NOT NULL,
    "signatureBytes" TEXT NOT NULL,
    "metadata" JSONB,
    "signedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "personal_signed_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "personal_signature_verifications" (
    "id" TEXT NOT NULL,
    "certificateId" TEXT NOT NULL,
    "verifiedByUserId" TEXT,
    "documentHash" TEXT NOT NULL,
    "result" BOOLEAN NOT NULL,
    "failReason" TEXT,
    "ipAddress" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "personal_signature_verifications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "personal_signature_images_userId_idx" ON "personal_signature_images"("userId");

-- CreateIndex
CREATE INDEX "personal_key_pairs_userId_idx" ON "personal_key_pairs"("userId");

-- CreateIndex
CREATE INDEX "personal_key_pairs_fingerprint_idx" ON "personal_key_pairs"("fingerprint");

-- CreateIndex
CREATE UNIQUE INDEX "personal_certificates_keyPairId_key" ON "personal_certificates"("keyPairId");

-- CreateIndex
CREATE UNIQUE INDEX "personal_certificates_serialNumber_key" ON "personal_certificates"("serialNumber");

-- CreateIndex
CREATE INDEX "personal_certificates_userId_idx" ON "personal_certificates"("userId");

-- CreateIndex
CREATE INDEX "personal_certificates_serialNumber_idx" ON "personal_certificates"("serialNumber");

-- CreateIndex
CREATE INDEX "personal_certificates_notAfter_idx" ON "personal_certificates"("notAfter");

-- CreateIndex
CREATE INDEX "personal_signed_documents_userId_idx" ON "personal_signed_documents"("userId");

-- CreateIndex
CREATE INDEX "personal_signed_documents_certificateId_idx" ON "personal_signed_documents"("certificateId");

-- CreateIndex
CREATE INDEX "personal_signed_documents_documentHash_idx" ON "personal_signed_documents"("documentHash");

-- CreateIndex
CREATE INDEX "personal_signed_documents_signedAt_idx" ON "personal_signed_documents"("signedAt");

-- CreateIndex
CREATE INDEX "personal_signature_verifications_certificateId_idx" ON "personal_signature_verifications"("certificateId");

-- CreateIndex
CREATE INDEX "personal_signature_verifications_createdAt_idx" ON "personal_signature_verifications"("createdAt");

-- CreateIndex
CREATE INDEX "id_verifications_passed_createdAt_idx" ON "id_verifications"("passed", "createdAt");

-- CreateIndex
CREATE INDEX "security_event_logs_eventType_createdAt_idx" ON "security_event_logs"("eventType", "createdAt");

-- CreateIndex
CREATE INDEX "security_event_logs_userId_createdAt_idx" ON "security_event_logs"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "security_event_logs_ipAddress_createdAt_idx" ON "security_event_logs"("ipAddress", "createdAt");

-- CreateIndex
CREATE INDEX "users_createdAt_idx" ON "users"("createdAt");

-- CreateIndex
CREATE INDEX "users_isActive_createdAt_idx" ON "users"("isActive", "createdAt");

-- CreateIndex
CREATE INDEX "users_isVerified_isIdVerified_createdAt_idx" ON "users"("isVerified", "isIdVerified", "createdAt");

-- AddForeignKey
ALTER TABLE "personal_signature_images" ADD CONSTRAINT "personal_signature_images_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "personal_key_pairs" ADD CONSTRAINT "personal_key_pairs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "personal_certificates" ADD CONSTRAINT "personal_certificates_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "personal_certificates" ADD CONSTRAINT "personal_certificates_keyPairId_fkey" FOREIGN KEY ("keyPairId") REFERENCES "personal_key_pairs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "personal_signed_documents" ADD CONSTRAINT "personal_signed_documents_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "personal_signed_documents" ADD CONSTRAINT "personal_signed_documents_certificateId_fkey" FOREIGN KEY ("certificateId") REFERENCES "personal_certificates"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "personal_signature_verifications" ADD CONSTRAINT "personal_signature_verifications_certificateId_fkey" FOREIGN KEY ("certificateId") REFERENCES "personal_certificates"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
