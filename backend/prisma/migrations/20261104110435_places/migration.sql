-- AlterTable
ALTER TABLE "qr_codes" ADD COLUMN     "placeId" TEXT;

-- AlterTable
ALTER TABLE "qr_scans" ADD COLUMN     "placeId" TEXT;

-- CreateTable
CREATE TABLE "places" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT,
    "address" TEXT,
    "city" TEXT,
    "lat" DOUBLE PRECISION,
    "lng" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "places_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "places_userId_name_key" ON "places"("userId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "places_userId_code_key" ON "places"("userId", "code");

-- CreateIndex
CREATE INDEX "qr_codes_placeId_idx" ON "qr_codes"("placeId");

-- CreateIndex
CREATE INDEX "qr_scans_placeId_scannedAt_idx" ON "qr_scans"("placeId", "scannedAt");

-- AddForeignKey
ALTER TABLE "qr_codes" ADD CONSTRAINT "qr_codes_placeId_fkey" FOREIGN KEY ("placeId") REFERENCES "places"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "places" ADD CONSTRAINT "places_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "qr_scans" ADD CONSTRAINT "qr_scans_placeId_fkey" FOREIGN KEY ("placeId") REFERENCES "places"("id") ON DELETE SET NULL ON UPDATE CASCADE;
