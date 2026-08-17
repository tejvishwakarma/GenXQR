#!/usr/bin/env bash
# Ongoing production deploy for genxqr.com — automates DEPLOYMENT.md step 10.
# Run on the VPS as the site user, from anywhere:
#   ./deploy.sh
# First time only: chmod +x deploy.sh
set -euo pipefail

# Must match ENV_FILE_PATH in ecosystem.config.cjs — update both if you move it.
ENV_FILE="/home/genxqr/genxqr.env"

# Resolve the repo root from this script's own location, not $HOME, so it
# works regardless of which site user/path this ends up cloned under.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo "==> git pull"
git pull

echo "==> pnpm install"
# --prod=false is REQUIRED, not a preference. This deploy compiles TypeScript and
# runs the test suite, so it needs devDependencies (tsc, vitest, the Prisma CLI).
#
# pnpm prunes devDependencies whenever NODE_ENV=production, and that variable is
# easy to inherit — the production env file sets it, so merely having sourced that
# file in the same shell is enough. Without this flag the install silently removes
# ~117 packages and the very next step (prisma generate) fails with no obvious
# link to the cause.
#
# confirmModulesPurge=false keeps pnpm from stopping on an interactive
# "reinstall from scratch?" prompt when it decides to rebuild node_modules.
pnpm install --frozen-lockfile --prod=false --config.confirmModulesPurge=false

echo "==> loading production secrets from $ENV_FILE"
set -a
source "$ENV_FILE"
set +a

# ─── Test gate ────────────────────────────────────────────────────────────────
# Runs BEFORE the migration, build and reload, so a failure leaves production
# completely untouched. Every payment guard — webhook signature verification,
# server-side amount checks, replay protection, invoice ownership — is covered by
# this suite, and without a gate a regression in any of them ships silently.
#
# The suite needs its own database (genxqr_test) and a .env.test, which is
# gitignored and therefore not present on a fresh clone. One-time setup:
#     cd backend && pnpm test:setup
#
# To deploy without running tests — a deliberate choice, e.g. an urgent hotfix:
#     SKIP_TESTS=1 ./deploy.sh
SKIP_TESTS="${SKIP_TESTS:-0}"

if [ "$SKIP_TESTS" = "1" ]; then
  echo "==> SKIPPING TESTS (SKIP_TESTS=1) — deploying unverified"
elif [ ! -f backend/.env.test ]; then
  echo "!!  backend/.env.test is missing, so the test suite cannot run."
  echo "!!  One-time setup:   cd backend && pnpm test:setup"
  echo "!!  Or deploy without tests:   SKIP_TESTS=1 ./deploy.sh"
  echo "!!  Refusing to deploy unverified."
  exit 1
else
  echo "==> prisma generate (needed by both the tests and the build)"
  (cd backend && npx prisma generate >/dev/null)

  # Bring the TEST database up to date with any migrations just pulled in.
  # Without this, new tables are missing there and the suite fails for a reason
  # that has nothing to do with the code being deployed.
  #
  # DATABASE_URL is passed EXPLICITLY, and this matters more than it looks:
  # Node's --env-file does NOT override a variable already in the environment,
  # and this script sources the PRODUCTION env file above. So
  # `node --env-file=.env.test ... migrate deploy` inherited the production
  # DATABASE_URL and migrated PRODUCTION under a line that says it is migrating
  # the test database — leaving the test DB untouched and the suite failing on
  # missing tables. An inline assignment is part of the environment, so it wins.
  echo "==> migrating the test database"
  TEST_DB_URL="$(grep -E '^DATABASE_URL=' backend/.env.test | head -1 | cut -d '=' -f2- | tr -d '"')"

  # Refuse rather than risk running migrations against the wrong database.
  case "$TEST_DB_URL" in
    */genxqr_test|*/genxqr_test\?*) ;;
    *)
      echo "!!  backend/.env.test DATABASE_URL does not target genxqr_test."
      echo "!!  Got: $(echo "$TEST_DB_URL" | sed 's#:[^:@/]*@#:****@#')"
      echo "!!  Refusing to run migrations against it."
      exit 1
      ;;
  esac

  (cd backend && DATABASE_URL="$TEST_DB_URL" node ./node_modules/prisma/build/index.js migrate deploy)

  echo "==> running tests"
  (cd backend && pnpm test)
  echo "==> tests passed"
fi

echo "==> prisma migrate deploy"
(cd backend && npx prisma migrate deploy)

echo "==> build backend"
pnpm build:backend

echo "==> build frontend"
pnpm build:frontend

echo "==> reloading PM2"
if pm2 describe genxqr-api > /dev/null 2>&1; then
  pm2 reload ecosystem.config.cjs --env production
else
  echo "genxqr-api not running yet — starting it instead of reloading"
  pm2 start ecosystem.config.cjs --env production
  pm2 save
fi

echo "==> done"
pm2 status
