-- Two-factor sign-in with an authenticator app (TOTP) and recovery codes.
ALTER TABLE "users" ADD COLUMN "twoFactorSecret" TEXT;
ALTER TABLE "users" ADD COLUMN "twoFactorEnabledAt" TIMESTAMP(3);
ALTER TABLE "users" ADD COLUMN "twoFactorLastStep" INTEGER;
ALTER TABLE "users" ADD COLUMN "twoFactorRecoveryHashes" TEXT[] DEFAULT ARRAY[]::TEXT[];
