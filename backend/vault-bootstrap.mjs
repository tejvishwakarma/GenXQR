/**
 * vault-bootstrap.mjs
 *
 * Pre-flight script that fetches secrets from HashiCorp Vault (AppRole auth)
 * and injects them into the Node.js child process environment before the app
 * source code is evaluated.
 *
 * Two execution paths:
 *   DEV  (NODE_ENV !== 'production' or VAULT_ADDR unset)
 *        → spawns: node --env-file=.env dist/index.js
 *          (identical to the old "start" script — zero dev impact)
 *
 *   PROD (NODE_ENV=production and VAULT_ADDR set)
 *        → reads .env.production (non-secrets)
 *        → authenticates to Vault via AppRole
 *        → fetches KV path secret/genxqr/backend
 *        → merges non-secrets + Vault secrets
 *        → spawns: node dist/index.js   (no --env-file flag)
 *        → forwards child exit code to parent
 *
 * Required env vars for production (set via PM2 env_production or systemd):
 *   VAULT_ADDR       e.g. http://127.0.0.1:8200
 *   VAULT_ROLE_ID    AppRole role_id
 *   VAULT_SECRET_ID  AppRole secret_id
 *
 * Never falls back to .env if Vault is unreachable in production — fails fast.
 */

import { spawn } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ── Constants ────────────────────────────────────────────────────────────────

const VAULT_KV_PATH = 'secret/data/genxqr/backend';
const VAULT_TIMEOUT_MS = 10_000;
const PROD_ENV_FILE = resolve(__dirname, '.env.production');
const DEV_ENV_FILE = resolve(__dirname, '.env');
const APP_SCRIPT = resolve(__dirname, 'dist/index.js');

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Parse a simple KEY=VALUE env file. Handles quoted values and # comments.
 * Does not support multi-line values or variable interpolation — by design.
 */
function parseEnvFile(filePath) {
  if (!existsSync(filePath)) return {};

  const result = {};
  const lines = readFileSync(filePath, 'utf-8').split('\n');

  for (const raw of lines) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;

    const eqIdx = line.indexOf('=');
    if (eqIdx === -1) continue;

    const key = line.slice(0, eqIdx).trim();
    let val = line.slice(eqIdx + 1).trim();

    // Strip surrounding quotes (single or double)
    if ((val.startsWith('"') && val.endsWith('"')) ||
        (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }

    // Strip inline comments (e.g. VALUE=foo  # comment)
    const commentIdx = val.indexOf(' #');
    if (commentIdx !== -1) val = val.slice(0, commentIdx).trim();

    if (key) result[key] = val;
  }

  return result;
}

/**
 * Fetch with a hard timeout. Throws on timeout or network error.
 */
async function fetchWithTimeout(url, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), VAULT_TIMEOUT_MS);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } catch (err) {
    if (err.name === 'AbortError') {
      throw new Error(`Vault request timed out after ${VAULT_TIMEOUT_MS}ms: ${url}`);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Authenticate to Vault via AppRole. Returns a short-lived client token.
 */
async function vaultLogin(addr, roleId, secretId) {
  const res = await fetchWithTimeout(`${addr}/v1/auth/approle/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ role_id: roleId, secret_id: secretId }),
  });

  const json = await res.json();

  if (!res.ok) {
    const errors = json.errors?.join(', ') ?? `HTTP ${res.status}`;
    throw new Error(`Vault AppRole login failed: ${errors}`);
  }

  return json.auth.client_token;
}

/**
 * Read a KV v2 secret. Returns the key/value data object.
 * KV v2 response shape: { data: { data: { KEY: VALUE, ... } } }
 */
async function vaultReadSecrets(addr, token, kvPath) {
  const res = await fetchWithTimeout(`${addr}/v1/${kvPath}`, {
    headers: { 'X-Vault-Token': token },
  });

  const json = await res.json();

  if (!res.ok) {
    const errors = json.errors?.join(', ') ?? `HTTP ${res.status}`;
    throw new Error(`Vault secret read failed (${kvPath}): ${errors}`);
  }

  return json.data?.data ?? {};
}

/**
 * Spawn the Node.js app with the given environment and forward its exit code.
 */
function spawnApp(nodeArgs, env) {
  const child = spawn(process.execPath, nodeArgs, {
    env,
    stdio: 'inherit',
    cwd: __dirname,
  });

  child.on('error', (err) => {
    console.error('[vault-bootstrap] Failed to spawn app process:', err.message);
    process.exit(1);
  });

  child.on('exit', (code, signal) => {
    if (signal) {
      process.kill(process.pid, signal);
    } else {
      process.exit(code ?? 0);
    }
  });
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const isProduction = process.env.NODE_ENV === 'production';
  const vaultAddr = process.env.VAULT_ADDR?.replace(/\/$/, ''); // strip trailing slash

  // ── DEV PATH ────────────────────────────────────────────────────────────────
  if (!isProduction || !vaultAddr) {
    if (isProduction && !vaultAddr) {
      console.warn(
        '[vault-bootstrap] WARNING: NODE_ENV=production but VAULT_ADDR is not set. ' +
        'Falling back to --env-file=.env (not recommended for production).'
      );
    } else {
      console.log('[vault-bootstrap] Development mode — using .env file directly.');
    }

    spawnApp(['--env-file=.env', APP_SCRIPT], process.env);
    return;
  }

  // ── PRODUCTION PATH ──────────────────────────────────────────────────────────
  console.log(`[vault-bootstrap] Production mode — fetching secrets from Vault at ${vaultAddr}`);

  const roleId = process.env.VAULT_ROLE_ID;
  const secretId = process.env.VAULT_SECRET_ID;

  if (!roleId || !secretId) {
    console.error(
      '[vault-bootstrap] FATAL: VAULT_ROLE_ID and VAULT_SECRET_ID must be set in production.'
    );
    process.exit(1);
  }

  // Load non-secrets from .env.production (if it exists)
  const nonSecrets = parseEnvFile(PROD_ENV_FILE);
  if (Object.keys(nonSecrets).length > 0) {
    console.log(`[vault-bootstrap] Loaded ${Object.keys(nonSecrets).length} non-secret vars from .env.production`);
  }

  let vaultSecrets;
  try {
    const token = await vaultLogin(vaultAddr, roleId, secretId);
    vaultSecrets = await vaultReadSecrets(vaultAddr, token, VAULT_KV_PATH);
    console.log(`[vault-bootstrap] Fetched ${Object.keys(vaultSecrets).length} secrets from Vault`);
  } catch (err) {
    // Hard fail — never start with missing secrets in production
    console.error('[vault-bootstrap] FATAL: Could not fetch secrets from Vault.');
    console.error('[vault-bootstrap]', err.message);
    console.error('[vault-bootstrap] Refusing to start without confirmed secrets.');
    process.exit(1);
  }

  // Merge: process.env (PM2 base) < .env.production file < Vault secrets
  // Vault secrets win over everything — they are the source of truth.
  const mergedEnv = {
    ...process.env,
    ...nonSecrets,
    ...vaultSecrets,
    // Ensure Vault credentials are NOT passed to the child process
    VAULT_ADDR: undefined,
    VAULT_ROLE_ID: undefined,
    VAULT_SECRET_ID: undefined,
  };

  // Remove keys explicitly set to undefined (Object spread keeps them as undefined keys)
  for (const key of ['VAULT_ADDR', 'VAULT_ROLE_ID', 'VAULT_SECRET_ID']) {
    delete mergedEnv[key];
  }

  console.log('[vault-bootstrap] Starting GenXQR API...');
  spawnApp([APP_SCRIPT], mergedEnv);
}

main();
