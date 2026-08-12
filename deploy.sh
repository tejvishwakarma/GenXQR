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
