-- AlterEnum
ALTER TYPE "PlanName" ADD VALUE 'AGENCY';

-- CreateTable
CREATE TABLE "agency_clients" (
    "id" TEXT NOT NULL,
    "agencyId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "maxCodes" INTEGER NOT NULL,
    "maxScansPerMonth" INTEGER NOT NULL,
    "maxDomains" INTEGER NOT NULL,
    "maxStorageGB" INTEGER NOT NULL,
    "features" JSONB NOT NULL,
    "reportToken" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "agency_clients_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "agency_clients_userId_key" ON "agency_clients"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "agency_clients_reportToken_key" ON "agency_clients"("reportToken");

-- CreateIndex
CREATE INDEX "agency_clients_agencyId_createdAt_idx" ON "agency_clients"("agencyId", "createdAt");

-- AddForeignKey
ALTER TABLE "agency_clients" ADD CONSTRAINT "agency_clients_agencyId_fkey" FOREIGN KEY ("agencyId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agency_clients" ADD CONSTRAINT "agency_clients_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
