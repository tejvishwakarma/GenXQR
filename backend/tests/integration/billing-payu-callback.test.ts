import crypto from "node:crypto"
import { beforeAll, describe, expect, it } from "vitest"
import request from "supertest"
import app from "../../src/app.js"
import { prisma } from "../../src/db/prisma.js"
import { createUser, seedPlans, type TestUser } from "../helpers/factories.js"

/**
 * PayU payment callback — /api/billing/payu-success
 *
 * This is the single highest-stakes unauthenticated endpoint in the app: it is
 * public, and whatever it accepts becomes a paid subscription. The tests below
 * exist to make the signature check impossible to weaken silently.
 *
 * The endpoint always answers 302 (it redirects the user's browser back to the
 * billing page either way), so the real assertions are on database state —
 * whether a subscription/invoice was actually created — with the redirect's
 * ?payment= flag as a secondary signal.
 */

// Matches .env.test. The production values live in /home/genxqr/genxqr.env.
const TEST_KEY = "test_merchant_key"
const TEST_SALT = "test_merchant_salt"

/**
 * The handler redirects with 303 See Other, not 302 — correct here, since PayU
 * POSTs to this endpoint and the browser must follow up with a GET.
 */
const HTTP_SEE_OTHER = 303

interface CallbackFields {
  status: string
  txnid: string
  amount: string
  productinfo: string
  firstname: string
  email: string
  udf1: string // planName
  udf2: string // billingCycle
  udf3: string // userId
}

/**
 * Reproduces PayU's reverse-hash formula independently of the implementation:
 *   SHA512(salt|status|||||  |udf5|udf4|udf3|udf2|udf1|email|firstname|productinfo|amount|txnid|key)
 * Written out longhand rather than imported from billing.service so that a bug
 * introduced in the app's own hashing can't cancel itself out in the test.
 */
function payuReverseHash(f: CallbackFields, salt = TEST_SALT, key = TEST_KEY): string {
  const hashString = [
    salt,
    f.status,
    "", "", "", "", "", // 5 reserved padding fields
    "",                 // udf5
    "",                 // udf4
    f.udf3,
    f.udf2,
    f.udf1,
    f.email,
    f.firstname,
    f.productinfo,
    f.amount,
    f.txnid,
    key,
  ].join("|")
  return crypto.createHash("sha512").update(hashString).digest("hex")
}

let txnCounter = 0

function buildCallback(user: TestUser, overrides: Partial<CallbackFields> = {}): CallbackFields {
  txnCounter += 1
  return {
    status: "success",
    txnid: `txn_test_${Date.now()}_${txnCounter}`,
    amount: "799.00",
    productinfo: "PRO monthly",
    firstname: user.name,
    email: user.email,
    udf1: "PRO",
    udf2: "monthly",
    udf3: user.id,
    ...overrides,
  }
}

function postCallback(fields: CallbackFields, hash: string) {
  return request(app).post("/api/billing/payu-success").type("form").send({ ...fields, hash, mihpayid: "payu_test_id" })
}

