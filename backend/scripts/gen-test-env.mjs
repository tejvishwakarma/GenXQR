import fs from "fs"

const env = fs.readFileSync(".env", "utf8")
const get = (k) => {
  const m = env.match(new RegExp("^" + k + '="?([^"\n]*)"?', "m"))
  return m ? m[1] : ""
}

const db = get("DATABASE_URL").replace(/\/genxqr\?/, "/genxqr_test?")
const redis = get("REDIS_URL")

if (!db.includes("genxqr_test")) {
  console.error("REFUSING: test DATABASE_URL did not resolve to genxqr_test:", db)
  process.exit(1)
}

const out = `# Test environment — used by vitest only (see vitest.config.ts).
# Points at the SEPARATE genxqr_test database so tests can truncate freely
# without ever touching dev data. Redis logical DB 15 is likewise reserved
# for tests, so flushing it can't clear dev rate-limit/queue state.
#
# Regenerate with: node scripts/gen-test-env.mjs
# Gitignored (matches .env.*) — it is derived from .env, not a secret of its own.
NODE_ENV=test
PORT=3099
DATABASE_URL="${db}"
REDIS_URL="${redis}/15"
JWT_ACCESS_SECRET="test_only_access_secret_not_used_anywhere_real_0000000000000000"
JWT_REFRESH_SECRET="test_only_refresh_secret_not_used_anywhere_real_000000000000000"
JWT_ACCESS_EXPIRES_IN="15m"
JWT_REFRESH_EXPIRES_IN="30d"
FRONTEND_URL="http://localhost:5173"
BACKEND_URL="http://localhost:3099"
EMAIL_FROM="GenXQR Test <test@example.com>"
PAYU_MERCHANT_KEY="test_merchant_key"
PAYU_MERCHANT_SALT="test_merchant_salt"
PAYU_BASE_URL="https://test.payu.in/_payment"
`

fs.writeFileSync(".env.test", out)
console.log(out.replace(/(:)[^:@"/]+(@)/g, "$1****$2"))
