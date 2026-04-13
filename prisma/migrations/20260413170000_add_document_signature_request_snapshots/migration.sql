ALTER TABLE "document_signature_requests"
ADD COLUMN "signerDisplayNameSnapshot" TEXT,
ADD COLUMN "signerEmailSnapshot" TEXT,
ADD COLUMN "signatureImageS3KeySnapshot" TEXT,
ADD COLUMN "signatureImageMimeTypeSnapshot" TEXT,
ADD COLUMN "signatureImageSizeBytesSnapshot" INTEGER;
