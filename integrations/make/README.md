# GenXQR Make (Integromat) Integration

> **Status (4 Nov 2026): live, published (not approved).** Built in Make as
> `genxqr-tl8adh` (eu1) with `scripts/deploy.mjs` and tested end to end (Watch
> QR Scans → Google Sheets). Publishing created the **invite link** customers
> install it from (`MAKE_INVITE_URL` in `frontend/src/lib/integrations.ts`); it
> is not listed in Make's directory. A published app can't be made private
> again or deleted, and its modules can't be deleted — only hidden.
> Next: request Make's review to be listed — see "Make's app review" below.


Make app that lets users connect their GenXQR account to Make's 1,500+ app ecosystem.

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

## Deploying to Make

The app lives in Make as **`genxqr-tl8adh`** (eu1 zone; Make chose the name when
the app was created in its UI). Deploy with Make's API — create-or-update, safe
to run again:

```bash
# once: Make → Profile → API access → Add token (scopes sdk-apps:read, sdk-apps:write)
pbpaste > ~/.make-token && chmod 600 ~/.make-token

MAKE_APP=genxqr-tl8adh pnpm --filter genxqr-make deploy   # MAKE_ZONE defaults to eu1.make.com
```

`scripts/deploy.mjs` uploads the base, the connection, the four webhooks, the
`listQrs` RPC and the eight modules. Make names connections and webhooks itself
(`genxqr-tl8adh`, `…2`, …), so the script matches those by label; RPCs and
modules use the `name` in their `metadata.json`. Each module's
`parameters.imljson` goes to Make's **expect** (mappable parameters) section and
`output.imljson` to **interface**. Instant triggers are typeId 10, actions 4.

Test in a scenario with an API key from **genxqr.com** (Pro plan or higher).
Publishing to all Make users is a separate review by Make.

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

## Make's app review

Make lists an app for every user only after its QA review
([prerequisites](https://developers.make.com/custom-apps-documentation/app-review/prerequisites)).
The code side is done (4 Nov 2026): error handling in the base and connection,
sanitised API key logs, a "Make an API Call" universal module (paths relative to
`https://genxqr.com/v1`), and pagination with a limit on the code list (RPC).
What Make also asks for, done in Make itself:

1. **Test scenarios, run just before requesting review** (logs expire):
   - one scenario using every module where possible: Create QR Code → Update
     Destination → Activate / Deactivate → Make an API Call (`GET /qr`) →
     Delete QR Code, run without errors;
   - each Watch trigger (scans, created, updated, deleted) in a scenario that ran
     at least once;
   - a separate scenario that ends in an error (e.g. Update Destination with a
     code ID that doesn't exist);
   - no personal data in the scenarios or their logs (use a test account).
2. **Request review** on the app's page in Make, then follow it in the Flow tab.

