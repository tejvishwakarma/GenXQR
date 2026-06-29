# n8n-nodes-GenXQR

[n8n](https://n8n.io/) community node for the [GenXQR](https://genxqr.in) dynamic QR code platform.

Create, manage, and track dynamic QR codes directly from your n8n workflows. Trigger automations when QR codes are scanned, created, updated, or deleted.

## Installation

### Self-hosted n8n

```bash
npm install n8n-nodes-GenXQR
```

Or install from the n8n community nodes settings page: **Settings → Community Nodes → Install → `n8n-nodes-GenXQR`**

### n8n Cloud

Community nodes are not yet available on n8n Cloud. Use the self-hosted version.

## Nodes

### GenXQR

Perform CRUD operations on your GenXQR QR codes:

| Resource | Operations |
|----------|-----------|
| **QR Code** | Create, Get, List, Update Destination, Toggle Active, Delete |
| **Analytics** | Get analytics for a QR code |
| **Scans** | List recent scans for a QR code |

### GenXQR Trigger

Webhook-based trigger that fires when events occur in your GenXQR account:

- **QR Code Scanned** — Triggers when any QR code is scanned
- **QR Code Created** — Triggers when a new QR code is created
- **QR Code Updated** — Triggers when a QR code is updated
- **QR Code Deleted** — Triggers when a QR code is deleted

The trigger uses GenXQR's webhook system with HMAC-SHA256 signature verification for security.

## Authentication

This node uses **API Key** authentication. Generate an API key from your GenXQR dashboard at [genxqr.in/app/api-keys](https://genxqr.in/app/api-keys). Requires a **PRO plan** or higher.

## Development

```bash
# Install dependencies
npm install

# Build
npm run build

# Watch mode
npm run dev
```

To test locally, link the package to your n8n installation:

```bash
npm link
cd ~/.n8n
npm link n8n-nodes-GenXQR
```

Then restart n8n.

## License

MIT
