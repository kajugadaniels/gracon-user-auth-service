-- Ensures each document has at most one active signing requirement per user.
CREATE UNIQUE INDEX IF NOT EXISTS "document_signature_requests_documentId_requestedUserId_key"
ON "document_signature_requests"("documentId", "requestedUserId");
