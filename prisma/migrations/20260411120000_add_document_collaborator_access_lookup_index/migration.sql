-- Speeds up "shared with me" document lookups without scanning every invite.
CREATE INDEX "document_collaborators_userId_invitationStatus_isActive_idx"
ON "document_collaborators"("userId", "invitationStatus", "isActive");
