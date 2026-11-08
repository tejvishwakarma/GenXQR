-- LinkedIn Insight Tag and TikTok Pixel on the scan redirect page.
ALTER TABLE "qr_codes" ADD COLUMN "linkedinPartnerId" TEXT;
ALTER TABLE "qr_codes" ADD COLUMN "tiktokPixelId" TEXT;
