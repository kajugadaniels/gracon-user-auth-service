-- AlterTable
ALTER TABLE "refresh_tokens" ADD COLUMN     "tokenType" TEXT NOT NULL DEFAULT 'full';
