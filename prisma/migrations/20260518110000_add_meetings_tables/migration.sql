-- CreateEnum
CREATE TYPE "MeetingStatus" AS ENUM (
    'DRAFT',
    'SCHEDULED',
    'LIVE',
    'ENDED',
    'CANCELLED'
);

-- CreateEnum
CREATE TYPE "MeetingVisibility" AS ENUM (
    'PRIVATE',
    'INVITE_ONLY',
    'LINK_ACCESS'
);

-- CreateEnum
CREATE TYPE "MeetingParticipantRole" AS ENUM (
    'HOST',
    'CO_HOST',
    'PARTICIPANT',
    'VIEWER'
);

-- CreateEnum
CREATE TYPE "MeetingParticipantStatus" AS ENUM (
    'INVITED',
    'ACCEPTED',
    'DECLINED',
    'JOINED',
    'LEFT',
    'REMOVED'
);

-- CreateEnum
CREATE TYPE "MeetingRecordingStatus" AS ENUM (
    'STARTING',
    'RECORDING',
    'PROCESSING',
    'READY',
    'FAILED',
    'DELETED'
);

-- CreateEnum
CREATE TYPE "MeetingRecordingProvider" AS ENUM (
    'STREAM'
);

-- CreateEnum
CREATE TYPE "MeetingAuditEvent" AS ENUM (
    'MEETING_CREATED',
    'MEETING_UPDATED',
    'MEETING_SCHEDULED',
    'MEETING_STARTED',
    'MEETING_ENDED',
    'MEETING_CANCELLED',
    'PARTICIPANT_INVITED',
    'PARTICIPANT_JOINED',
    'PARTICIPANT_LEFT',
    'PARTICIPANT_REMOVED',
    'INVITE_ACCEPTED',
    'INVITE_REVOKED',
    'RECORDING_STARTED',
    'RECORDING_STOPPED',
    'RECORDING_READY',
    'RECORDING_FAILED',
    'STREAM_TOKEN_ISSUED'
);

