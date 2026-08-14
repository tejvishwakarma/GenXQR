import { beforeAll, describe, expect, it } from "vitest"
import { prisma } from "../../src/db/prisma.js"
import { createTrialSubscription } from "../../src/services/billing.service.js"
import { normalizeEmail } from "../../src/utils/normalize-email.util.js"
import { createUser, seedPlans } from "../helpers/factories.js"

/**
 * Trial eligibility — one free trial per inbox, not per email address.
 *
 * Without this, a single person mints unlimited 14-day PRO trials by signing up
 * as user+1@, user+2@, or with dots sprinkled through a Gmail local part. The
 * rule deliberately restricts only the TRIAL: signing up with an alias stays
 * allowed, because plus-addressing is a legitimate way to file mail and blocking
 * it would cost real customers.
 */

/** Creates a user whose normalizedEmail is populated the way signup does it. */
async function createUserWithEmail(email: string) {
  const user = await createUser({ email })
  await prisma.user.update({
    where: { id: user.id },
    data: { normalizedEmail: normalizeEmail(email) },
  })
  return user
}

async function planOf(userId: string): Promise<{ plan: string; status: string } | null> {
  const sub = await prisma.subscription.findUnique({
    where: { userId },
    include: { plan: true },
  })
  return sub ? { plan: sub.plan.name, status: sub.status } : null
}

describe("trial eligibility", () => {
  beforeAll(async () => {
    await seedPlans()
  })

  describe("normalizeEmail", () => {
    it("should collapse +tag aliases onto one inbox", () => {
      expect(normalizeEmail("parth+1@gmail.com")).toBe("parth@gmail.com")
      expect(normalizeEmail("parth+anything@gmail.com")).toBe("parth@gmail.com")
    })

    it("should ignore dots for Gmail only", () => {
      expect(normalizeEmail("p.a.r.t.h@gmail.com")).toBe("parth@gmail.com")
      // Other providers treat dots as significant, so distinct people must stay
      // distinct — stripping them globally would deny strangers their trial.
      expect(normalizeEmail("a.b@example.org")).toBe("a.b@example.org")
    })

    it("should treat googlemail.com as gmail.com", () => {
      expect(normalizeEmail("parth@googlemail.com")).toBe("parth@gmail.com")
    })

    it("should be case-insensitive", () => {
      expect(normalizeEmail("PARTH@GMAIL.COM")).toBe("parth@gmail.com")
    })

    it("should refuse to judge malformed or empty-local addresses", () => {
      // null means "cannot judge", and callers must then grant the trial rather
      // than collapsing every unparseable address onto one another.
      expect(normalizeEmail("+only@gmail.com")).toBeNull()
      expect(normalizeEmail("not-an-email")).toBeNull()
      expect(normalizeEmail("@example.com")).toBeNull()
      expect(normalizeEmail("")).toBeNull()
    })
  })

  describe("granting", () => {
    it("should give a genuinely new user a PRO trial", async () => {
      const user = await createUserWithEmail(`fresh.${Date.now()}@example.com`)

      await createTrialSubscription(user.id)

      expect(await planOf(user.id)).toEqual({ plan: "PRO", status: "TRIALING" })
    })

    it("should NOT give a second trial to a +tag alias of an inbox that had one", async () => {
      const stamp = Date.now()
      const first = await createUserWithEmail(`farmer.${stamp}@gmail.com`)
      await createTrialSubscription(first.id)
      expect(await planOf(first.id)).toEqual({ plan: "PRO", status: "TRIALING" })

      const alias = await createUserWithEmail(`farmer.${stamp}+2@gmail.com`)
      await createTrialSubscription(alias.id)

      // Signup succeeded — the account exists and works — but on FREE.
      expect(await planOf(alias.id)).toEqual({ plan: "FREE", status: "ACTIVE" })
    })

    it("should NOT give a second trial to a dotted Gmail variant", async () => {
      const stamp = Date.now()
      const first = await createUserWithEmail(`abcdef${stamp}@gmail.com`)
      await createTrialSubscription(first.id)

      const dotted = await createUserWithEmail(`a.b.c.d.e.f${stamp}@gmail.com`)
      await createTrialSubscription(dotted.id)

      expect(await planOf(dotted.id)).toEqual({ plan: "FREE", status: "ACTIVE" })
    })

    it("should still give a trial to a genuinely different person at the same provider", async () => {
      const stamp = Date.now()
      const first = await createUserWithEmail(`someone.${stamp}@gmail.com`)
      await createTrialSubscription(first.id)

      const other = await createUserWithEmail(`different.${stamp}@gmail.com`)
      await createTrialSubscription(other.id)

      expect(await planOf(other.id)).toEqual({ plan: "PRO", status: "TRIALING" })
    })

    it("should withhold the trial even after the first one has lapsed to FREE", async () => {
      const stamp = Date.now()
      const first = await createUserWithEmail(`lapsed.${stamp}@gmail.com`)
      await createTrialSubscription(first.id)
      // Simulate the trial having run out and been downgraded.
      const freePlan = await prisma.plan.findUniqueOrThrow({ where: { name: "FREE" } })
      await prisma.subscription.update({
        where: { userId: first.id },
        data: { planId: freePlan.id, status: "ACTIVE", trialEndsAt: null },
      })

      const alias = await createUserWithEmail(`lapsed.${stamp}+again@gmail.com`)
      await createTrialSubscription(alias.id)

      expect(await planOf(alias.id)).toEqual({ plan: "FREE", status: "ACTIVE" })
    })

    it("should fail open and grant a trial when the address cannot be normalised", async () => {
      // Denying a real customer their evaluation is worse than granting one
      // extra trial to someone determined to farm them.
      const user = await createUser({ email: `weird.${Date.now()}@example.com` })
      await prisma.user.update({ where: { id: user.id }, data: { normalizedEmail: null } })

      await createTrialSubscription(user.id)

      expect(await planOf(user.id)).toEqual({ plan: "PRO", status: "TRIALING" })
    })
  })
})
