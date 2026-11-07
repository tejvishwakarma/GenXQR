-- New QR types: a UPI payment page and a Google review redirect.
ALTER TYPE "QRType" ADD VALUE 'UPI';
ALTER TYPE "QRType" ADD VALUE 'GOOGLE_REVIEW';
