# GenXQR Zapier Integration

> **Status (4 Nov 2026): live, private.** Version 1.0.0 is pushed to Zapier
> (app 248982) and tested end to end (New QR Scan → Google Sheets). Customers add
> it through the **invite link**, which is published in the API docs and the
> dashboard guides from one place: `frontend/src/lib/integrations.ts`
> (`ZAPIER_INVITE_URL`; get it with `zapier-platform users:links`). Invite links
> are per version — pushing a new version means updating that constant.
> Next: the public App Directory — see "Publishing to the App Directory" below.


Private Zapier app that lets users connect their GenXQR account to 7,000+ Zapier apps.

## Features

### Triggers (REST Hooks)
- **New QR Scan** — fires when any QR code owned by the authenticated user is scanned.
- **New QR Code** — fires when a QR code is created.
- **QR Code Updated** — fires when a QR code is edited.
- **QR Code Deleted** — fires when a QR code is deleted.

### Actions
- **Create QR Code** — create a dynamic URL/WhatsApp/Instagram/Facebook QR code.
- **Update QR Destination** — change the redirect target of an existing QR.
- **Activate / Deactivate QR Code** — flip `isActive`.
- **Delete QR Code** — remove a QR code permanently.

## Architecture

- **Auth**: Custom API key, sent as `Authorization: Bearer gxqr_...`.
- **Backed by**: `/v1/*` on the GenXQR API (see `backend/src/routes/v1.routes.ts`).
- **Subscription model**: each trigger creates one webhook on subscribe (source=`zapier`) and deletes it on unsubscribe.
- **Polling fallback**: `performList` uses `/v1/qr` with `sort=updatedAt` + `updatedSince` for Zapier's sample-data step and fallback polling.

## Development

The Zapier CLI is installed globally with **npm**, not as a dependency here:
under pnpm its own dependencies resolve to an incompatible `mem-fs`, and it
fails to start. Zapier runs CLI integrations on Node.js 22; the CLI needs
Node ≥ 22. Since v19 the command is `zapier-platform` (the old `zapier` binary
was removed).

```bash
npm install -g zapier-platform-cli@19.2.1
pnpm install                # from the repo root
cd integrations/zapier
pnpm build                  # tsc → dist/
zapier-platform validate    # schema + Zapier's integration checks
```

Point at staging during development via the Zapier env var:
```bash
zapier-platform env:set 1.0.0 GenXQR_API_URL=https://staging.genxqr.com
```

## Deployment

First time, logged in as the GenXQR Zapier developer account:
```bash
zapier-platform login
zapier-platform register "GenXQR"   # creates the app; writes .zapierapprc (app id — commit it)
```
Then for every release:
```bash
pnpm build && zapier-platform push
```
The app starts **private**: invite testers from the Zapier developer platform
(Manage team → invite). Publishing to the App Directory is a separate review.

## Publishing to the App Directory

`zapier-platform validate` lists what is still open under **Publishing Tasks**
(4 Nov 2026: no errors; everything below is outside the code):

1. **Listing details** (developer platform → the app → Settings):
   - Description (M002, 40–160 characters, starting "GenXQR is a"):
     `GenXQR is a QR code platform for dynamic QR codes you can edit after printing, with scan analytics by place, location and device.`
   - Logo (M004): `assets/logo-256.png` (256 × 256, from `frontend/public/favicon.svg`).
   - Homepage: `https://genxqr.com` (the marketing site, not the app).
2. **A team member at @genxqr.com** (M005): invite an @genxqr.com address under
   Manage team, as admin.
3. **Developer Terms** (U001): accept the latest terms in the developer platform.
4. **Test account** (Zapier's §7.1): a GenXQR account at
   `integration-testing@zapier.com` on Pro, created with "Never expires" in the
   admin panel (Users → the user → Change Plan). Sign it up, force-verify its
   email in the admin panel, then set the plan. Zapier resets the password
   through "Forgot password", since they own that inbox.
5. **Live Zaps for every trigger and action** (T001–T006, Z001, S002): one
   switched-on Zap using each of New QR Scan, New QR Code, QR Code Updated,
   QR Code Deleted, Create QR Code, Update Destination, Activate/Deactivate and
   Delete QR Code, each with at least one successful run.
6. **3 users with live Zaps** (S001): three different Zapier accounts (not just
   GenXQR's own) must have a live Zap using the app. Only real customers on the
   invite link can satisfy this.
7. Then **Publish → Submit for review** in the developer platform.

## Plan requirement

The `/v1/*` API requires a PRO plan or higher on GenXQR. Users on FREE or STARTER will get `401/403` during the auth test step and must upgrade.
