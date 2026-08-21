# GenXQR Zapier Integration

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

- **Auth**: Custom API key, sent as `Authorization: Bearer nxqr_...`.
- **Backed by**: `/v1/*` on the GenXQR API (see `backend/src/routes/v1.routes.ts`).
- **Subscription model**: each trigger creates one webhook on subscribe (source=`zapier`) and deletes it on unsubscribe.
- **Polling fallback**: `performList` uses `/v1/qr` with `sort=updatedAt` + `updatedSince` for Zapier's sample-data step and fallback polling.

## Development

```bash
pnpm install
pnpm --filter GenXQR-zapier build
pnpm --filter GenXQR-zapier validate
```

Point at staging during development via the Zapier env var:
```bash
zapier env:set 1.0.0 GenXQR_API_URL=https://staging.genxqr.com
```

## Deployment

```bash
pnpm --filter GenXQR-zapier push
```

Requires a Zapier developer account and the app to be registered (`zapier register` on first push).

## Plan requirement

The `/v1/*` API requires a PRO plan or higher on GenXQR. Users on FREE or STARTER will get `401/403` during the auth test step and must upgrade.
