-- CreateEnum
CREATE TYPE "MeetingInviteVerificationRequirement" AS ENUM ('EMAIL_OTP', 'IDENTITY_VERIFICATION');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "MeetingAuditEvent" ADD VALUE 'INVITE_CREATED';
ALTER TYPE "MeetingAuditEvent" ADD VALUE 'INVITE_EMAIL_QUEUED';
ALTER TYPE "MeetingAuditEvent" ADD VALUE 'INVITE_EMAIL_SENT';
ALTER TYPE "MeetingAuditEvent" ADD VALUE 'INVITE_EMAIL_FAILED';
ALTER TYPE "MeetingAuditEvent" ADD VALUE 'INVITE_OPENED';
ALTER TYPE "MeetingAuditEvent" ADD VALUE 'INVITE_AUTH_REQUIRED';
ALTER TYPE "MeetingAuditEvent" ADD VALUE 'INVITE_LOGIN_COMPLETED';
ALTER TYPE "MeetingAuditEvent" ADD VALUE 'INVITE_EMAIL_OTP_REQUIRED';
ALTER TYPE "MeetingAuditEvent" ADD VALUE 'INVITE_EMAIL_OTP_SENT';
ALTER TYPE "MeetingAuditEvent" ADD VALUE 'INVITE_EMAIL_OTP_PASSED';
ALTER TYPE "MeetingAuditEvent" ADD VALUE 'INVITE_IDENTITY_REQUIRED';
ALTER TYPE "MeetingAuditEvent" ADD VALUE 'INVITE_IDENTITY_PASSED';
ALTER TYPE "MeetingAuditEvent" ADD VALUE 'RECORDING_REQUESTED';

-- AlterTable
ALTER TABLE "meeting_invites" ADD COLUMN     "completedAt" TIMESTAMP(3),
ADD COLUMN     "emailOtpAttemptCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "emailOtpCodeHash" TEXT,
ADD COLUMN     "emailOtpExpiresAt" TIMESTAMP(3),
ADD COLUMN     "emailOtpSentAt" TIMESTAMP(3),
ADD COLUMN     "emailOtpVerifiedAt" TIMESTAMP(3),
ADD COLUMN     "identityChallengeStartedAt" TIMESTAMP(3),
ADD COLUMN     "identityVerificationAttemptId" TEXT,
ADD COLUMN     "identityVerifiedAt" TIMESTAMP(3),
ADD COLUMN     "openedAt" TIMESTAMP(3),
ADD COLUMN     "requiredVerifications" "MeetingInviteVerificationRequirement"[] DEFAULT ARRAY['EMAIL_OTP']::"MeetingInviteVerificationRequirement"[];
