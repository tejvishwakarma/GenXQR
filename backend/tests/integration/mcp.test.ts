import { beforeAll, describe, expect, it } from "vitest"
import request from "supertest"
import app from "../../src/app.js"
import { prisma } from "../../src/db/prisma.js"
import { createApiKey } from "../../src/services/apikeys.service.js"
import { createUser, giveSubscription, seedPlans } from "../helpers/factories.js"

/**
 * The MCP server at /v1/mcp (8 Nov 2026): JSON-RPC over Streamable HTTP,
 * behind the same API key as /v1. Tools act only on the key's own account.
 */
async function keyFor(plan: "PRO" | "STARTER" = "PRO") {
  const user = await createUser()
  await giveSubscription(user.id, plan)
  const { rawKey } = await createApiKey(user.id, "mcp test")
  return { user, key: rawKey }
}

let nextId = 1
function rpc(key: string | null, method: string, params: Record<string, unknown> = {}) {
  const r = request(app).post("/v1/mcp")
    .set("Accept", "application/json, text/event-stream")
    .set("Content-Type", "application/json")
  if (key) r.set("Authorization", `Bearer ${key}`)
  return r.send({ jsonrpc: "2.0", id: nextId++, method, params })
}

/** A tools/call result: the tool's JSON payload, or its error text. */
async function call(key: string, name: string, args: Record<string, unknown> = {}) {
  const res = await rpc(key, "tools/call", { name, arguments: args })
  expect(res.status, res.text).toBe(200)
  const result = res.body.result as { isError?: boolean; content: Array<{ text: string }> }
  return { isError: !!result.isError, text: result.content[0]!.text, json: () => JSON.parse(result.content[0]!.text) }
}

describe("MCP server", () => {
  beforeAll(async () => {
    await seedPlans()
  })

  it("should answer initialize and list its tools", async () => {
    const { key } = await keyFor()
    const init = await rpc(key, "initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "test", version: "1" } })
    expect(init.status, init.text).toBe(200)
    expect(init.body.result.serverInfo.name).toBe("genxqr")
    const tools = await rpc(key, "tools/list")
    const names = (tools.body.result.tools as Array<{ name: string; annotations?: Record<string, boolean> }>)
    expect(names.map((t) => t.name).sort()).toEqual([
      "create_qr_code", "delete_qr_code", "get_qr_analytics", "get_qr_code", "list_folders", "list_places", "list_qr_codes", "set_qr_code_active", "update_qr_code",
    ])
    expect(names.find((t) => t.name === "delete_qr_code")?.annotations?.destructiveHint).toBe(true)
  })

  it("should refuse a request without a valid key, or below Pro", async () => {
    expect((await rpc(null, "tools/list")).status).toBe(401)
    expect((await rpc("gxqr_not_a_real_key", "tools/list")).status).toBe(401)
    const { key } = await keyFor("STARTER")
    expect((await rpc(key, "tools/list")).status).toBe(403)
  })

  it("should create, edit, switch off and delete a code, logged as via mcp", async () => {
    const { user, key } = await keyFor()
    const created = await call(key, "create_qr_code", { name: "Menu", type: "URL", content: { url: "https://example.com/menu" } })
    expect(created.isError, created.text).toBe(false)
    const qr = created.json() as { id: string; scanUrl: string }
    expect(qr.scanUrl).toContain("/r/")

    const updated = await call(key, "update_qr_code", { id: qr.id, content: { url: "https://example.com/menu-2" } })
    expect(updated.json().content.data.url).toBe("https://example.com/menu-2")

    expect((await call(key, "set_qr_code_active", { id: qr.id, active: false })).json()).toMatchObject({ isActive: false, changed: true })
    expect((await call(key, "set_qr_code_active", { id: qr.id, active: false })).json()).toMatchObject({ isActive: false, changed: false })

    const list = (await call(key, "list_qr_codes")).json() as { codes: Array<{ id: string }> }
    expect(list.codes.map((c) => c.id)).toContain(qr.id)

    const log = await prisma.auditLog.findFirst({ where: { userId: user.id, action: "qr.create" }, select: { metadata: true } })
    expect((log?.metadata as Record<string, unknown>)?.via).toBe("mcp")

    expect((await call(key, "delete_qr_code", { id: qr.id })).json()).toEqual({ id: qr.id, deleted: true })
    expect(await prisma.qRCode.count({ where: { id: qr.id } })).toBe(0)
  })

  it("should not reach another account's codes, and report bad input as a tool error", async () => {
    const owner = await keyFor()
    const other = await keyFor()
    const qr = (await call(owner.key, "create_qr_code", { name: "Mine", type: "URL", content: { url: "https://example.com" } })).json() as { id: string }

    for (const [tool, args] of [
      ["get_qr_code", { id: qr.id }],
      ["update_qr_code", { id: qr.id, name: "Taken" }],
      ["set_qr_code_active", { id: qr.id, active: false }],
      ["delete_qr_code", { id: qr.id }],
      ["get_qr_analytics", { id: qr.id }],
    ] as const) {
      const r = await call(other.key, tool, args)
      expect(r.isError, `${tool} reached another account's code`).toBe(true)
      expect(r.text).toMatch(/not found/i)
    }
    expect((await call(other.key, "list_qr_codes")).json().codes).toEqual([])
    expect(await prisma.qRCode.findUnique({ where: { id: qr.id }, select: { name: true, isActive: true } })).toEqual({ name: "Mine", isActive: true })

    const bad = await call(owner.key, "create_qr_code", { name: "Pay", type: "UPI", content: { upiId: "nope" } })
    expect(bad.isError).toBe(true)
    expect(bad.text).toMatch(/UPI ID/)
  })
})
