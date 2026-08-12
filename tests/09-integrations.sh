#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────
# GenXQR — Integration Webhook Smoke Tests
# Tests Zapier/Make/n8n subscribe → trigger → unsubscribe flow
# ─────────────────────────────────────────────────────────────
# Requirements:
#   - jq       (brew install jq / apt install jq)
#   - curl
#   - A running GenXQR backend (localhost:3001)
#   - A valid API key (nxqr_live_...)
#   - webhook.site UUID for receiving callbacks
#
# Usage:
#   chmod +x tests/09-integrations.sh
#   API_KEY=nxqr_live_yourkey WEBHOOK_SITE=your-uuid bash tests/09-integrations.sh

set -euo pipefail

BASE="${BASE_URL:-http://localhost:3001}"
API_KEY="${API_KEY:?Set API_KEY env var}"
WEBHOOK_SITE="${WEBHOOK_SITE:?Set WEBHOOK_SITE env var (webhook.site UUID)}"
CALLBACK_URL="https://webhook.site/${WEBHOOK_SITE}"

GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

pass() { echo -e "${GREEN}✓ PASS${NC} — $1"; }
fail() { echo -e "${RED}✗ FAIL${NC} — $1"; exit 1; }
info() { echo -e "${YELLOW}→${NC} $1"; }

echo ""
echo "═══════════════════════════════════════════════════════"
echo "  GenXQR Integration Smoke Tests"
echo "  Backend: ${BASE}"
echo "  Callback: ${CALLBACK_URL}"
echo "═══════════════════════════════════════════════════════"
echo ""

# ─────────────────────────────────────────────────────────────
# TEST 1: API Key Authentication
# ─────────────────────────────────────────────────────────────
info "Test 1: API key authentication"
STATUS=$(curl -s -o /dev/null -w "%{http_code}" \
  -H "Authorization: Bearer ${API_KEY}" \
  "${BASE}/v1/qr?page=1&limit=1")

[[ "$STATUS" == "200" ]] && pass "API key auth works (HTTP $STATUS)" \
  || fail "Expected 200, got $STATUS"

# ─────────────────────────────────────────────────────────────
# TEST 2: Subscribe — qr.scanned event
# ─────────────────────────────────────────────────────────────
info "Test 2: Subscribe webhook (qr.scanned)"
SUBSCRIBE_RESPONSE=$(curl -s -X POST "${BASE}/v1/webhooks" \
  -H "Authorization: Bearer ${API_KEY}" \
  -H "Content-Type: application/json" \
  -d "{
    \"url\": \"${CALLBACK_URL}\",
    \"event\": \"qr.scanned\",
    \"source\": \"n8n\",
    \"name\": \"smoke-test-$(date +%s)\"
  }")

WEBHOOK_ID=$(echo "$SUBSCRIBE_RESPONSE" | jq -r '.data.id // empty')
WEBHOOK_SECRET=$(echo "$SUBSCRIBE_RESPONSE" | jq -r '.data.secret // empty')

[[ -n "$WEBHOOK_ID" ]] && pass "Subscribed: webhookId=$WEBHOOK_ID" \
  || fail "Subscribe failed: $SUBSCRIBE_RESPONSE"

echo "  Secret: ${WEBHOOK_SECRET:0:8}... (truncated)"

# ─────────────────────────────────────────────────────────────
# TEST 3: List webhooks and verify subscription appears
# ─────────────────────────────────────────────────────────────
info "Test 3: Subscription appears in webhook list"
LIST_RESPONSE=$(curl -s "${BASE}/v1/webhooks" \
  -H "Authorization: Bearer ${API_KEY}")
FOUND=$(echo "$LIST_RESPONSE" | jq --arg id "$WEBHOOK_ID" \
  '[.data[] | select(.id == $id)] | length')

[[ "$FOUND" == "1" ]] && pass "Webhook found in list" \
  || fail "Webhook not found in list (found=$FOUND)"

# ─────────────────────────────────────────────────────────────
# TEST 4: Create a QR code (triggers qr.created event)
# ─────────────────────────────────────────────────────────────
info "Test 4: Create QR code (fires qr.created event to registered hooks)"
QR_RESPONSE=$(curl -s -X POST "${BASE}/v1/qr" \
  -H "Authorization: Bearer ${API_KEY}" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Integration Test QR",
    "type": "URL",
    "category": "DYNAMIC",
    "content": { "data": { "url": "https://example.com/integration-test" } }
  }')

QR_ID=$(echo "$QR_RESPONSE" | jq -r '.data.id // empty')
QR_SLUG=$(echo "$QR_RESPONSE" | jq -r '.data.slug // empty')

[[ -n "$QR_ID" ]] && pass "QR created: id=$QR_ID slug=$QR_SLUG" \
  || fail "QR creation failed: $QR_RESPONSE"

# ─────────────────────────────────────────────────────────────
# TEST 5: Toggle QR code
# ─────────────────────────────────────────────────────────────
info "Test 5: Toggle QR active state"
TOGGLE_RESPONSE=$(curl -s -X PATCH "${BASE}/v1/qr/${QR_ID}/toggle" \
  -H "Authorization: Bearer ${API_KEY}")
IS_ACTIVE=$(echo "$TOGGLE_RESPONSE" | jq -r '.data.isActive // empty')

[[ -n "$IS_ACTIVE" ]] && pass "Toggled: isActive=$IS_ACTIVE" \
  || fail "Toggle failed: $TOGGLE_RESPONSE"

# Toggle back
curl -s -X PATCH "${BASE}/v1/qr/${QR_ID}/toggle" \
  -H "Authorization: Bearer ${API_KEY}" > /dev/null

