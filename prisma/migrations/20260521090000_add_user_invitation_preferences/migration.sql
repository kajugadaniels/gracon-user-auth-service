-- CreateEnum
CREATE TYPE "UserInviteVerificationPreference" AS ENUM ('NO_VERIFICATION', 'EMAIL_OTP', 'IDENTITY_VERIFICATION');

-- CreateTable
CREATE TABLE "user_preferences" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "defaultDocumentInviteVerifications" "UserInviteVerificationPreference"[] NOT NULL DEFAULT ARRAY['NO_VERIFICATION']::"UserInviteVerificationPreference"[],
    "defaultMeetingInviteVerifications" "UserInviteVerificationPreference"[] NOT NULL DEFAULT ARRAY['NO_VERIFICATION']::"UserInviteVerificationPreference"[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_preferences_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "user_preferences_userId_key" ON "user_preferences"("userId");

-- CreateIndex
CREATE INDEX "user_preferences_updatedAt_idx" ON "user_preferences"("updatedAt");

-- AddForeignKey
ALTER TABLE "user_preferences" ADD CONSTRAINT "user_preferences_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
