# Deploying GenXQR to genxqr.com via CloudPanel

This is the runbook for the first production deploy. It assumes:

- A VPS with CloudPanel already installed (Ubuntu/Debian, per CloudPanel's own requirements).
- You have root SSH access to the VPS.
- DNS for `genxqr.com` and `www.genxqr.com` can be pointed at the VPS.

Architecture: CloudPanel manages Nginx + the site's SSL certificate. Postgres and
Redis run via the project's own `docker-compose.yml` (CloudPanel has no native
Postgres support — confirmed against their docs, it's still an open feature
request). The backend runs under PM2. Secrets live in a plain `backend/.env`
file, not HashiCorp Vault — the repo has Vault scaffolding
(`backend/vault-bootstrap.mjs`, `backend/scripts/vault-setup.sh`) for a future
migration, but it's unused for now; nothing here depends on it.

---

## 0. Before you start

- [ ] DNS: create an **A record** for `genxqr.com` and `www.genxqr.com` pointing at the VPS's public IP. SSL issuance in step 6 will fail until this has propagated.
- [ ] Have ready: a **Resend API key** (or SMTP credentials) for email, your **PayU live merchant key + salt** (from https://dashboard.payu.in), and — optionally — a **Google OAuth client ID/secret** if you want Google login (the app works fine without it, login just skips that option).
- [ ] Decide the CloudPanel **site user** name up front (e.g. `genxqr`) — it determines every path below.

---

## 1. Create the Node.js site in CloudPanel

In the CloudPanel UI: **Sites → Add Site → Node.js**.

- Domain: `genxqr.com`
- Node.js version: 20 or later (the app was built/tested on Node 20+)
- App port: `3001` (matches the backend's `PORT` — see step 5)
- Site user: pick a name, e.g. `genxqr`

This creates a site user and a base directory at `/home/<site-user>/htdocs/genxqr.com/`.

---

## 2. SSH in and get the code onto the box

```bash
ssh root@<vps-ip>

# Install Docker if it isn't already present (CloudPanel doesn't install this):
curl -fsSL https://get.docker.com | sh

# Switch to the site user and clone the repo directly into its htdocs folder
su - <site-user>
cd ~/htdocs/genxqr.com
git clone https://github.com/tejvishwakarma/GenXQR.git .
```

If the repo is private, use a deploy key or a personal access token in the clone URL instead of the plain HTTPS URL above.

---

## 3. Postgres + Redis (Docker, loopback-only)

Still as the site user, in the repo root:

```bash
cp .env.example .env
nano .env   # set strong POSTGRES_PASSWORD and REDIS_PASSWORD — do not reuse dev values
```

Then bring the containers up (as root, or a user in the `docker` group):

```bash
exit   # back to root, or: sudo usermod -aG docker <site-user> && re-login
cd /home/<site-user>/htdocs/genxqr.com
docker compose up -d
docker compose ps   # both should show "healthy" within ~15s
```

`docker-compose.yml` already binds both ports to `127.0.0.1` only — they are not reachable from the public internet. Postgres is on `127.0.0.1:5433`, Redis on `127.0.0.1:6380` (same ports as local dev, just now on the server).

---

## 4. Configure secrets

```bash
su - <site-user>
cd ~/htdocs/genxqr.com
cp backend/.env.production.example backend/.env
nano backend/.env
```

Fill in, at minimum:
- `DATABASE_URL` / `REDIS_URL` — use the same passwords you set in the root `.env` in step 3.
- `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET` — generate two **different** values:
  ```bash
  node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
  ```
- `RESEND_API_KEY` (or the `SMTP_*` block).
- `PAYU_MERCHANT_KEY` / `PAYU_MERCHANT_SALT` — start with `PAYU_BASE_URL=https://test.payu.in/_payment` and do a full sandbox checkout before flipping to `secure.payu.in`.
- `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` — leave blank to disable Google login entirely.

Lock the file down:

```bash
chmod 600 backend/.env
```

---

## 5. Install, migrate, seed, build

```bash
cd ~/htdocs/genxqr.com
corepack enable pnpm   # if pnpm isn't already available
pnpm install --frozen-lockfile

# Apply the committed migrations to the production DB
cd backend
npx prisma migrate deploy

# Seed plans + create the super admin (reads ADMIN_EMAIL/ADMIN_PASSWORD from backend/.env —
# add those two lines temporarily if they're not already in your .env from step 4)
node prisma/seed.mjs

# Geo database for scan analytics (needs a free MaxMind license key — https://www.maxmind.com/en/geolite2/signup)
pnpm geo:update

cd ..
pnpm build:backend    # tsc → backend/dist
pnpm build:frontend   # tsc + vite build → frontend/dist
```

---

## 6. Issue the SSL certificate

In CloudPanel: open the `genxqr.com` site → **SSL/TLS** → **New Let's Encrypt Certificate**, include `www.genxqr.com` as an alias, and issue it. Do this *before* editing the Vhost in the next step, so CloudPanel has already filled in the correct certificate paths.

---

## 7. Edit the Vhost

CloudPanel site → **Vhost**. You'll see a `server { ... }` block CloudPanel generated, ending in a single default block:

```nginx
location / {
    proxy_pass http://127.0.0.1:3001/;
    ...
}
```

Replace **that block** (and only that block — leave the `listen`/`ssl_certificate`/`server_name`/`access_log`/https-redirect lines above it untouched) with the contents of [`deploy/cloudpanel-vhost-nodejs.conf`](./deploy/cloudpanel-vhost-nodejs.conf) from this repo. Before saving:

- Edit the `root` line CloudPanel generated near the top of the block to point at `/home/<site-user>/htdocs/genxqr.com/frontend/dist` (the built SPA, not the repo root).
- In the `/uploads/` block, replace `<site-user>` with your actual site user.
- Save — CloudPanel validates the Nginx syntax before applying it and will refuse to save if something's wrong.

---

## 8. Start the backend with PM2

```bash
cd ~/htdocs/genxqr.com
npm install -g pm2   # if not already installed
mkdir -p logs
pm2 start ecosystem.config.cjs --env production
pm2 save
```

Persist PM2 across reboots (per [CloudPanel's own PM2 guide](https://www.cloudpanel.io/docs/v2/nodejs/deployment/pm2/)):

```bash
echo $PATH   # copy the output
crontab -e
# add these two lines, pasting the $PATH output from above:
# PATH=<paste-here>
# @reboot pm2 resurrect &> /dev/null
```

---

## 9. Verify

- `curl -I https://genxqr.com` → `200`
- `curl https://genxqr.com/api/public/plans` → JSON plan list (confirms the API proxy + DB connection work)
- Visit the site, sign up a test account, create a QR code, scan it, confirm the redirect and that a scan shows up in Analytics within a few seconds (goes through the BullMQ worker).
- `pm2 logs genxqr-api` — should show `PostgreSQL connected`, then `GenXQR API listening on port 3001 [production]`, no Redis connection errors.

---

## 10. Ongoing deploys

```bash
cd ~/htdocs/genxqr.com
git pull
pnpm install --frozen-lockfile
cd backend && npx prisma migrate deploy && cd ..
pnpm build:backend
pnpm build:frontend
pm2 reload ecosystem.config.cjs --env production   # zero-downtime
```

---

## Known follow-ups (not blocking, but worth doing before wide launch)

- **Contact page address**: `frontend/src/pages/marketing/ContactPage.tsx` still lists a San Francisco HQ address, which contradicts the site's India-first positioning everywhere else. Update it to a real address/entity before this page gets real traffic.
- **Admin API exposure**: the `/admin-api/` block in the vhost snippet has a commented-out IP allowlist. Fill in your own IP and uncomment it once you know where you'll be administering from.
- **Firewall**: confirm only 80/443 (and your SSH port) are open publicly — `ufw status` or CloudPanel's own firewall page. Ports 5433/6380 are already loopback-bound by `docker-compose.yml`, but a host firewall is a second layer worth having regardless.
- **Vault**: if you later want centralized secrets management, `backend/scripts/vault-setup.sh` and `backend/vault-bootstrap.mjs` are already written — swapping `ecosystem.config.cjs`'s `script`/`node_args` back to `vault-bootstrap.mjs` is the only app-side change needed.
