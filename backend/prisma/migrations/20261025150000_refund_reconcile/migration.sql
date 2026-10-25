-- Refund reconciliation sweep (25 Oct 2026): when each invoice was last checked
-- with Cashfree for refunds. Column only; null = never checked.
ALTER TABLE "invoices" ADD COLUMN "refundCheckedAt" TIMESTAMP(3);
