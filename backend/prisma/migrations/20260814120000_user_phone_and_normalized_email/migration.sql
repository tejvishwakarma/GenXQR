-- Adds:
--   phone            — customer mobile, collected at first checkout (Cashfree
--                      requires one on every order; previously a placeholder was
--                      sent for every customer).
--   normalizedEmail  — canonical inbox, used ONLY to decide trial eligibility so
--                      one person cannot mint unlimited trials with +tag or
--                      dotted Gmail aliases.
--
-- normalizedEmail is intentionally NOT unique: signing up with an alias stays
-- allowed, it simply does not earn a second free trial.

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "normalizedEmail" TEXT,
ADD COLUMN     "phone" TEXT;

-- CreateIndex
CREATE INDEX "users_normalizedEmail_idx" ON "users"("normalizedEmail");

-- Backfill existing rows. This mirrors normalizeEmail() in
-- src/utils/normalize-email.util.ts — strip a +tag on providers that support
-- sub-addressing, and additionally remove dots for Gmail, which ignores them.
-- Kept deliberately close to the TypeScript so the two cannot disagree about who
-- has already had a trial.
UPDATE "users"
SET "normalizedEmail" =
  CASE
    -- Gmail / googlemail: drop +tag, remove dots, canonicalise the domain.
    WHEN split_part(lower("email"), '@', 2) IN ('gmail.com', 'googlemail.com')
      THEN replace(split_part(split_part(lower("email"), '@', 1), '+', 1), '.', '')
           || '@gmail.com'
    -- Other providers documented to support +tag addressing: drop the tag only.
    WHEN split_part(lower("email"), '@', 2) IN (
      'outlook.com', 'hotmail.com', 'live.com', 'yahoo.com',
      'protonmail.com', 'proton.me', 'icloud.com', 'me.com',
      'fastmail.com', 'zoho.com', 'yandex.com'
    )
      THEN split_part(split_part(lower("email"), '@', 1), '+', 1)
           || '@' || split_part(lower("email"), '@', 2)
    ELSE lower("email")
  END
WHERE "email" LIKE '%@%.%';

-- Guard against the stripping producing an empty local part (e.g. "+tag@gmail.com"),
-- which would otherwise collapse several unrelated accounts onto one value.
UPDATE "users" SET "normalizedEmail" = NULL
WHERE "normalizedEmail" IS NOT NULL AND "normalizedEmail" LIKE '@%';
