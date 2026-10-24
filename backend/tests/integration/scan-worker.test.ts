import { beforeAll, describe, expect, it } from "vitest"
import { prisma } from "../../src/db/prisma.js"
import { processScanJob } from "../../src/workers/scan.worker.js"
import { createQRCode, createUser, seedPlans } from "../helpers/factories.js"

/**
 * Scan jobs are retried (attempts: 3). Their writes used to be separate, so a
 * late failure — e.g. the A/B variant deleted meanwhile — replayed the whole
 * job and counted the scan again (security audit, 23 Oct 2026).
 */
const job = (qrId: string, abVariantId?: string) => ({
  data: { qrId, ip: "203.0.113.5", userAgent: "test", referrer: undefined, scannedAt: new Date().toISOString(), abVariantId, isUnique: true },
})

describe("scan worker", () => {
  beforeAll(async () => {
    await seedPlans()
  })

  it("should count a scan once even if its A/B variant was deleted", async () => {
    const user = await createUser()
    const qr = await createQRCode(user.id)
    await processScanJob(job(qr.id, "deleted-variant-id") as never)
    expect(await prisma.qRScan.count({ where: { qrId: qr.id } })).toBe(1)
    expect((await prisma.qRCode.findUniqueOrThrow({ where: { id: qr.id } })).scanCount).toBe(1)
  })

  it("should leave nothing behind when the job fails, so a retry counts once", async () => {
    const user = await createUser()
    const qr = await createQRCode(user.id)
    // A scan for a code deleted meanwhile fails inside the transaction…
    await prisma.qRCode.delete({ where: { id: qr.id } })
    await expect(processScanJob(job(qr.id) as never)).rejects.toThrow()
    // …and wrote nothing (the old code had already inserted the scan row).
    expect(await prisma.qRScan.count({ where: { qrId: qr.id } })).toBe(0)
  })
})
