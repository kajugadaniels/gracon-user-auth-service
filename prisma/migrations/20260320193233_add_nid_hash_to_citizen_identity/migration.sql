/*
  Warnings:

  - A unique constraint covering the columns `[nidHash]` on the table `citizen_identities` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `nidHash` to the `citizen_identities` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "citizen_identities" ADD COLUMN     "nidHash" TEXT NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "citizen_identities_nidHash_key" ON "citizen_identities"("nidHash");
