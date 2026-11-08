import type { z } from "zod"
import { createQR, deleteQR, getQR, toggleQR, updateQR, type createQRSchema, type updateQRSchema } from "./qr.service.js"
import { deliverWebhookEvent } from "./webhook.service.js"
import { logAudit } from "./audit.service.js"

/**
 * Code changes made with an API key — the /v1 REST routes and the MCP server
 * (routes/mcp.ts) both call these, so a change raises the same webhook and
 * activity-log entry whichever way it came in.
 */
export interface ApiCaller {
  userId: string
  apiKeyId: string | null
  ip?: string
  userAgent?: string
  /** Where it came from, for the activity log: "api" (REST) or "mcp". */
  via: "api" | "mcp"
  /** The AI app, when MCP was reached with an OAuth token instead of a key. */
  oauthClientId?: string | null
}

function audit(c: ApiCaller, action: string, entityId: string, metadata: Record<string, unknown> = {}): void {
  logAudit({
    userId: c.userId, action, category: "qr", entityId, entityType: "QRCode",
    metadata: { ...metadata, via: c.via, apiKeyId: c.apiKeyId, ...(c.oauthClientId && { oauthClientId: c.oauthClientId }) }, ip: c.ip, userAgent: c.userAgent,
  })
}

export async function apiCreateQR(c: ApiCaller, input: z.infer<typeof createQRSchema>) {
  const qr = await createQR(c.userId, input)
  // An integration's own "New QR Code" trigger must see what it created, too.
  void deliverWebhookEvent(c.userId, "qr.created", { qr })
  audit(c, "qr.create", qr.id, { name: qr.name, type: qr.type })
  return qr
}

export async function apiUpdateQR(c: ApiCaller, id: string, input: z.infer<typeof updateQRSchema>) {
  const qr = await updateQR(id, c.userId, input)
  void deliverWebhookEvent(c.userId, "qr.updated", { qr })
  audit(c, "qr.update", qr.id, { name: qr.name })
  return qr
}

export async function apiToggleQR(c: ApiCaller, id: string) {
  const result = await toggleQR(id, c.userId)
  // On/off is an update for qr.updated subscribers, as in the dashboard.
  void getQR(result.id, c.userId)
    .then((qr) => deliverWebhookEvent(c.userId, "qr.updated", { qr }))
    .catch(() => undefined)
  audit(c, result.isActive ? "qr.activate" : "qr.deactivate", result.id)
  return result
}

export async function apiDeleteQR(c: ApiCaller, id: string) {
  // Read the name first: the qr.deleted payload carries it, and afterwards there is nothing to read.
  const existing = await getQR(id, c.userId)
  await deleteQR(id, c.userId)
  void deliverWebhookEvent(c.userId, "qr.deleted", { qrId: id, name: existing?.name ?? "" })
  audit(c, "qr.delete", id, { name: existing?.name ?? "" })
}
