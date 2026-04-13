ALTER TYPE "DocumentAccessAuditEvent"
ADD VALUE IF NOT EXISTS 'INVITE_EMAIL_OTP_REQUIRED';

ALTER TYPE "DocumentAccessAuditEvent"
ADD VALUE IF NOT EXISTS 'INVITE_EMAIL_OTP_SENT';

ALTER TYPE "DocumentAccessAuditEvent"
ADD VALUE IF NOT EXISTS 'INVITE_EMAIL_OTP_FAILED';

ALTER TYPE "DocumentAccessAuditEvent"
ADD VALUE IF NOT EXISTS 'INVITE_EMAIL_OTP_PASSED';

CREATE TABLE "document_invitation_verification_sessions" (
    "id" TEXT NOT NULL,
    "collaboratorId" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "emailOtpCodeHash" TEXT,
    "emailOtpSentAt" TIMESTAMP(3),
    "emailOtpExpiresAt" TIMESTAMP(3),
    "emailOtpVerifiedAt" TIMESTAMP(3),
    "emailOtpAttemptCount" INTEGER NOT NULL DEFAULT 0,
    "emailOtpRequestCount" INTEGER NOT NULL DEFAULT 0,
    "emailOtpWindowStartedAt" TIMESTAMP(3),
    "identityVerifiedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "document_invitation_verification_sessions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "document_invitation_verification_sessions_collaboratorId_key"
ON "document_invitation_verification_sessions"("collaboratorId");

CREATE INDEX "document_invitation_verification_sessions_documentId_idx"
ON "document_invitation_verification_sessions"("documentId");

CREATE INDEX "document_invitation_verification_sessions_userId_expiresAt_idx"
ON "document_invitation_verification_sessions"("userId", "expiresAt");

CREATE INDEX "document_invitation_verification_sessions_completedAt_idx"
ON "document_invitation_verification_sessions"("completedAt");

ALTER TABLE "document_invitation_verification_sessions"
ADD CONSTRAINT "document_invitation_verification_sessions_collaboratorId_fkey"
FOREIGN KEY ("collaboratorId") REFERENCES "document_collaborators"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "document_invitation_verification_sessions"
ADD CONSTRAINT "document_invitation_verification_sessions_documentId_fkey"
FOREIGN KEY ("documentId") REFERENCES "documents"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "document_invitation_verification_sessions"
ADD CONSTRAINT "document_invitation_verification_sessions_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "users"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
