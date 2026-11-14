import type { Request, Response } from "express"
import { z } from "zod"
import { QRType } from "@prisma/client"
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js"
import type { AccessTokenPayload } from "../utils/jwt.js"
import { AppError } from "../middleware/error.middleware.js"
import { logger } from "../logger/index.js"
import { createQRSchema, getQR, listQRs, updateQRSchema } from "../services/qr.service.js"
import { getQRAnalytics } from "../services/analytics.service.js"
import { listPlaces } from "../services/place.service.js"
import { listFolders } from "../services/folder.service.js"
import { apiCreateQR, apiDeleteQR, apiToggleQR, apiUpdateQR, type ApiCaller } from "../services/api-actions.service.js"

/**
 * POST /v1/mcp — GenXQR as an MCP server (Model Context Protocol, Streamable
 * HTTP, stateless), so AI assistants (Claude, Cursor, ChatGPT…) can list,
 * create, edit and read analytics for codes. Built 8 Nov 2026.
 *
 * It sits behind the same middleware as the rest of /v1 — API key (Pro+),
 * rate limit, monthly API quota — and every change goes through
 * api-actions.service, so webhooks and the activity log see MCP changes
 * exactly as REST ones (via: "mcp"). A fresh server per request: nothing is
 * shared between callers.
 */

const CONTENT_HELP =
  "Content depends on the type. URL: {url}. WHATSAPP: {phone, message?}. INSTAGRAM: {username}. FACEBOOK: {url}. " +
  "UPI: {upiId, payeeName, amount?, note?}. GOOGLE_REVIEW: {reviewUrl} or {placeId}. WIFI: {ssid, password, security: WPA|WEP|nopass}. " +
  "EVENT: {title, start: 'YYYY-MM-DDTHH:mm' local time, end?, timeZone (IANA, default Asia/Kolkata), venue?, address?, description?, link?}. " +
  "FORM: {title, fields: [{id, label, type: text|textarea|email|phone|rating|select, required?, options?}], notify?}. " +
  "Full schemas: https://genxqr.com/api-docs"

/** A tool result: the data as JSON text (what every client can read). */
const ok = (data: unknown) => ({ content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] })

/** Errors the caller can act on (not found, plan limit, bad input) come back as tool errors, not protocol failures. */
async function run(fn: () => Promise<unknown>) {
  try {
    return ok(await fn())
  } catch (err) {
    const message = err instanceof AppError
      ? err.message
      : err instanceof z.ZodError
        ? err.issues.map((i) => `${i.path.join(".") || "input"}: ${i.message}`).join("; ")
        : "Something went wrong."
    if (!(err instanceof AppError) && !(err instanceof z.ZodError)) logger.error("MCP tool failed", { error: String(err) })
    return { isError: true, content: [{ type: "text" as const, text: message }] }
  }
}

/** The codes a caller sees, trimmed to what an assistant needs to talk about them. */
function summary(qr: Record<string, unknown>) {
  const pick = (k: string) => qr[k]
  return {
    id: pick("id"), name: pick("name"), type: pick("type"), isActive: pick("isActive"), scanUrl: pick("scanUrl"),
    scanCount: pick("scanCount"), tags: pick("tags"), place: pick("place"), folder: pick("folder"),
    createdAt: pick("createdAt"), updatedAt: pick("updatedAt"),
  }
}

