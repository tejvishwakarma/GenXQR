-- Replace the PayU payment columns with Cashfree equivalents.
--
-- PayU was only ever run in test mode, so there is no production payment data
-- to preserve and no back-fill: the columns are dropped outright rather than
-- renamed. Dropping "payuTxnId" also drops its unique index; the equivalent
-- constraint is recreated on "cashfreeOrderId" below, where it serves the same
-- purpose — it is the idempotency key that stops the payment webhook and the
-- browser-return verification from both activating the same order.

-- AlterTable
ALTER TABLE "invoices" DROP COLUMN "payuPaymentId",
DROP COLUMN "payuTxnId",
ADD COLUMN     "cashfreeOrderId" TEXT,
ADD COLUMN     "cashfreePaymentId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "invoices_cashfreeOrderId_key" ON "invoices"("cashfreeOrderId");
