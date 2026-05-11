-- CreateEnum
CREATE TYPE "DocumentInvitationVerificationRequirement" AS ENUM ('EMAIL_OTP', 'IDENTITY_VERIFICATION');

-- AlterTable
ALTER TABLE "document_collaborators" ADD COLUMN     "requiredVerifications" "DocumentInvitationVerificationRequirement"[] DEFAULT ARRAY['EMAIL_OTP', 'IDENTITY_VERIFICATION']::"DocumentInvitationVerificationRequirement"[];
