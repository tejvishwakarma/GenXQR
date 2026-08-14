/**
 * Asserts that no credential can reach Google Analytics through a page-view URL.
 *
 * Several routes carry live secrets in the URL — a password-reset token, an
 * OAuth exchange code, a team invite token. Reporting those verbatim would put
 * working credentials into an analytics property, so this checks the real
 * sanitiser rather than a reimplementation of it.
 *
 * Run: pnpm analytics:check
 */
import path from "node:path"
import { fileURLToPath } from "node:url"
import { createServer } from "vite"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")

let failures = 0
const fail = (msg) => { console.log("  FAIL:", msg); failures++ }

const server = await createServer({
  root,
  configFile: false,
  logLevel: "error",
  server: { middlewareMode: true },
  resolve: { alias: { "@": path.resolve(root, "src") } },
  optimizeDeps: { noDiscovery: true, include: [] },
})

try {
  const { sanitisePath } = await server.ssrLoadModule("/src/lib/analytics.ts")

  // A distinctive value: if it survives anywhere in the output, it leaked.
  const SECRET = "SUPERSECRET_TOKEN_ABC123"

  const mustRedact = [
    ["password reset token",      `/reset-password?token=${SECRET}`],
    ["email verification token",  `/verify-email?token=${SECRET}`],
    ["OAuth one-time code",       `/app/dashboard?oauth_code=${SECRET}`],
    ["generic code param",        `/callback?code=${SECRET}`],
    ["access token",             `/x?access_token=${SECRET}`],
    ["refresh token",            `/x?refresh_token=${SECRET}`],
    ["api key",                  `/x?api_key=${SECRET}`],
    ["email address",            `/x?email=${SECRET}`],
    ["payment order id",         `/app/billing?cf_order_id=${SECRET}`],
    ["team invite token in PATH", `/invite/${SECRET}`],
    ["uppercase param name",      `/reset-password?TOKEN=${SECRET}`],
    ["secret alongside safe param", `/reset-password?token=${SECRET}&utm_source=email`],
  ]

  console.log("REDACTION")
  for (const [label, input] of mustRedact) {
    const out = sanitisePath(input)
    if (out.includes(SECRET)) fail(`${label}: secret survived — ${out}`)
    else console.log(`  ok  ${label.padEnd(28)} ${input.slice(0, 34).padEnd(36)} -> ${out}`)
  }

  // Redaction must not be so aggressive that analytics stops being useful.
  console.log("\nPRESERVATION")
  const mustPreserve = [
    ["plain path",            "/pricing",                              "/pricing"],
    ["nested path",           "/app/qr/abc123/analytics",              "/app/qr/abc123/analytics"],
    ["utm attribution kept",  "/?utm_source=twitter&utm_campaign=q3",  "/?utm_source=twitter&utm_campaign=q3"],
    ["invite index untouched", "/invite",                              "/invite"],
  ]
  for (const [label, input, expected] of mustPreserve) {
    const out = sanitisePath(input)
    if (out !== expected) fail(`${label}: expected "${expected}", got "${out}"`)
    else console.log(`  ok  ${label.padEnd(28)} -> ${out}`)
  }

  // The marketing-critical case: attribution must survive alongside redaction.
  const mixed = sanitisePath(`/reset-password?token=${SECRET}&utm_source=email`)
  if (!mixed.includes("utm_source=email")) {
    fail(`utm_source was dropped while redacting: ${mixed}`)
  }
} finally {
  await server.close()
}

console.log(`\n${failures === 0 ? "✓ no credential can reach analytics" : `✗ ${failures} leak(s)`}`)
process.exit(failures === 0 ? 0 : 1)
