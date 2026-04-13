ALTER TABLE "document_invitation_verification_sessions"
ADD COLUMN "identityChallengeStartedAt" TIMESTAMP(3),
ADD COLUMN "identityVerificationAttemptId" TEXT;
