import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"
import type { Readable } from "node:stream"

/**
 * Google Drive export (9 Nov 2026): Business and above. The browser draws each
 * code and sends it; the server makes the folder + codes.csv, names every file,
 * and accepts only the caller's own codes, each once. Google is stubbed.
 */
const drive = vi.hoisted(() => ({ files: [] as Array<{ name: string; parents?: string[]; mimeType?: string; body: string }> }))
vi.mock("googleapis", () => {
  class OAuth2 {
    setCredentials() {}
    on() {}
    generateAuthUrl() { return "https://accounts.google.com/o/oauth2/v2/auth?scope=drive.file" }
    async getToken() { return { tokens: { access_token: "at" } } }
    async revokeToken() {}
  }
  const read = async (body?: Readable) => {
    if (!body) return ""
    const chunks: Buffer[] = []
    for await (const c of body) chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(String(c)))
    return Buffer.concat(chunks).toString("latin1")
  }
  return {
    google: {
      auth: { OAuth2 },
      drive: () => ({
        files: {
          get: async ({ fileId }: { fileId: string }) => ({ data: { id: fileId } }),
          create: async (args: { requestBody: { name: string; parents?: string[]; mimeType?: string }; media?: { body: Readable } }) => {
            drive.files.push({ ...args.requestBody, body: await read(args.media?.body) })
            const id = `f${drive.files.length}`
            return { data: { id, name: args.requestBody.name, webViewLink: `https://drive.google.com/drive/folders/${id}` } }
          },
        },
      }),
    },
  }
})

const { default: app } = await import("../../src/app.js")
const { default: request } = await import("supertest")
const { prisma } = await import("../../src/db/prisma.js")
const { env } = await import("../../src/config/env.js")
const { createQRCode, createUser, giveSubscription, seedPlans } = await import("../helpers/factories.js")
type TestUser = Awaited<ReturnType<typeof createUser>>

const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(32)])
const as = (u: TestUser) => ({ Authorization: `Bearer ${u.token}` })
const saved = { id: env.GOOGLE_CLIENT_ID, secret: env.GOOGLE_CLIENT_SECRET }

async function connected(plan: "BUSINESS" | "PRO" = "BUSINESS") {
  const user = await createUser()
  await giveSubscription(user.id, plan)
  await prisma.user.update({ where: { id: user.id }, data: { driveConnected: true, driveAccessToken: "at", driveFolderId: "root-folder" } })
  return user
}
const start = (u: TestUser, qrIds: string[], format = "png") => request(app).post("/api/gdrive/export/start").set(as(u)).send({ qrIds, format })
const send = (u: TestUser, exportId: string, qrId: string, file: Buffer = PNG) =>
  request(app).post(`/api/gdrive/export/${exportId}/files/${qrId}`).set(as(u)).attach("file", file, "x.png")

describe("Google Drive export", () => {
  beforeAll(async () => {
    await seedPlans()
    env.GOOGLE_CLIENT_ID = "test-client"
    env.GOOGLE_CLIENT_SECRET = "test-secret"
  })
  afterAll(() => {
    env.GOOGLE_CLIENT_ID = saved.id
    env.GOOGLE_CLIENT_SECRET = saved.secret
  })

  it("should be a Business feature, connecting included", async () => {
    const pro = await connected("PRO")
    const qr = await createQRCode(pro.id)
    expect((await start(pro, [qr.id])).status).toBe(403)
    expect((await request(app).get("/api/gdrive/auth-url").set(as(pro))).status).toBe(403)
    const biz = await connected()
    expect((await request(app).get("/api/gdrive/auth-url").set(as(biz))).status).toBe(200)
  })

  it("should put codes.csv and one image per code in a new folder", async () => {
    const user = await connected()
    const a = await createQRCode(user.id, { name: "=HYPERLINK(\"x\")" })
    const b = await createQRCode(user.id, { name: "Blue Cafe" })
    drive.files.length = 0

    const res = await start(user, [a.id, b.id]).expect(200)
    const { exportId, folderUrl, files } = res.body.data as { exportId: string; folderUrl: string; files: Array<{ qrId: string; fileName: string }> }
    expect(folderUrl).toMatch(/^https:\/\/drive\.google\.com\//)
    expect(files.map((f) => f.fileName)).toEqual([`_HYPERLINK(_x_) - ${a.slug}.png`, `Blue Cafe - ${b.slug}.png`])

    const [folder, csv] = drive.files
    expect(folder).toMatchObject({ mimeType: "application/vnd.google-apps.folder", parents: ["root-folder"] })
    expect(folder!.name).toMatch(/^GenXQR export \d{4}-\d{2}-\d{2} \d{2}\.\d{2}$/)
    expect(csv).toMatchObject({ name: "codes.csv", parents: ["f1"] })
    expect(csv!.body).toContain(`/r/${b.slug}`)
    expect(csv!.body).toContain("'=HYPERLINK") // spreadsheet formulas neutralised

    await send(user, exportId, b.id).expect(200)
    expect(drive.files.at(-1)).toMatchObject({ name: `Blue Cafe - ${b.slug}.png`, parents: ["f1"], mimeType: "image/png" })
  })

  it("should only export the caller's own codes", async () => {
    const user = await connected()
    const other = await createUser()
    const theirs = await createQRCode(other.id)
    const mine = await createQRCode(user.id)
    expect((await start(user, [mine.id, theirs.id])).status).toBe(404)
  })

  it("should take each code once, only from the export's owner, only as the chosen format", async () => {
    const user = await connected()
    const qr = await createQRCode(user.id)
    const other = await createQRCode(user.id)
    const { exportId } = (await start(user, [qr.id]).expect(200)).body.data

    const stranger = await connected()
    expect((await send(stranger, exportId, qr.id)).status).toBe(404)
    expect((await send(user, exportId, qr.id, Buffer.from("<html>not a png</html>"))).status).toBe(422)
    expect((await send(user, exportId, other.id)).status).toBe(409) // not in this export
    await send(user, exportId, qr.id).expect(200)
    expect((await send(user, exportId, qr.id)).status).toBe(409) // already sent
  })
})
