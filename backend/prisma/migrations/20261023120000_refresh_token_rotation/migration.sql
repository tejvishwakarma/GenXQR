-- Refresh-token reuse detection (security audit, 23 Oct 2026). See auth.service refreshTokens.

-- AlterTable
ALTER TABLE "refresh_tokens" ADD COLUMN "rotatedAt" TIMESTAMP(3);
