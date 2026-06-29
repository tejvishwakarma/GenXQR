// PM2 Ecosystem Config for GenXQR Production Deployment
// Usage:
//   pm2 start ecosystem.config.cjs --env production   # start with Vault
//   pm2 reload ecosystem.config.cjs                   # zero-downtime reload
//   pm2 stop ecosystem.config.cjs                     # stop
//   pm2 save && pm2 startup                           # persist across reboots
//
// Secrets are fetched from HashiCorp Vault at startup via vault-bootstrap.mjs.
// Set VAULT_ADDR, VAULT_ROLE_ID, VAULT_SECRET_ID in the env_production block
// below (or inject them via a systemd EnvironmentFile before running PM2).
// See: backend/scripts/vault-setup.sh for one-time Vault configuration.

module.exports = {
  apps: [
    {
      name: "GenXQR-api",

      // vault-bootstrap.mjs fetches secrets from Vault, then spawns dist/index.js.
      // It is a plain .mjs file — PM2 runs it with the system Node binary.
      script: "./backend/vault-bootstrap.mjs",
      cwd: "/var/www/GenXQR",

      // Cluster mode is handled inside vault-bootstrap → child process.
      // The bootstrap itself runs as a single fork; the child handles clustering.
      instances: 1,
      exec_mode: "fork",

      // Auto-restart on crash; exponential backoff up to 30s
      autorestart: true,
      restart_delay: 1000,
      max_restarts: 10,
      exp_backoff_restart_delay: 100,

      // Memory threshold: restart if the process exceeds 512 MB
      max_memory_restart: "512M",

      // Log files
      out_file: "/var/log/GenXQR/api-out.log",
      error_file: "/var/log/GenXQR/api-err.log",
      merge_logs: true,
      log_date_format: "YYYY-MM-DD HH:mm:ss Z",

      // Graceful shutdown: wait up to 10s (bootstrap + app teardown)
      kill_timeout: 10000,
      wait_ready: true,
      listen_timeout: 15000,

      // ── Production environment ──────────────────────────────────────────────
      // Non-secret config lives here. Actual secrets are fetched from Vault.
      // VAULT_ROLE_ID and VAULT_SECRET_ID must be filled in before deployment.
      // Never commit real credentials — use environment substitution or
      // a CI/CD secrets manager to inject them at deploy time.
      env_production: {
        NODE_ENV: "production",
        PORT: "3001",

        // Non-secret application config
        FRONTEND_URL: "https://genxqr.in",
        BACKEND_URL: "https://genxqr.in",
        REDIS_URL: "redis://127.0.0.1:6379",
        EMAIL_FROM: "GenXQR <no-reply@genxqr.in>",
        PAYU_BASE_URL: "https://secure.payu.in/_payment",
        JWT_ACCESS_EXPIRES_IN: "15m",
        JWT_REFRESH_EXPIRES_IN: "30d",
        GOOGLE_CALLBACK_URL: "https://genxqr.in/api/auth/google/callback",
        GOOGLE_DRIVE_REDIRECT_URI: "https://genxqr.in/api/auth/gdrive/callback",

        // ── Vault credentials ─────────────────────────────────────────────────
        // vault-bootstrap.mjs reads these to authenticate and fetch secrets.
        // Fill these in, or inject via CI/CD. Never commit real values.
        VAULT_ADDR: "http://127.0.0.1:8200",
        VAULT_ROLE_ID: "REPLACE_WITH_ROLE_ID",
        VAULT_SECRET_ID: "REPLACE_WITH_SECRET_ID",
      },
    },
  ],
}
