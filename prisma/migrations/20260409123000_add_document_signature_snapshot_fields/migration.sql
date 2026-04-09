ALTER TABLE "documents"
ADD COLUMN "signerDisplayName" TEXT,
ADD COLUMN "signatureImageS3Key" TEXT,
ADD COLUMN "signatureImageMimeType" TEXT,
ADD COLUMN "signatureImageSizeBytes" INTEGER;
