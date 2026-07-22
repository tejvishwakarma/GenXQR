-- AlterTable
ALTER TABLE "support_tickets" ADD COLUMN     "category" TEXT NOT NULL DEFAULT 'general';

-- CreateTable
CREATE TABLE "static_qr_generations" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "ip" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "static_qr_generations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "static_qr_generations_type_idx" ON "static_qr_generations"("type");

-- CreateIndex
CREATE INDEX "static_qr_generations_createdAt_idx" ON "static_qr_generations"("createdAt");
