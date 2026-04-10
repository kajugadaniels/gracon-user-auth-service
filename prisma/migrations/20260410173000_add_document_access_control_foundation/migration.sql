-- CreateEnum
CREATE TYPE "CollaboratorPermission" AS ENUM (
    'READ',
    'COMMENT',
    'SIGN',
    'EDIT',
    'MANAGE_ACCESS'
);

-- CreateEnum
CREATE TYPE "CollaboratorInvitationStatus" AS ENUM (
    'PENDING',
    'ACCEPTED',
    'DECLINED',
    'REVOKED',
    'EXPIRED'
);

-- CreateEnum
CREATE TYPE "DocumentAccessAuditEvent" AS ENUM (
    'INVITE_CREATED',
    'INVITE_EMAIL_QUEUED',
    'INVITE_EMAIL_SENT',
    'INVITE_EMAIL_FAILED',
    'INVITE_OPENED',
    'AUTH_REQUIRED',
    'LOGIN_COMPLETED',
    'IDENTITY_VERIFICATION_REQUIRED',
    'IDENTITY_VERIFICATION_PASSED',
    'IDENTITY_VERIFICATION_FAILED',
    'INVITE_ACCEPTED',
    'INVITE_DECLINED',
    'INVITE_REVOKED',
    'PERMISSIONS_UPDATED'
);

-- AlterTable
ALTER TABLE "document_collaborators"
    ADD COLUMN "permissions" "CollaboratorPermission"[] NOT NULL DEFAULT ARRAY['READ']::"CollaboratorPermission"[],
    ADD COLUMN "invitedByUserId" TEXT,
    ADD COLUMN "invitationStatus" "CollaboratorInvitationStatus" NOT NULL DEFAULT 'PENDING',
    ADD COLUMN "invitationTokenHash" TEXT,
    ADD COLUMN "invitationExpiresAt" TIMESTAMP(3),
    ADD COLUMN "invitationEmailSentAt" TIMESTAMP(3),
    ADD COLUMN "invitationOpenedAt" TIMESTAMP(3),
    ADD COLUMN "declinedAt" TIMESTAMP(3),
    ADD COLUMN "revokedAt" TIMESTAMP(3),
    ADD COLUMN "note" TEXT,
    ALTER COLUMN "isActive" SET DEFAULT false;

-- Backfill permissions from the legacy collaborator role so existing records
-- preserve their current capabilities while the application migrates.
UPDATE "document_collaborators"
SET "permissions" = CASE
    WHEN "role" = 'VIEWER' THEN ARRAY['READ', 'COMMENT']::"CollaboratorPermission"[]
    WHEN "role" = 'EDITOR' THEN ARRAY['READ', 'COMMENT', 'EDIT']::"CollaboratorPermission"[]
    WHEN "role" = 'SIGNER' THEN ARRAY['READ', 'SIGN']::"CollaboratorPermission"[]
    ELSE ARRAY['READ']::"CollaboratorPermission"[]
END;

-- Pending invitations must never grant live access. Accepted rows stay active;
-- inactive historical rows are treated as revoked for auditability.
UPDATE "document_collaborators"
SET "invitationStatus" = CASE
    WHEN "acceptedAt" IS NULL THEN 'PENDING'::"CollaboratorInvitationStatus"
    WHEN "isActive" = true THEN 'ACCEPTED'::"CollaboratorInvitationStatus"
    ELSE 'REVOKED'::"CollaboratorInvitationStatus"
END;

UPDATE "document_collaborators"
SET "isActive" = false
WHERE "acceptedAt" IS NULL;

UPDATE "document_collaborators"
SET "revokedAt" = CURRENT_TIMESTAMP
WHERE "acceptedAt" IS NOT NULL
  AND "isActive" = false
  AND "revokedAt" IS NULL;

-- CreateTable
CREATE TABLE "document_access_audit_logs" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "collaboratorId" TEXT,
    "actorUserId" TEXT,
    "targetUserId" TEXT,
    "eventType" "DocumentAccessAuditEvent" NOT NULL,
    "fromPermissions" "CollaboratorPermission"[] NOT NULL DEFAULT ARRAY[]::"CollaboratorPermission"[],
    "toPermissions" "CollaboratorPermission"[] NOT NULL DEFAULT ARRAY[]::"CollaboratorPermission"[],
    "invitationStatus" "CollaboratorInvitationStatus",
    "metadata" JSONB,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "document_access_audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "document_collaborators_invitationTokenHash_key"
ON "document_collaborators"("invitationTokenHash");

-- CreateIndex
CREATE INDEX "document_collaborators_invitedByUserId_idx"
ON "document_collaborators"("invitedByUserId");

-- CreateIndex
CREATE INDEX "document_collaborators_invitationStatus_idx"
ON "document_collaborators"("invitationStatus");

-- CreateIndex
CREATE INDEX "document_access_audit_logs_documentId_createdAt_idx"
ON "document_access_audit_logs"("documentId", "createdAt");

-- CreateIndex
CREATE INDEX "document_access_audit_logs_collaboratorId_createdAt_idx"
ON "document_access_audit_logs"("collaboratorId", "createdAt");

-- CreateIndex
CREATE INDEX "document_access_audit_logs_actorUserId_createdAt_idx"
ON "document_access_audit_logs"("actorUserId", "createdAt");

-- CreateIndex
CREATE INDEX "document_access_audit_logs_targetUserId_createdAt_idx"
ON "document_access_audit_logs"("targetUserId", "createdAt");

-- CreateIndex
CREATE INDEX "document_access_audit_logs_eventType_createdAt_idx"
ON "document_access_audit_logs"("eventType", "createdAt");

-- AddForeignKey
ALTER TABLE "document_collaborators"
ADD CONSTRAINT "document_collaborators_invitedByUserId_fkey"
FOREIGN KEY ("invitedByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_access_audit_logs"
ADD CONSTRAINT "document_access_audit_logs_documentId_fkey"
FOREIGN KEY ("documentId") REFERENCES "documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_access_audit_logs"
ADD CONSTRAINT "document_access_audit_logs_collaboratorId_fkey"
FOREIGN KEY ("collaboratorId") REFERENCES "document_collaborators"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_access_audit_logs"
ADD CONSTRAINT "document_access_audit_logs_actorUserId_fkey"
FOREIGN KEY ("actorUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_access_audit_logs"
ADD CONSTRAINT "document_access_audit_logs_targetUserId_fkey"
FOREIGN KEY ("targetUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
