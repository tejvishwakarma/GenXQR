-- Customer activity log (decided 31 Oct 2026): which account each audit entry
-- belongs to. Column + index, then a best-effort backfill of existing rows.
ALTER TABLE "audit_logs" ADD COLUMN "ownerId" TEXT;
CREATE INDEX "audit_logs_ownerId_createdAt_idx" ON "audit_logs"("ownerId", "createdAt");

-- Code actions belong to the code's owner while the code still exists (covers
-- team members editing in the owner's workspace)...
UPDATE "audit_logs" a SET "ownerId" = q."userId"
FROM "qr_codes" q
WHERE a."category" = 'qr' AND a."entityType" = 'QRCode' AND a."entityId" = q."id" AND q."userId" IS NOT NULL;

-- ...everything else (not internal admin actions) to the person who acted.
UPDATE "audit_logs" SET "ownerId" = "userId" WHERE "ownerId" IS NULL AND "category" <> 'admin';
