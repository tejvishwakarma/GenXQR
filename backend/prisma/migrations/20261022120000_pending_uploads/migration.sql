-- Uploads not yet attached to a QR code (security audit, 22 Oct 2026).
-- See uploads.service.ts.

-- CreateTable
CREATE TABLE "pending_uploads" (
    "path" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "uploaderId" TEXT NOT NULL,
    "sizeBytes" BIGINT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "fileType" "FileType" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pending_uploads_pkey" PRIMARY KEY ("path")
);

-- CreateIndex
CREATE INDEX "pending_uploads_ownerId_idx" ON "pending_uploads"("ownerId");

-- CreateIndex
CREATE INDEX "pending_uploads_createdAt_idx" ON "pending_uploads"("createdAt");
