-- CreateTable
CREATE TABLE "sso_connections" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "domain" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "verifyToken" TEXT NOT NULL,
    "verifiedAt" TIMESTAMP(3),
    "tenantId" TEXT,
    "defaultRole" "TeamRole" NOT NULL DEFAULT 'VIEWER',
    "enforced" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sso_connections_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "sso_connections_ownerId_key" ON "sso_connections"("ownerId");

-- CreateIndex
CREATE INDEX "sso_connections_domain_idx" ON "sso_connections"("domain");

-- AddForeignKey
ALTER TABLE "sso_connections" ADD CONSTRAINT "sso_connections_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- A domain belongs to at most one account once VERIFIED; unverified claims can
-- coexist, so nobody can block a company by claiming its domain first.
CREATE UNIQUE INDEX "sso_connections_verified_domain_key" ON "sso_connections"("domain") WHERE "verifiedAt" IS NOT NULL;