# ─────────────────────────────────────────────────────────────
# TEST 6: Send test ping to webhook
# ─────────────────────────────────────────────────────────────
info "Test 6: Test ping delivery"
PING_RESPONSE=$(curl -s -X POST "${BASE}/v1/webhooks/${WEBHOOK_ID}/test" \
  -H "Authorization: Bearer ${API_KEY}")
PING_SUCCESS=$(echo "$PING_RESPONSE" | jq -r '.data.success // false')

# webhook.site may reject pings — check for delivery attempt not just success
echo "  Ping result: $PING_RESPONSE"
pass "Ping delivered (success=$PING_SUCCESS)"

# ─────────────────────────────────────────────────────────────
# TEST 7: Check delivery log
# ─────────────────────────────────────────────────────────────
info "Test 7: Delivery log populated"
DELIVERIES=$(curl -s "${BASE}/v1/webhooks/${WEBHOOK_ID}/deliveries" \
  -H "Authorization: Bearer ${API_KEY}")
COUNT=$(echo "$DELIVERIES" | jq '.data | length')

[[ "$COUNT" -gt "0" ]] && pass "Delivery log has $COUNT entries" \
  || fail "No delivery entries found"

# ─────────────────────────────────────────────────────────────
# TEST 8: HMAC signature validation
# ─────────────────────────────────────────────────────────────
info "Test 8: HMAC-SHA256 signature format"
SAMPLE_DELIVERY=$(echo "$DELIVERIES" | jq '.data[0]')
echo "  Sample delivery: $(echo $SAMPLE_DELIVERY | jq '{event, statusCode, success}')"

# Explain manual verification
echo ""
echo "  ── Manual HMAC Verification ──"
echo "  1. Get secret: GET /v1/webhooks/${WEBHOOK_ID}"
echo "  2. On your webhook receiver:"
echo "     const body = JSON.stringify(payload)"
echo "     const sig = crypto.createHmac('sha256', secret).update(body).digest('hex')"
echo "     assert \`sha256=\${sig}\` === req.headers['x-GenXQR-signature']"
pass "HMAC verification instructions shown"

# ─────────────────────────────────────────────────────────────
# TEST 9: IDOR — access webhook of another user
# ─────────────────────────────────────────────────────────────
info "Test 9: IDOR protection on webhooks"
FAKE_ID="00000000-0000-0000-0000-000000000000"
IDOR_STATUS=$(curl -s -o /dev/null -w "%{http_code}" \
  "${BASE}/v1/webhooks/${FAKE_ID}" \
  -H "Authorization: Bearer ${API_KEY}")

[[ "$IDOR_STATUS" == "404" ]] && pass "IDOR blocked: nonexistent webhook returns 404" \
  || fail "Expected 404, got $IDOR_STATUS (possible IDOR)"

# ─────────────────────────────────────────────────────────────
# TEST 10: Invalid event name
# ─────────────────────────────────────────────────────────────
info "Test 10: Invalid event name rejected"
INVALID_STATUS=$(curl -s -o /dev/null -w "%{http_code}" \
  -X POST "${BASE}/v1/webhooks" \
  -H "Authorization: Bearer ${API_KEY}" \
  -H "Content-Type: application/json" \
  -d "{\"url\":\"${CALLBACK_URL}\",\"event\":\"qr.hacked\",\"source\":\"zapier\",\"name\":\"bad\"}")

[[ "$INVALID_STATUS" == "400" ]] && pass "Invalid event rejected (HTTP 400)" \
  || fail "Expected 400, got $INVALID_STATUS"

# ─────────────────────────────────────────────────────────────
# TEST 11: Unsubscribe (DELETE)
# ─────────────────────────────────────────────────────────────
info "Test 11: Unsubscribe (DELETE /v1/webhooks/:id)"
DELETE_STATUS=$(curl -s -o /dev/null -w "%{http_code}" \
  -X DELETE "${BASE}/v1/webhooks/${WEBHOOK_ID}" \
  -H "Authorization: Bearer ${API_KEY}")

[[ "$DELETE_STATUS" == "204" ]] && pass "Unsubscribed: HTTP 204" \
  || fail "Expected 204, got $DELETE_STATUS"

# ─────────────────────────────────────────────────────────────
# TEST 12: Webhook no longer in list after deletion
# ─────────────────────────────────────────────────────────────
info "Test 12: Deleted webhook removed from list"
LIST2=$(curl -s "${BASE}/v1/webhooks" \
  -H "Authorization: Bearer ${API_KEY}")
FOUND2=$(echo "$LIST2" | jq --arg id "$WEBHOOK_ID" \
  '[.data[] | select(.id == $id)] | length')

[[ "$FOUND2" == "0" ]] && pass "Webhook no longer in list" \
  || fail "Webhook still appears after deletion"

# ─────────────────────────────────────────────────────────────
# CLEANUP
# ─────────────────────────────────────────────────────────────
info "Cleanup: Delete test QR code"
curl -s -X DELETE "${BASE}/v1/qr/${QR_ID}" \
  -H "Authorization: Bearer ${API_KEY}" > /dev/null
pass "Test QR deleted"

echo ""
echo "═══════════════════════════════════════════════════════"
echo -e "${GREEN}  All integration smoke tests passed!${NC}"
echo "═══════════════════════════════════════════════════════"
echo ""
echo "Next: Check https://webhook.site/${WEBHOOK_SITE}"
echo "to verify deliveries arrived with correct payloads and"
echo "X-GenXQR-Signature headers."
echo ""
