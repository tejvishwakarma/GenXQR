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
pnpm install --frozen-lockfile

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
  # Without this, new columns are missing there and the suite fails for a reason
  # that has nothing to do with the code being deployed.
  echo "==> migrating the test database"
  (cd backend && node --env-file=.env.test ./node_modules/prisma/build/index.js migrate deploy >/dev/null)

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
