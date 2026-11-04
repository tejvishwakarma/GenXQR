// Deploys src/ to a Make custom app through Make's API — create-or-update, so
// running it again changes what exists rather than adding duplicates.
//
//   MAKE_APP=genxqr-tl8adh node scripts/deploy.mjs
//
// Token: MAKE_API_TOKEN, or ~/.make-token (scopes sdk-apps:read + sdk-apps:write,
// Make → Profile → API access). Zone: MAKE_ZONE (default eu1.make.com).
//
// Make names connections and webhooks itself (genxqr-xxxx, genxqr-xxxx2, …), so
// they are matched by LABEL; RPCs and modules by the name in metadata.json.
// metadata.json's "connection"/"webhook" fields are logical references to the
// connection / webhook folders and are resolved to Make's names here.
import fs from "node:fs"
import os from "node:os"
import path from "node:path"

const APP = process.env.MAKE_APP
if (!APP) throw new Error("Set MAKE_APP to the app's name in Make (e.g. genxqr-tl8adh)")
const ZONE = process.env.MAKE_ZONE || "eu1.make.com"
const TOKEN = (process.env.MAKE_API_TOKEN || fs.readFileSync(path.join(os.homedir(), ".make-token"), "utf8")).trim()
const VERSION = 1
const SRC = new URL("../src/", import.meta.url).pathname

const read = (p) => fs.readFileSync(path.join(SRC, p), "utf8")
const json = (p) => JSON.parse(read(p))
const dirs = (p) => fs.readdirSync(path.join(SRC, p)).filter((d) => fs.statSync(path.join(SRC, p, d)).isDirectory())
const has = (p) => fs.existsSync(path.join(SRC, p))

async function api(method, url, body, contentType = "application/json") {
  const res = await fetch(`https://${ZONE}/api/v2${url}`, {
    method,
    headers: { Authorization: `Token ${TOKEN}`, ...(body !== undefined && { "Content-Type": contentType }) },
    body: body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body),
  })
  const text = await res.text()
  let data
  try { data = JSON.parse(text) } catch { data = text }
  if (!res.ok) throw new Error(`${method} ${url} → ${res.status} ${typeof data === "string" ? data : JSON.stringify(data)}`)
  return data
}
const section = (url, file) => api("PUT", url, read(file), "application/jsonc")
const log = (...a) => console.log(...a)

// ── App ──────────────────────────────────────────────────────────────────────
const appMeta = json("app.json")
await api("PATCH", `/sdk/apps/${APP}/${VERSION}`, { label: appMeta.label, description: appMeta.description, theme: "#7c3aed" })
await section(`/sdk/apps/${APP}/${VERSION}/base`, "base.imljson")
log("app + base")

// ── Connection ───────────────────────────────────────────────────────────────
const connNames = {}
const existingConns = (await api("GET", `/sdk/apps/${APP}/connections`)).appConnections
for (const dir of dirs("connections")) {
  const meta = json(`connections/${dir}/metadata.json`)
  let name = existingConns.find((c) => c.label === meta.label)?.name
  if (!name) name = (await api("POST", `/sdk/apps/${APP}/connections`, { type: meta.type, label: meta.label })).appConnection.name
  connNames[meta.name] = name
  await section(`/sdk/apps/connections/${name}/api`, `connections/${dir}/api.imljson`)
  await section(`/sdk/apps/connections/${name}/parameters`, `connections/${dir}/parameters.imljson`)
  log(`connection ${meta.label} → ${name}`)
}

// ── Webhooks ─────────────────────────────────────────────────────────────────
const hookNames = {}
const existingHooks = (await api("GET", `/sdk/apps/${APP}/webhooks`)).appWebhooks
for (const dir of dirs("webhooks")) {
  const meta = json(`webhooks/${dir}/metadata.json`)
  let name = existingHooks.find((w) => w.label === meta.label)?.name
  const connection = connNames[meta.connection] ?? Object.values(connNames)[0]
  if (!name) name = (await api("POST", `/sdk/apps/${APP}/webhooks`, { type: meta.type, label: meta.label, connection })).appWebhook.name
  hookNames[meta.name] = name
  await section(`/sdk/apps/webhooks/${name}/api`, `webhooks/${dir}/respond.imljson`)
  await section(`/sdk/apps/webhooks/${name}/attach`, `webhooks/${dir}/attach.imljson`)
  await section(`/sdk/apps/webhooks/${name}/detach`, `webhooks/${dir}/detach.imljson`)
  log(`webhook ${meta.label} → ${name}`)
}

// ── RPCs ─────────────────────────────────────────────────────────────────────
const existingRpcs = (await api("GET", `/sdk/apps/${APP}/${VERSION}/rpcs`)).appRpcs.map((r) => r.name)
for (const dir of dirs("rpcs")) {
  const meta = json(`rpcs/${dir}/metadata.json`)
  const connection = connNames[meta.connection] ?? Object.values(connNames)[0]
  if (!existingRpcs.includes(meta.name)) await api("POST", `/sdk/apps/${APP}/${VERSION}/rpcs`, { name: meta.name, label: meta.label, connection })
  await section(`/sdk/apps/${APP}/${VERSION}/rpcs/${meta.name}/api`, `rpcs/${dir}/api.imljson`)
  log(`rpc ${meta.name}`)
}

// ── Modules ──────────────────────────────────────────────────────────────────
const TYPE_ID = { trigger: 10, action: 4 } // 10 = instant trigger (webhook), 4 = action
const existingModules = (await api("GET", `/sdk/apps/${APP}/${VERSION}/modules`)).appModules.map((m) => m.name)
for (const dir of dirs("modules")) {
  const meta = json(`modules/${dir}/metadata.json`)
  const base = `/sdk/apps/${APP}/${VERSION}/modules/${meta.name}`
  const connection = connNames[meta.connection] ?? Object.values(connNames)[0]
  if (!existingModules.includes(meta.name)) {
    await api("POST", `/sdk/apps/${APP}/${VERSION}/modules`, {
      name: meta.name, typeId: TYPE_ID[meta.type], label: meta.label, description: meta.description,
      connection, ...(meta.webhook && { webhook: hookNames[meta.webhook] }),
    })
  } else {
    await api("PATCH", base, { label: meta.label, description: meta.description, connection })
  }
  if (has(`modules/${dir}/api.imljson`)) await section(`${base}/api`, `modules/${dir}/api.imljson`)
  // parameters.imljson = mappable parameters, which Make calls "expect".
  if (has(`modules/${dir}/parameters.imljson`)) await section(`${base}/expect`, `modules/${dir}/parameters.imljson`)
  if (has(`modules/${dir}/output.imljson`)) await section(`${base}/interface`, `modules/${dir}/output.imljson`)
  log(`module ${meta.name}`)
}
log("done")
