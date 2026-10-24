import { beforeAll, describe, expect, it } from "vitest"
import { prisma } from "../../src/db/prisma.js"
import { createTrialSubscription } from "../../src/services/billing.service.js"
import { deleteUserAndData } from "../../src/services/account-erasure.service.js"
import { normalizeEmail } from "../../src/utils/normalize-email.util.js"
import { createUser, seedPlans } from "../helpers/factories.js"

/**
 * One free trial per inbox, even across account deletion (security audit,
 * 23 Oct 2026). Eligibility only looked at accounts that still exist, so
 * deleting your account and signing up again gave a fresh 14-day PRO trial.
 */
async function accountWithTrialStep(email: string) {
  const user = await createUser({ email })
  await prisma.user.update({ where: { id: user.id }, data: { normalizedEmail: normalizeEmail(email) } })
  await createTrialSubscription(user.id) // what the first verified sign-in runs
  return prisma.subscription.findUniqueOrThrow({ where: { userId: user.id }, include: { plan: true } }).then((s) => ({ user, sub: s }))
}

describe("trial after account deletion", () => {
  beforeAll(async () => {
    await seedPlans()
  })

  it("should not give a second trial after the account is deleted and re-created", async () => {
    const email = `again.${Date.now()}@gmail.com`
    const first = await accountWithTrialStep(email)
    expect(first.sub.status).toBe("TRIALING")

    await deleteUserAndData(first.user.id)
    const second = await accountWithTrialStep(email)
    expect(second.sub.status).not.toBe("TRIALING")
    expect(second.sub.plan.name).toBe("FREE")
  })

  it("should treat an alias of the same inbox the same way", async () => {
    const stamp = Date.now()
    const first = await accountWithTrialStep(`alias.${stamp}@gmail.com`)
    await deleteUserAndData(first.user.id)
    const second = await accountWithTrialStep(`a.lias.${stamp}+new@gmail.com`)
    expect(second.sub.plan.name).toBe("FREE")
  })

  it("should still give a new inbox its trial", async () => {
    const { sub } = await accountWithTrialStep(`fresh.${Date.now()}@test.local`)
    expect(sub.status).toBe("TRIALING")
  })
})
