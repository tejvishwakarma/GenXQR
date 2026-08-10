# Deploying GenXQR to genxqr.com via CloudPanel

This is the runbook for the first production deploy. It assumes:

- A VPS with CloudPanel already installed (Ubuntu/Debian, per CloudPanel's own requirements).
- You have root SSH access to the VPS.
- DNS for `genxqr.com` and `www.genxqr.com` can be pointed at the VPS.

Architecture: CloudPanel manages Nginx + the site's SSL certificate. Postgres
and Redis are installed **natively** on this VPS (no Docker on this box) —
this is different from local dev, which uses the repo's `docker-compose.yml`;
that file is dev-only and irrelevant here. The backend runs under PM2. Secrets
live in a plain `backend/.env` file, not HashiCorp Vault — the repo has Vault
scaffolding (`backend/vault-bootstrap.mjs`, `backend/scripts/vault-setup.sh`)
for a future migration, but it's unused for now; nothing here depends on it.

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

# Switch to the site user and clone the repo directly into its htdocs folder
su - <site-user>
cd ~/htdocs/genxqr.com
git clone https://github.com/tejvishwakarma/GenXQR.git .
```

If the repo is private, use a deploy key or a personal access token in the clone URL instead of the plain HTTPS URL above.

---

## 3. Configure Postgres + Redis (already installed natively on this box)

No Docker here — confirm both services are actually running first:

```bash
systemctl status postgresql
systemctl status redis-server
```

Create a dedicated database + user for GenXQR (as root, or any user that can `sudo -u postgres`):

```bash
sudo -u postgres psql
CREATE USER genxqr WITH PASSWORD 'CHANGE_ME_STRONG_PASSWORD';
CREATE DATABASE genxqr OWNER genxqr;
\q
```

Confirm Postgres will actually accept that password over TCP on localhost — check `pg_hba.conf` (typically `/etc/postgresql/<version>/main/pg_hba.conf`) has a line like:

```
host    all    all    127.0.0.1/32    scram-sha-256
```

(`md5` instead of `scram-sha-256` on older versions is fine too.) If that line is missing, or set to `peer`/`trust`, fix it and `sudo systemctl restart postgresql` — otherwise the app's connection will be rejected even with the right password.

For Redis, set a password if the instance doesn't already have one:

```bash
sudo nano /etc/redis/redis.conf
# set:      requirepass CHANGE_ME_STRONG_PASSWORD
# confirm this is already present and NOT commented out:
#           bind 127.0.0.1 -::1
sudo systemctl restart redis-server
redis-cli -a 'CHANGE_ME_STRONG_PASSWORD' ping   # should print PONG
```

Unless something's been customized, both are on their standard ports: Postgres `127.0.0.1:5432`, Redis `127.0.0.1:6379`. You'll need the exact host/port/password in step 4.

⚠️ If this Postgres/Redis instance is shared with other apps on the box, the `CREATE USER`/`CREATE DATABASE` above only adds a new, separate database — it won't touch existing ones. But double-check nothing named `genxqr` already exists for a different purpose before running it, and be aware the `pg_hba.conf`/`redis.conf` edits above are server-wide, not per-app.

---

## 4. Configure secrets

```bash
su - <site-user>
cd ~/htdocs/genxqr.com
cp backend/.env.production.example backend/.env
nano backend/.env
```

Fill in, at minimum:
- `DATABASE_URL` / `REDIS_URL` — use the exact user/password/host/port from step 3, e.g. `postgresql://genxqr:<password>@127.0.0.1:5432/genxqr?schema=public` and `redis://:<password>@127.0.0.1:6379`.
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
- **Firewall**: confirm only 80/443 (and your SSH port) are open publicly — `ufw status` or CloudPanel's own firewall page. Postgres (5432) and Redis (6379) should already only be listening on `127.0.0.1` per step 3 (`ss -tlnp | grep -E '5432|6379'` to confirm), but a host firewall is a second layer worth having regardless — especially since these are shared, natively-installed services rather than isolated containers.
- **Vault**: if you later want centralized secrets management, `backend/scripts/vault-setup.sh` and `backend/vault-bootstrap.mjs` are already written — swapping `ecosystem.config.cjs`'s `script`/`node_args` back to `vault-bootstrap.mjs` is the only app-side change needed.
