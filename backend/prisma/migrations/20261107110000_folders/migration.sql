-- AlterTable
ALTER TABLE "qr_codes" ADD COLUMN     "folderId" TEXT;

-- CreateTable
CREATE TABLE "folders" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "folders_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "folders_userId_name_key" ON "folders"("userId", "name");

-- CreateIndex
CREATE INDEX "qr_codes_folderId_idx" ON "qr_codes"("folderId");

-- AddForeignKey
ALTER TABLE "qr_codes" ADD CONSTRAINT "qr_codes_folderId_fkey" FOREIGN KEY ("folderId") REFERENCES "folders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "folders" ADD CONSTRAINT "folders_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
