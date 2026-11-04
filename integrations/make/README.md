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

In Make: **Custom apps → Create a new app** (name `GenXQR`), then add each part
under the **exact name** below and paste the matching file's contents into the
tab of the same name. Names must match — modules and dropdowns refer to them.

1. **Base** tab ← `src/base.imljson`
2. **Connection** `GenXQR-api-key` (type: Other / custom): API ← `connections/api-key/api.imljson`,
   Parameters ← `connections/api-key/parameters.imljson`
3. **Webhooks** (type: dedicated, attached), connection `GenXQR-api-key`, for each of
   `GenXQR-qr-scanned`, `GenXQR-qr-created`, `GenXQR-qr-updated`, `GenXQR-qr-deleted`:
   Communication ← `respond.imljson`, Attach ← `attach.imljson`, Detach ← `detach.imljson`
   (folders `webhooks/qr-scanned/` etc.)
4. **RPC** `GenXQR-list-qrs`, connection `GenXQR-api-key`: Communication ← `rpcs/list-qrs/api.imljson`
5. **Modules** — each with connection `GenXQR-api-key`:
   - Instant triggers `GenXQR-watch-qr-scanned` / `-created` / `-updated` / `-deleted`, each attached to the
     webhook of the same event: Interface ← `output.imljson`
   - Actions `GenXQR-create-qr`, `GenXQR-update-destination`, `GenXQR-toggle-qr`, `GenXQR-delete-qr`:
     Communication ← `api.imljson`, Mappable parameters ← `parameters.imljson`
6. Test in a scenario with an API key from **genxqr.com** (Pro plan or higher).
7. Publishing to all Make users is a separate review by Make.

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
- **Key format**: `gxqr_...` — generated at genxqr.com/app/api-keys
- **Plan required**: PRO or higher
