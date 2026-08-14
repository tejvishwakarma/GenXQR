// PM2 Ecosystem Config for GenXQR Production Deployment
// See DEPLOYMENT.md for the full CloudPanel setup this pairs with.
//
// Usage (from the repo root, after `pnpm build:backend`):
//   pm2 start ecosystem.config.cjs --env production   # first start
//   pm2 reload ecosystem.config.cjs --env production   # zero-downtime reload after a deploy
//   pm2 stop ecosystem.config.cjs                       # stop
//   pm2 save && pm2 startup                             # persist across server reboots
//
// Secrets (DATABASE_URL, JWT secrets, Cashfree keys, etc.) are NOT set here — they
// live in an env file OUTSIDE the repo (chmod 600, owned by the site user; see
// backend/.env.production.example for the template) and are loaded via Node's
// native --env-file flag below with an absolute path. Update ENV_FILE_PATH if
// you move this file — it must be an absolute path since cwd is the backend/
// directory, not wherever this secrets file happens to live.
const ENV_FILE_PATH = "/home/genxqr/genxqr.env"

module.exports = {
  apps: [
    {
      name: "genxqr-api",
      script: "dist/index.js",
      cwd: __dirname + "/backend",
      node_args: `--env-file=${ENV_FILE_PATH}`,

      // One process per CPU core; PM2 load-balances across them.
      instances: "max",
      exec_mode: "cluster",

      // Auto-restart on crash; exponential backoff up to ~10s
      autorestart: true,
      restart_delay: 1000,
      max_restarts: 10,
      exp_backoff_restart_delay: 100,

      // Restart if a worker exceeds this — catches slow memory leaks
      max_memory_restart: "512M",

      // Logs (see DEPLOYMENT.md for creating this directory)
      out_file: "../logs/api-out.log",
      error_file: "../logs/api-err.log",
      merge_logs: true,
      log_date_format: "YYYY-MM-DD HH:mm:ss Z",

      // Graceful shutdown — matches the SIGTERM handler in src/index.ts
      kill_timeout: 10000,

      env_production: {
        NODE_ENV: "production",
      },
    },
  ],
}
