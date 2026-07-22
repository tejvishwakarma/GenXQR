-- AlterTable
ALTER TABLE "webhook_deliveries" ADD COLUMN     "attemptNumber" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "lastError" TEXT,
ADD COLUMN     "maxAttempts" INTEGER NOT NULL DEFAULT 5,
ADD COLUMN     "nextRetryAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "webhooks" ADD COLUMN     "externalId" TEXT,
ADD COLUMN     "source" TEXT;

-- CreateIndex
CREATE INDEX "webhook_deliveries_success_nextRetryAt_idx" ON "webhook_deliveries"("success", "nextRetryAt");

-- CreateIndex
CREATE INDEX "webhooks_userId_source_idx" ON "webhooks"("userId", "source");
