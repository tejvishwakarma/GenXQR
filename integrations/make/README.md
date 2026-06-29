# GenXQR Make (Integromat) Integration

Private Make app that lets users connect their GenXQR account to Make's 1,500+ app ecosystem.

## Features

### Instant Triggers (Webhooks)
| Module | Event |
|---|---|
| Watch QR Scans | `qr.scanned` — fires with full geo/device data on every scan |
| Watch New QR Codes | `qr.created` |
| Watch QR Code Updates | `qr.updated` |
| Watch QR Code Deletions | `qr.deleted` |

### Actions
| Module | Description |
|---|---|
| Create QR Code | Create a dynamic URL/WhatsApp/Instagram/Facebook QR |
| Update QR Destination | Change the redirect target without reprinting |
| Activate / Deactivate QR Code | Flip `isActive` |
| Delete QR Code | Permanently remove a QR code |

## Structure

```
src/
  app.json                          ← App metadata
  base.imljson                      ← Common base URL + Authorization header
  connections/api-key/              ← Custom API key connection
    metadata.json
    parameters.imljson
    api.imljson                     ← Validation call: GET /v1/qr
  webhooks/{event}/                 ← One webhook per event type
    metadata.json
    attach.imljson                  ← POST /v1/webhooks (source=make)
    detach.imljson                  ← DELETE /v1/webhooks/:id
    respond.imljson                 ← Unwraps { event, timestamp, data } envelope
  modules/{action-or-trigger}/
    metadata.json
    parameters.imljson              ← Input fields
    api.imljson                     ← HTTP call (actions)
    output.imljson                  ← Output field specs (instant triggers)
  rpcs/list-qrs/                    ← Dynamic dropdown: GET /v1/qr → [{id, name}]
    metadata.json
    api.imljson
```

## How to import

1. Go to [Make Developer Platform](https://www.make.com/en/app-builder) and create a new app named **GenXQR**.
2. Under **General** → set base URL to `https://genxqr.in` and paste `base.imljson`.
3. Under **Connections** → create `api-key` connection and upload the 3 files.
4. Under **Webhooks** → create each of the 4 webhooks and upload their 3 files each.
5. Under **RPCs** → create `list-qrs` RPC and upload its `api.imljson`.
6. Under **Modules** → create each module and upload its files.
7. Submit for review when ready to publish (1–2 week turnaround).

## Subscribe / Unsubscribe Lifecycle

Each instant trigger's `attach.imljson` calls `POST /v1/webhooks` with:
```json
{ "url": "{{webhook.url}}", "event": "<event>", "source": "make" }
```
The returned `id` is stored in `webhook.data.webhookId` and used by `detach.imljson` to call `DELETE /v1/webhooks/:id` when the scenario is deactivated.

## Webhook Payload

The GenXQR backend wraps all payloads as:
```json
{
  "event": "qr.scanned",
  "timestamp": "2026-04-17T10:30:00.000Z",
  "data": { ...event-specific fields... }
}
```
Each `respond.imljson` uses `"output": "{{body.data}}"` to unwrap this and pass only the data fields into the Make scenario.

## Connection

- **Type**: Custom (API key)
- **Header**: `Authorization: Bearer {{connection.apiKey}}`
- **Key format**: `nxqr_...` — generated at genxqr.in/app/api-keys
- **Plan required**: PRO or higher
