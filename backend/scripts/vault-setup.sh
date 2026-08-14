#!/usr/bin/env bash
# =============================================================================
# vault-setup.sh — One-time HashiCorp Vault setup for GenXQR production
# =============================================================================
# Run this script on the VPS as a user with the VAULT_TOKEN (root or admin)
# already exported. Do NOT commit actual secret values — this script is a
# guided reference, not an automated deployment script.
#
# Prerequisites:
#   - Vault is installed: https://developer.hashicorp.com/vault/install
#   - Vault is running and unsealed
#   - VAULT_ADDR and VAULT_TOKEN are exported in your shell
#
# Usage:
#   export VAULT_ADDR="http://127.0.0.1:8200"
#   export VAULT_TOKEN="<root-or-admin-token>"
#   bash scripts/vault-setup.sh
# =============================================================================

set -euo pipefail

ROLE_NAME="genxqr-api"
POLICY_NAME="genxqr-api-policy"
KV_PATH="secret/genxqr/backend"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
POLICY_FILE="$SCRIPT_DIR/../genxqr-api-policy.hcl"

echo ""
echo "=============================================="
echo "  GenXQR — Vault Setup"
echo "  VAULT_ADDR: ${VAULT_ADDR:?'VAULT_ADDR must be set'}"
echo "=============================================="
echo ""

# ── Step 1: Verify Vault is reachable and unsealed ────────────────────────────
echo "[1/7] Verifying Vault health..."
HEALTH=$(curl -sf "${VAULT_ADDR}/v1/sys/health" || true)
if echo "$HEALTH" | grep -q '"sealed":true'; then
  echo "ERROR: Vault is sealed. Run 'vault operator unseal' first."
  exit 1
fi
echo "      OK — Vault is healthy and unsealed."

# ── Step 2: Enable KV v2 secrets engine (idempotent) ─────────────────────────
echo ""
echo "[2/7] Enabling KV v2 secrets engine at 'secret/'..."
if vault secrets list | grep -q "^secret/"; then
  echo "      Already enabled — skipping."
else
  vault secrets enable -path=secret kv-v2
  echo "      Enabled."
fi

# ── Step 3: Write the policy ──────────────────────────────────────────────────
echo ""
echo "[3/7] Writing Vault policy '${POLICY_NAME}'..."
if [ ! -f "$POLICY_FILE" ]; then
  echo "ERROR: Policy file not found: $POLICY_FILE"
  exit 1
fi
vault policy write "$POLICY_NAME" "$POLICY_FILE"
echo "      Policy written:"
vault policy read "$POLICY_NAME"

# ── Step 4: Enable AppRole auth method (idempotent) ───────────────────────────
echo ""
echo "[4/7] Enabling AppRole auth method..."
if vault auth list | grep -q "^approle/"; then
  echo "      Already enabled — skipping."
else
  vault auth enable approle
  echo "      Enabled."
fi

# ── Step 5: Create the AppRole role ───────────────────────────────────────────
echo ""
echo "[5/7] Creating AppRole role '${ROLE_NAME}'..."
vault write "auth/approle/role/${ROLE_NAME}" \
  token_policies="$POLICY_NAME" \
  token_ttl=1h \
  token_max_ttl=24h \
  token_num_uses=0 \
  secret_id_ttl=0 \
  secret_id_num_uses=0
echo "      Role created."

# ── Step 6: Fetch and display the credentials ─────────────────────────────────
echo ""
echo "[6/7] Retrieving AppRole credentials..."
echo ""

ROLE_ID=$(vault read -field=role_id "auth/approle/role/${ROLE_NAME}/role-id")
SECRET_ID=$(vault write -field=secret_id -f "auth/approle/role/${ROLE_NAME}/secret-id")

echo "  ┌──────────────────────────────────────────────────────────────────┐"
echo "  │  SAVE THESE VALUES — they will not be shown again               │"
echo "  ├──────────────────────────────────────────────────────────────────┤"
echo "  │  VAULT_ROLE_ID   = ${ROLE_ID}"
echo "  │  VAULT_SECRET_ID = ${SECRET_ID}"
echo "  └──────────────────────────────────────────────────────────────────┘"
echo ""
echo "  Set these in PM2 ecosystem.config.cjs → env_production block:"
echo "    VAULT_ADDR:       ${VAULT_ADDR}"
echo "    VAULT_ROLE_ID:    ${ROLE_ID}"
echo "    VAULT_SECRET_ID:  ${SECRET_ID}"
echo ""

# ── Step 7: Write application secrets ────────────────────────────────────────
echo "[7/7] Writing application secrets to '${KV_PATH}'..."
echo ""
echo "  Run the following command with your actual secret values:"
echo "  (Replace every <...> placeholder with the real value)"
echo ""
cat <<'EXAMPLE'
  vault kv put secret/genxqr/backend \
    DATABASE_URL="postgresql://genxqr:<DB_PASSWORD>@localhost:5432/genxqr?schema=public" \
    JWT_ACCESS_SECRET="<64-char-hex-secret>" \
    JWT_REFRESH_SECRET="<different-64-char-hex-secret>" \
    RESEND_API_KEY="re_<your-resend-api-key>" \
    SMTP_PASS="<your-smtp-password>" \
    CASHFREE_APP_ID="<your-cashfree-app-id>" \
    CASHFREE_SECRET_KEY="<your-cashfree-secret-key>" \
    GOOGLE_CLIENT_SECRET="<your-google-client-secret>"

  # Verify the secrets were written correctly:
  vault kv get secret/genxqr/backend
EXAMPLE

echo ""
echo "=============================================="
echo "  Setup complete!"
echo ""
echo "  Next steps:"
echo "  1. Run the 'vault kv put' command above with real values"
echo "  2. Add VAULT_ADDR, VAULT_ROLE_ID, VAULT_SECRET_ID to"
echo "     ecosystem.config.cjs → env_production"
echo "  3. Create backend/.env.production with non-secret config"
echo "  4. Deploy and start with: pm2 start ecosystem.config.cjs --env production"
echo "  5. Enable Vault audit logging:"
echo "     vault audit enable file file_path=/var/log/vault/audit.log"
echo "=============================================="
echo ""

# ── Optional: Enable audit logging ───────────────────────────────────────────
# Uncomment to enable automatically:
# sudo mkdir -p /var/log/vault
# vault audit enable file file_path=/var/log/vault/audit.log
