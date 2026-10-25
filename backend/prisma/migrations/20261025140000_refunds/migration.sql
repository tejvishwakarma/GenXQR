-- Refund tracking (decided 25 Oct 2026). Columns + table only; existing
-- invoices default to refundedAmount 0. See services/refund.service.ts.

-- AlterTable
ALTER TABLE "invoices" ADD COLUMN     "refundedAmount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "refundedAt" TIMESTAMP(3);
-- CreateTable
CREATE TABLE "refunds" (
    "id" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "cashfreeRefundId" TEXT,
    "amountPaise" INTEGER NOT NULL,
    "reason" TEXT,
    "source" TEXT NOT NULL DEFAULT 'cashfree',
    "createdByAdminId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "refunds_pkey" PRIMARY KEY ("id")
);
-- CreateIndex
CREATE UNIQUE INDEX "refunds_cashfreeRefundId_key" ON "refunds"("cashfreeRefundId");
-- CreateIndex
CREATE INDEX "refunds_invoiceId_idx" ON "refunds"("invoiceId");
-- CreateIndex
CREATE INDEX "refunds_createdAt_idx" ON "refunds"("createdAt");
-- AddForeignKey
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "invoices"("id") ON DELETE CASCADE ON UPDATE CASCADE;
