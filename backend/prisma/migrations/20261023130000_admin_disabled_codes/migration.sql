-- Admin takedowns the owner cannot undo (security audit, 23 Oct 2026).

-- AlterTable
ALTER TABLE "qr_codes" ADD COLUMN "disabledByAdminAt" TIMESTAMP(3);
