-- OAuth 2.1 for the MCP server: registered client apps and the tokens users approve for them.
CREATE TABLE "oauth_clients" (
    "id" TEXT NOT NULL,
    "secret" TEXT,
    "secretExpiresAt" INTEGER,
    "metadata" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "oauth_clients_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "oauth_tokens" (
    "id" TEXT NOT NULL,
    "grantId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "accessHash" TEXT NOT NULL,
    "refreshHash" TEXT,
    "scopes" TEXT[],
    "resource" TEXT NOT NULL,
    "accessExpiresAt" TIMESTAMP(3) NOT NULL,
    "refreshExpiresAt" TIMESTAMP(3) NOT NULL,
    "rotatedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "lastUsedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "oauth_tokens_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "oauth_tokens_accessHash_key" ON "oauth_tokens"("accessHash");
CREATE UNIQUE INDEX "oauth_tokens_refreshHash_key" ON "oauth_tokens"("refreshHash");
CREATE INDEX "oauth_tokens_userId_idx" ON "oauth_tokens"("userId");
CREATE INDEX "oauth_tokens_grantId_idx" ON "oauth_tokens"("grantId");
ALTER TABLE "oauth_tokens" ADD CONSTRAINT "oauth_tokens_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "oauth_clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "oauth_tokens" ADD CONSTRAINT "oauth_tokens_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
