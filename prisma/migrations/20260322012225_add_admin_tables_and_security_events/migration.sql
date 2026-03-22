-- CreateEnum
CREATE TYPE "SecurityEvent" AS ENUM ('LOGIN_FAILED', 'LOGIN_SUCCESS', 'VERIFICATION_FAILED', 'VERIFICATION_PASSED', 'PASSWORD_RESET_REQUESTED', 'PASSWORD_CHANGED', 'SESSIONS_REVOKED_BY_USER', 'REVOKED_TOKEN_REUSE', 'RATE_LIMIT_EXCEEDED');

-- CreateEnum
CREATE TYPE "AdminRole" AS ENUM ('ADMIN', 'SUPER_ADMIN');

-- CreateEnum
CREATE TYPE "AdminAction" AS ENUM ('USER_DEACTIVATED', 'USER_REACTIVATED', 'SESSIONS_REVOKED', 'ID_STATUS_CHANGED', 'NID_DECRYPTED', 'PID_DECRYPTED', 'USER_DETAIL_VIEWED', 'ADMIN_CREATED', 'ADMIN_DEACTIVATED', 'ADMIN_REACTIVATED', 'ADMIN_INVITE_RESENT');

-- CreateTable
CREATE TABLE "security_event_logs" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "eventType" "SecurityEvent" NOT NULL,
    "metadata" JSONB,
    "ipAddress" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "security_event_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "admins" (
    "id" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phoneNumber" TEXT,
    "passwordHash" TEXT,
    "role" "AdminRole" NOT NULL DEFAULT 'ADMIN',
    "isVerified" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "admins_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "admin_refresh_tokens" (
    "id" TEXT NOT NULL,
    "adminId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revoked" BOOLEAN NOT NULL DEFAULT false,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "admin_refresh_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "admin_invite_tokens" (
    "id" TEXT NOT NULL,
    "adminId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "used" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "admin_invite_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "admin_audit_logs" (
    "id" TEXT NOT NULL,
    "adminId" TEXT NOT NULL,
    "action" "AdminAction" NOT NULL,
    "targetUserId" TEXT,
    "metadata" JSONB,
    "ipAddress" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "admin_audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "security_event_logs_userId_idx" ON "security_event_logs"("userId");

-- CreateIndex
CREATE INDEX "security_event_logs_eventType_idx" ON "security_event_logs"("eventType");

-- CreateIndex
CREATE INDEX "security_event_logs_createdAt_idx" ON "security_event_logs"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "admins_email_key" ON "admins"("email");

-- CreateIndex
CREATE UNIQUE INDEX "admin_refresh_tokens_tokenHash_key" ON "admin_refresh_tokens"("tokenHash");

-- CreateIndex
CREATE INDEX "admin_refresh_tokens_adminId_idx" ON "admin_refresh_tokens"("adminId");

-- CreateIndex
CREATE UNIQUE INDEX "admin_invite_tokens_adminId_key" ON "admin_invite_tokens"("adminId");

-- CreateIndex
CREATE UNIQUE INDEX "admin_invite_tokens_tokenHash_key" ON "admin_invite_tokens"("tokenHash");

-- CreateIndex
CREATE INDEX "admin_audit_logs_adminId_idx" ON "admin_audit_logs"("adminId");

-- CreateIndex
CREATE INDEX "admin_audit_logs_targetUserId_idx" ON "admin_audit_logs"("targetUserId");

-- CreateIndex
CREATE INDEX "admin_audit_logs_createdAt_idx" ON "admin_audit_logs"("createdAt");

-- CreateIndex
CREATE INDEX "admin_audit_logs_action_idx" ON "admin_audit_logs"("action");

-- AddForeignKey
ALTER TABLE "security_event_logs" ADD CONSTRAINT "security_event_logs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admins" ADD CONSTRAINT "admins_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "admins"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admin_refresh_tokens" ADD CONSTRAINT "admin_refresh_tokens_adminId_fkey" FOREIGN KEY ("adminId") REFERENCES "admins"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admin_invite_tokens" ADD CONSTRAINT "admin_invite_tokens_adminId_fkey" FOREIGN KEY ("adminId") REFERENCES "admins"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admin_audit_logs" ADD CONSTRAINT "admin_audit_logs_adminId_fkey" FOREIGN KEY ("adminId") REFERENCES "admins"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
