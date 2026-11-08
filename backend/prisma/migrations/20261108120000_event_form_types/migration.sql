-- New QR types: an event page (add to calendar) and a lead/feedback form.
ALTER TYPE "QRType" ADD VALUE 'EVENT';
ALTER TYPE "QRType" ADD VALUE 'FORM';

CREATE TABLE "form_responses" (
    "id" TEXT NOT NULL,
    "qrId" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "form_responses_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "form_responses_qrId_createdAt_idx" ON "form_responses"("qrId", "createdAt");
ALTER TABLE "form_responses" ADD CONSTRAINT "form_responses_qrId_fkey" FOREIGN KEY ("qrId") REFERENCES "qr_codes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