-- CreateTable
CREATE TABLE "meetings" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "title" VARCHAR(180) NOT NULL,
    "description" TEXT,
    "status" "MeetingStatus" NOT NULL DEFAULT 'DRAFT',
    "visibility" "MeetingVisibility" NOT NULL DEFAULT 'INVITE_ONLY',
    "streamCallType" VARCHAR(60) NOT NULL DEFAULT 'default',
    "streamCallId" VARCHAR(160) NOT NULL,
    "scheduledStartAt" TIMESTAMP(3),
    "scheduledEndAt" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3),
    "endedAt" TIMESTAMP(3),
    "recordingEnabled" BOOLEAN NOT NULL DEFAULT false,
    "waitingRoomEnabled" BOOLEAN NOT NULL DEFAULT true,
    "joinBeforeHost" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "meetings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "meeting_participants" (
    "id" TEXT NOT NULL,
    "meetingId" TEXT NOT NULL,
    "userId" TEXT,
    "email" VARCHAR(255) NOT NULL,
    "displayName" VARCHAR(180),
    "role" "MeetingParticipantRole" NOT NULL DEFAULT 'PARTICIPANT',
    "status" "MeetingParticipantStatus" NOT NULL DEFAULT 'INVITED',
    "joinedAt" TIMESTAMP(3),
    "leftAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "meeting_participants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "meeting_invites" (
    "id" TEXT NOT NULL,
    "meetingId" TEXT NOT NULL,
    "inviterId" TEXT NOT NULL,
    "invitedUserId" TEXT,
    "email" VARCHAR(255) NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "acceptedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "meeting_invites_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "meeting_recordings" (
    "id" TEXT NOT NULL,
    "meetingId" TEXT NOT NULL,
    "startedById" TEXT,
    "status" "MeetingRecordingStatus" NOT NULL DEFAULT 'STARTING',
    "provider" "MeetingRecordingProvider" NOT NULL DEFAULT 'STREAM',
    "providerRecordingId" TEXT,
    "providerAssetUrl" TEXT,
    "s3Key" TEXT,
    "durationSeconds" INTEGER,
    "sizeBytes" INTEGER,
    "startedAt" TIMESTAMP(3),
    "endedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "meeting_recordings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "meeting_audit_logs" (
    "id" TEXT NOT NULL,
    "meetingId" TEXT NOT NULL,
    "actorId" TEXT,
    "targetUserId" TEXT,
    "eventType" "MeetingAuditEvent" NOT NULL,
    "metadata" JSONB,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "meeting_audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "meetings_streamCallId_key" ON "meetings"("streamCallId");

-- CreateIndex
CREATE INDEX "meetings_ownerId_createdAt_idx" ON "meetings"("ownerId", "createdAt");

-- CreateIndex
CREATE INDEX "meetings_status_scheduledStartAt_idx" ON "meetings"("status", "scheduledStartAt");

-- CreateIndex
CREATE INDEX "meetings_visibility_createdAt_idx" ON "meetings"("visibility", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "meeting_participants_meetingId_userId_key" ON "meeting_participants"("meetingId", "userId");

-- CreateIndex
CREATE INDEX "meeting_participants_meetingId_status_idx" ON "meeting_participants"("meetingId", "status");

-- CreateIndex
CREATE INDEX "meeting_participants_userId_createdAt_idx" ON "meeting_participants"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "meeting_participants_email_idx" ON "meeting_participants"("email");

-- CreateIndex
CREATE UNIQUE INDEX "meeting_invites_tokenHash_key" ON "meeting_invites"("tokenHash");

-- CreateIndex
CREATE INDEX "meeting_invites_meetingId_createdAt_idx" ON "meeting_invites"("meetingId", "createdAt");

-- CreateIndex
CREATE INDEX "meeting_invites_invitedUserId_createdAt_idx" ON "meeting_invites"("invitedUserId", "createdAt");

-- CreateIndex
CREATE INDEX "meeting_invites_email_idx" ON "meeting_invites"("email");

-- CreateIndex
CREATE INDEX "meeting_invites_expiresAt_idx" ON "meeting_invites"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "meeting_recordings_providerRecordingId_key" ON "meeting_recordings"("providerRecordingId");

-- CreateIndex
CREATE INDEX "meeting_recordings_meetingId_createdAt_idx" ON "meeting_recordings"("meetingId", "createdAt");

-- CreateIndex
CREATE INDEX "meeting_recordings_startedById_createdAt_idx" ON "meeting_recordings"("startedById", "createdAt");

-- CreateIndex
CREATE INDEX "meeting_recordings_status_createdAt_idx" ON "meeting_recordings"("status", "createdAt");

-- CreateIndex
CREATE INDEX "meeting_audit_logs_meetingId_createdAt_idx" ON "meeting_audit_logs"("meetingId", "createdAt");

-- CreateIndex
CREATE INDEX "meeting_audit_logs_actorId_createdAt_idx" ON "meeting_audit_logs"("actorId", "createdAt");

-- CreateIndex
CREATE INDEX "meeting_audit_logs_targetUserId_createdAt_idx" ON "meeting_audit_logs"("targetUserId", "createdAt");

-- CreateIndex
CREATE INDEX "meeting_audit_logs_eventType_createdAt_idx" ON "meeting_audit_logs"("eventType", "createdAt");

-- AddForeignKey
ALTER TABLE "meetings"
ADD CONSTRAINT "meetings_ownerId_fkey"
FOREIGN KEY ("ownerId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meeting_participants"
ADD CONSTRAINT "meeting_participants_meetingId_fkey"
FOREIGN KEY ("meetingId") REFERENCES "meetings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meeting_participants"
ADD CONSTRAINT "meeting_participants_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meeting_invites"
ADD CONSTRAINT "meeting_invites_meetingId_fkey"
FOREIGN KEY ("meetingId") REFERENCES "meetings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meeting_invites"
ADD CONSTRAINT "meeting_invites_inviterId_fkey"
FOREIGN KEY ("inviterId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meeting_invites"
ADD CONSTRAINT "meeting_invites_invitedUserId_fkey"
FOREIGN KEY ("invitedUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meeting_recordings"
ADD CONSTRAINT "meeting_recordings_meetingId_fkey"
FOREIGN KEY ("meetingId") REFERENCES "meetings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meeting_recordings"
ADD CONSTRAINT "meeting_recordings_startedById_fkey"
FOREIGN KEY ("startedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meeting_audit_logs"
ADD CONSTRAINT "meeting_audit_logs_meetingId_fkey"
FOREIGN KEY ("meetingId") REFERENCES "meetings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meeting_audit_logs"
ADD CONSTRAINT "meeting_audit_logs_actorId_fkey"
FOREIGN KEY ("actorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meeting_audit_logs"
ADD CONSTRAINT "meeting_audit_logs_targetUserId_fkey"
FOREIGN KEY ("targetUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
