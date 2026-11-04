/**
 * Zapier, Make and n8n — the single source for every place that explains them:
 * the API docs (/api-docs#integrations), the API Keys and Webhooks guides in the
 * dashboard, and the FAQ. Change it here, not in those pages.
 *
 * Status (checked 4 Nov 2026): the Zapier app (integrations/zapier, v1.0.0) and
 * the Make app (integrations/make, Make app genxqr-tl8adh) are PRIVATE — customers
 * add them through the invite links below. n8n has no published node: it connects
 * through n8n's own Webhook trigger and HTTP Request node.
 */

/** `zapier-platform users:links` — invites to integration version 1.0.0. */
export const ZAPIER_INVITE_URL = "https://zapier.com/developer/public-invite/248982/520340/01050314f25cd3202f36f94fcd139d4a/"

/**
 * Make → App Builder → GenXQR → Invite. Not available through Make's API; null
 * until the account owner copies it — the docs then say to ask support.
 */
export const MAKE_INVITE_URL: string | null = null

export const INTEGRATIONS_SUPPORT_EMAIL = "support@genxqr.com"

export interface IntegrationTrigger {
  event: string
  zapier: string
  make: string
  desc: string
}

export const INTEGRATION_TRIGGERS: IntegrationTrigger[] = [
  { event: "qr.scanned", zapier: "New QR Scan", make: "Watch QR Scans", desc: "Every recorded scan of any of your codes, with location, device, OS and browser." },
  { event: "qr.created", zapier: "New QR Code", make: "Watch New QR Codes", desc: "A code is created — in the dashboard, by bulk upload, a duplicate, or the API." },
  { event: "qr.updated", zapier: "QR Code Updated", make: "Watch QR Code Updates", desc: "A code's destination or settings change, or it is switched on/off." },
  { event: "qr.deleted", zapier: "QR Code Deleted", make: "Watch QR Code Deletions", desc: "A code is deleted." },
]

export const INTEGRATION_ACTIONS: { name: string; desc: string }[] = [
  { name: "Create QR Code", desc: "Creates a dynamic QR code for a URL." },
  { name: "Update QR Destination", desc: "Changes where a code sends people — no reprinting." },
  { name: "Activate / Deactivate QR Code", desc: "Switches a code on or off." },
  { name: "Delete QR Code", desc: "Deletes a code permanently." },
]

/** What each scan carries (the qr.scanned webhook = GET /v1/qr/:id/scans). */
export const SCAN_FIELDS: { field: string; desc: string }[] = [
  { field: "scannedAt", desc: "When it was scanned (UTC)" },
  { field: "qrName / qrSlug / qrId", desc: "Which code" },
  { field: "country, countryCode, region, city", desc: "Approximate location" },
  { field: "deviceType", desc: "MOBILE, TABLET or DESKTOP" },
  { field: "os", desc: "Android, iOS, Windows, macOS, Linux" },
  { field: "browser", desc: "Chrome, Safari, Samsung Browser…" },
  { field: "referrer", desc: "The referring page, if any" },
  { field: "isUnique", desc: "First scan from this device in 4 hours" },
  { field: "placeName / placeCode / placeId", desc: "The code's place when scanned (Places), if it has one" },
  { field: "id", desc: "The scan's own id" },
]

/** Shown before the steps everywhere. */
export const INTEGRATION_REQUIREMENTS = [
  "The Pro plan or higher — the API and webhooks are part of it.",
  "An API key from genxqr.com → API Keys (one per tool, so you can revoke one alone). A key from any other site won't work.",
]

export const ZAPIER_STEPS = [
  "Open the GenXQR invite link for Zapier and accept it — this adds GenXQR to your Zapier account.",
  "Create a Zap. For the trigger choose GenXQR and an event (e.g. New QR Scan), then connect with your API key.",
  "Test the trigger: it shows up to 3 recent scans of your most recently updated code (scan one first if there are none).",
  "Add an action (e.g. Google Sheets → Create Spreadsheet Row). Map each field by inserting it from the GenXQR step — typing a field's name writes that text, not the value.",
  "Publish. Turning the Zap on adds a “Zapier — qr.scanned” webhook in GenXQR → Webhooks; turning it off removes it.",
]

export const MAKE_STEPS = [
  MAKE_INVITE_URL
    ? "Open the GenXQR invite link for Make and install the app."
    : `Email ${INTEGRATIONS_SUPPORT_EMAIL} for the GenXQR invite link for Make, then install the app from it.`,
  "Create a scenario, click +, and add GenXQR → Watch QR Scans (or another trigger).",
  "Click Create a webhook → Add, paste your API key and save — Make checks the key and registers its webhook in GenXQR.",
  "Add the next module (e.g. Google Sheets → Add a Row) and map the GenXQR fields.",
  "Turn the scenario on. Switching it off removes its webhook from GenXQR again.",
]

export const N8N_STEPS = [
  "Add a Webhook node (method POST) to a workflow and copy its Production URL.",
  "In GenXQR → Webhooks, add a webhook with that URL and the events you want (or create it with POST /v1/webhooks). Activate the workflow.",
  "Each delivery's body is { event, timestamp, data } — the scan fields are under data.",
  "To act on GenXQR, add an HTTP Request node: header Authorization: Bearer <your API key>, and the endpoints from the API reference (e.g. PATCH https://genxqr.com/v1/qr/:id).",
  "Optional: verify the X-GenXQR-Signature header with the webhook's secret in a Code node (see Signature Verification).",
]

export const INTEGRATION_NOTES = [
  "Every recorded scan triggers, including repeat scans from the same phone — filter on isUnique = true to keep first scans only.",
  "Very heavy repeat scanning from one network (over 10 a minute or 100 a day on one code) still redirects people but is not recorded, so it triggers nothing.",
  "Deliveries pause if the account drops below Pro, and resume when it is back on Pro.",
]
