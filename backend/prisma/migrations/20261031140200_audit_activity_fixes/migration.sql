-- Data fixes for the customer activity log (31 Oct 2026). No schema change.

-- 1. "Joined the team" was written with the OWNER as the actor. The joiner is
--    in metadata.acceptedByUserId; use it where that account still exists.
UPDATE "audit_logs" a
SET "userId" = a."metadata"->>'acceptedByUserId'
WHERE a."action" = 'team.invite.accept'
  AND jsonb_typeof(a."metadata") = 'object'
  AND a."metadata" ? 'acceptedByUserId'
  AND a."userId" IS DISTINCT FROM a."metadata"->>'acceptedByUserId'
  AND EXISTS (SELECT 1 FROM "users" u WHERE u."id" = a."metadata"->>'acceptedByUserId');

-- 2. Every password sign-in was written twice: by loginUser (no user agent) and
--    by the /login route (with it). Delete the first copy only where its twin
--    exists — same user, same IP, within 5 seconds, user agent present.
DELETE FROM "audit_logs" a
WHERE a."action" = 'auth.login'
  AND a."userAgent" IS NULL
  AND EXISTS (
    SELECT 1 FROM "audit_logs" b
    WHERE b."action" = 'auth.login'
      AND b."id" <> a."id"
      AND b."userId" = a."userId"
      AND b."userAgent" IS NOT NULL
      AND b."ip" IS NOT DISTINCT FROM a."ip"
      AND b."createdAt" BETWEEN a."createdAt" - INTERVAL '5 seconds' AND a."createdAt" + INTERVAL '5 seconds'
  );