function buildServer(caller: ApiCaller): McpServer {
  const server = new McpServer({ name: "genxqr", version: "1.0.0" })
  const userId = caller.userId

  server.registerTool("list_qr_codes", {
    title: "List QR codes",
    description: "Lists the account's QR codes, newest first (20 per page). Filter by search text (name, tag or place), type, folder or place.",
    inputSchema: {
      search: z.string().max(100).optional(),
      type: z.nativeEnum(QRType).optional(),
      folderId: z.string().max(40).optional().describe("A folder id from list_folders, or 'none' for codes in no folder"),
      placeId: z.string().max(40).optional().describe("A place id from list_places, or 'none'"),
      page: z.number().int().positive().optional(),
    },
    annotations: { readOnlyHint: true },
  }, (args) => run(async () => {
    const res = await listQRs(userId, { page: args.page ?? 1, limit: 20, search: args.search, type: args.type, folderId: args.folderId, placeId: args.placeId, sort: "createdAt" })
    return { codes: res.data.map((q) => summary(q as unknown as Record<string, unknown>)), pagination: res.pagination }
  }))

  server.registerTool("get_qr_code", {
    title: "Get a QR code",
    description: "One QR code with its content, design and settings. scanUrl is the address the printed code opens.",
    inputSchema: { id: z.string().min(1).max(40) },
    annotations: { readOnlyHint: true },
  }, ({ id }) => run(() => getQR(id, userId)))

  server.registerTool("create_qr_code", {
    title: "Create a QR code",
    description: `Creates a dynamic QR code (its destination can be changed later without reprinting). Returns it, including scanUrl. ${CONTENT_HELP}`,
    inputSchema: {
      name: z.string().min(1).max(200),
      type: z.nativeEnum(QRType),
      content: z.record(z.string(), z.unknown()).describe("The type's content object (see the description)"),
      tags: z.array(z.string().max(50)).max(10).optional(),
      folderId: z.string().max(40).optional(),
      placeId: z.string().max(40).optional(),
    },
  }, (args) => run(async () => {
    const input = createQRSchema.parse({ name: args.name, type: args.type, tags: args.tags ?? [], folderId: args.folderId, placeId: args.placeId, content: { data: args.content } })
    return apiCreateQR(caller, input)
  }))

  server.registerTool("update_qr_code", {
    title: "Update a QR code",
    description: `Changes a code's name, content (e.g. where a URL code sends people), tags, folder or place. The printed code keeps working. Content replaces the old content as a whole. ${CONTENT_HELP}`,
    inputSchema: {
      id: z.string().min(1).max(40),
      name: z.string().min(1).max(200).optional(),
      content: z.record(z.string(), z.unknown()).optional(),
      tags: z.array(z.string().max(50)).max(10).optional(),
      folderId: z.string().max(40).nullable().optional().describe("null takes it out of its folder"),
      placeId: z.string().max(40).nullable().optional().describe("null takes it off its place"),
    },
    annotations: { idempotentHint: true },
  }, (args) => run(async () => {
    const input = updateQRSchema.parse({
      ...(args.name !== undefined && { name: args.name }),
      ...(args.content !== undefined && { content: { data: args.content } }),
      ...(args.tags !== undefined && { tags: args.tags }),
      ...(args.folderId !== undefined && { folderId: args.folderId }),
      ...(args.placeId !== undefined && { placeId: args.placeId }),
    })
    return apiUpdateQR(caller, args.id, input)
  }))

  server.registerTool("set_qr_code_active", {
    title: "Switch a QR code on or off",
    description: "Turns a code on or off. A code that is off shows scanners a 'not active' page (or its fallback URL).",
    inputSchema: { id: z.string().min(1).max(40), active: z.boolean() },
    annotations: { idempotentHint: true },
  }, ({ id, active }) => run(async () => {
    const qr = await getQR(id, userId)
    if (qr.isActive === active) return { id, isActive: active, changed: false }
    const result = await apiToggleQR(caller, id)
    return { id, isActive: result.isActive, changed: true }
  }))

  server.registerTool("delete_qr_code", {
    title: "Delete a QR code",
    description: "Permanently deletes a code and its scan history. Printed copies stop working. Cannot be undone — confirm with the user first.",
    inputSchema: { id: z.string().min(1).max(40) },
    annotations: { destructiveHint: true },
  }, ({ id }) => run(async () => {
    await apiDeleteQR(caller, id)
    return { id, deleted: true }
  }))

  server.registerTool("get_qr_analytics", {
    title: "Scan analytics for a QR code",
    description: "Scans over the last N days (default 30, max 90): totals, by day, country, city, device, OS and browser.",
    inputSchema: { id: z.string().min(1).max(40), days: z.number().int().min(1).max(90).optional() },
    annotations: { readOnlyHint: true },
  }, ({ id, days }) => run(async () => {
    await getQR(id, userId) // ownership (404 if not this account's)
    return getQRAnalytics(id, days ?? 30)
  }))

  server.registerTool("list_places", {
    title: "List places",
    description: "Where the account prints its codes (stores, stations…), with code counts and scans. Ids are for placeId.",
    annotations: { readOnlyHint: true },
  }, () => run(() => listPlaces(userId)))

  server.registerTool("list_folders", {
    title: "List folders",
    description: "The account's folders of codes, with code counts. Ids are for folderId.",
    annotations: { readOnlyHint: true },
  }, () => run(() => listFolders(userId)))

  return server
}

export async function handleMcp(req: Request, res: Response): Promise<void> {
  // One request, one call. The transport accepts JSON-RPC batches of up to 100
  // messages, but the rate limit and the monthly API quota count the HTTP
  // request: a batch was 100 tool calls for the price of one. (MCP dropped
  // batching from the protocol in its 2025-06-18 revision.)
  if (Array.isArray(req.body)) {
    res.status(400).json({ jsonrpc: "2.0", error: { code: -32600, message: "Batch requests are not supported. Send one request per call." }, id: null })
    return
  }
  const caller: ApiCaller = {
    userId: (req.user as unknown as AccessTokenPayload).sub,
    apiKeyId: req.apiKeyId ?? null,
    oauthClientId: req.oauthClientId ?? null,
    ip: req.ip,
    userAgent: req.headers["user-agent"],
    via: "mcp",
  }
  const server = buildServer(caller)
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true })
  res.on("close", () => {
    void transport.close()
    void server.close()
  })
  try {
    await server.connect(transport)
    await transport.handleRequest(req, res, req.body)
  } catch (err) {
    logger.error("MCP request failed", { error: String(err) })
    if (!res.headersSent) res.status(500).json({ jsonrpc: "2.0", error: { code: -32603, message: "Internal error" }, id: null })
  }
}

/** Stateless: no server-sent stream to open and no session to end. */
export function mcpMethodNotAllowed(_req: Request, res: Response): void {
  res.status(405).set("Allow", "POST").json({ jsonrpc: "2.0", error: { code: -32000, message: "Method not allowed. Send MCP requests as POST." }, id: null })
}