describe("PayU payment callback", () => {
  beforeAll(async () => {
    await seedPlans()
  })

  describe("signature verification", () => {
    it("should activate the subscription for a correctly signed success callback", async () => {
      const user = await createUser()
      const fields = buildCallback(user)

      const res = await postCallback(fields, payuReverseHash(fields))

      expect(res.status).toBe(HTTP_SEE_OTHER)
      expect(res.headers.location).toContain("payment=success")

      const sub = await prisma.subscription.findUnique({
        where: { userId: user.id },
        include: { plan: true },
      })
      expect(sub).not.toBeNull()
      expect(sub?.status).toBe("ACTIVE")
      expect(sub?.plan.name).toBe("PRO")

      const invoice = await prisma.invoice.findUnique({ where: { payuTxnId: fields.txnid } })
      expect(invoice).not.toBeNull()
      expect(invoice?.userId).toBe(user.id)
    })

    it("should NOT activate anything when the hash is forged", async () => {
      const user = await createUser()
      const fields = buildCallback(user)

      const res = await postCallback(fields, "f".repeat(128))

      expect(res.headers.location).toContain("payment=failure")
      expect(await prisma.subscription.findUnique({ where: { userId: user.id } })).toBeNull()
      expect(await prisma.invoice.findUnique({ where: { payuTxnId: fields.txnid } })).toBeNull()
    })

    it("should NOT activate anything when the hash is computed with the wrong salt", async () => {
      const user = await createUser()
      const fields = buildCallback(user)

      // Exactly what an attacker who knows the algorithm but not the salt would send.
      const res = await postCallback(fields, payuReverseHash(fields, "attacker_guessed_salt"))

      expect(res.headers.location).toContain("payment=failure")
      expect(await prisma.subscription.findUnique({ where: { userId: user.id } })).toBeNull()
    })

    it("should NOT accept a valid hash whose amount was tampered with afterwards", async () => {
      const user = await createUser()
      const fields = buildCallback(user)
      const validHash = payuReverseHash(fields)

      // Pay for STARTER, then rewrite the amount before the callback lands.
      const res = await postCallback({ ...fields, amount: "1.00" }, validHash)

      expect(res.headers.location).toContain("payment=failure")
      expect(await prisma.subscription.findUnique({ where: { userId: user.id } })).toBeNull()
    })

    it("should NOT accept a valid hash re-pointed at a different user", async () => {
      const payer = await createUser()
      const victim = await createUser()
      const fields = buildCallback(payer)
      const validHash = payuReverseHash(fields)

      // Swap udf3 (the userId the subscription is granted to) post-signing.
      const res = await postCallback({ ...fields, udf3: victim.id }, validHash)

      expect(res.headers.location).toContain("payment=failure")
      expect(await prisma.subscription.findUnique({ where: { userId: victim.id } })).toBeNull()
    })

    it("should NOT accept a valid hash upgraded to a more expensive plan", async () => {
      const user = await createUser()
      const fields = buildCallback(user, { udf1: "STARTER", amount: "299.00" })
      const validHash = payuReverseHash(fields)

      const res = await postCallback({ ...fields, udf1: "BUSINESS" }, validHash)

      expect(res.headers.location).toContain("payment=failure")
      expect(await prisma.subscription.findUnique({ where: { userId: user.id } })).toBeNull()
    })

    it("should reject a hash of the wrong length without crashing", async () => {
      // timingSafeEqual throws on a length mismatch; verifyPayUHash must catch it.
      const user = await createUser()
      const fields = buildCallback(user)

      const res = await postCallback(fields, "abc123")

      expect(res.status).toBe(HTTP_SEE_OTHER)
      expect(res.headers.location).toContain("payment=failure")
      expect(await prisma.subscription.findUnique({ where: { userId: user.id } })).toBeNull()
    })
  })

  describe("replay protection", () => {
    it("should ignore a replayed callback and not create a second invoice", async () => {
      const user = await createUser()
      const fields = buildCallback(user)
      const hash = payuReverseHash(fields)

      await postCallback(fields, hash)
      const afterFirst = await prisma.invoice.findMany({ where: { userId: user.id } })
      expect(afterFirst).toHaveLength(1)

      // A captured callback is fully static, so a replay must be a no-op.
      await postCallback(fields, hash)
      const afterReplay = await prisma.invoice.findMany({ where: { userId: user.id } })
      expect(afterReplay).toHaveLength(1)
    })
  })

  describe("status and field handling", () => {
    it("should not activate on a correctly signed failure callback", async () => {
      const user = await createUser()
      const fields = buildCallback(user, { status: "failure" })

      const res = await postCallback(fields, payuReverseHash(fields))

      expect(res.headers.location).toContain("payment=failure")
      expect(await prisma.subscription.findUnique({ where: { userId: user.id } })).toBeNull()
    })

    it("should not activate when udf3 (the userId) is missing", async () => {
      const user = await createUser()
      const fields = buildCallback(user, { udf3: "" })

      const res = await postCallback(fields, payuReverseHash(fields))

      expect(res.headers.location).toContain("payment=failure")
      expect(await prisma.subscription.findUnique({ where: { userId: user.id } })).toBeNull()
    })

    it("should reject a plan that is not purchasable via checkout", async () => {
      const user = await createUser()
      // ENTERPRISE is sales-assisted; only STARTER/PRO/BUSINESS may self-serve.
      const fields = buildCallback(user, { udf1: "ENTERPRISE" })

      const res = await postCallback(fields, payuReverseHash(fields))

      expect(res.headers.location).toContain("payment=failure")
      expect(await prisma.subscription.findUnique({ where: { userId: user.id } })).toBeNull()
    })

    it("should not fall over on an empty callback body", async () => {
      const res = await request(app).post("/api/billing/payu-success").type("form").send({})

      expect(res.status).toBe(HTTP_SEE_OTHER)
      expect(res.headers.location).toContain("payment=failure")
    })
  })
})
