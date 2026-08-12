import type { PlanName, Role } from "@prisma/client"
import { prisma } from "../../src/db/prisma.js"
import { signAccessToken } from "../../src/utils/jwt.js"
import { hashPassword } from "../../src/utils/password.js"

/**
 * Plan reference data. Mirrors prisma/seed.mjs but is intentionally minimal —
 * only the fields the code under test reads. Seeded once per run (plans are in
 * setup.ts's PRESERVED_TABLES, so they survive the per-test truncate).
 */
const PLAN_SEEDS = [
  { name: "FREE", displayName: "Free", priceMonthlyINR: 0, priceYearlyINR: 0, priceMonthlyUSD: 0, priceYearlyUSD: 0, dynamicQRLimit: 0, scanLimit: 0, fileStorageGB: 0, teamSeatsLimit: 1, apiCallsLimit: 0 },
  { name: "STARTER", displayName: "Starter", priceMonthlyINR: 299, priceYearlyINR: 2988, priceMonthlyUSD: 4, priceYearlyUSD: 36, dynamicQRLimit: 50, scanLimit: 5000, fileStorageGB: 1, teamSeatsLimit: 1, apiCallsLimit: 0 },
  { name: "PRO", displayName: "Pro", priceMonthlyINR: 799, priceYearlyINR: 7788, priceMonthlyUSD: 10, priceYearlyUSD: 96, dynamicQRLimit: 250, scanLimit: 50000, fileStorageGB: 5, teamSeatsLimit: 5, apiCallsLimit: 10000 },
  { name: "BUSINESS", displayName: "Business", priceMonthlyINR: 2499, priceYearlyINR: 23988, priceMonthlyUSD: 30, priceYearlyUSD: 288, dynamicQRLimit: 2000, scanLimit: 500000, fileStorageGB: 50, teamSeatsLimit: 20, apiCallsLimit: 100000 },
  { name: "ENTERPRISE", displayName: "Enterprise", priceMonthlyINR: 9999, priceYearlyINR: 99990, priceMonthlyUSD: 120, priceYearlyUSD: 1200, dynamicQRLimit: 999999, scanLimit: 999999999, fileStorageGB: 1000, teamSeatsLimit: 999, apiCallsLimit: 999999999 },
] as const

export async function seedPlans(): Promise<void> {
  for (const plan of PLAN_SEEDS) {
    await prisma.plan.upsert({
      where: { name: plan.name as PlanName },
      update: {},
      create: { ...plan, name: plan.name as PlanName, features: {} },
    })
  }
}

let userCounter = 0

export interface TestUser {
  id: string
  email: string
  name: string
  role: Role
  password: string
  /** Signed JWT for this user, ready for an `Authorization: Bearer` header. */
  token: string
}

/**
 * Creates a real user row and returns it along with a valid signed token.
 * Emails are unique per call so tests never collide on the unique constraint.
 */
export async function createUser(
  overrides: { role?: Role; email?: string; password?: string; emailVerified?: boolean; name?: string } = {},
): Promise<TestUser> {
  userCounter += 1
  const email = overrides.email ?? `user${userCounter}.${Date.now()}@test.local`
  const password = overrides.password ?? "TestPass123!"
  const role = overrides.role ?? "USER"
  const name = overrides.name ?? `Test User ${userCounter}`

  const user = await prisma.user.create({
    data: {
      email,
      name,
      role,
      passwordHash: await hashPassword(password),
      emailVerified: overrides.emailVerified ?? true,
    },
    select: { id: true, email: true, name: true, role: true },
  })

  return {
    ...user,
    password,
    token: signAccessToken({ sub: user.id, email: user.email, role: user.role }),
  }
}

export const createAdmin = (o: Parameters<typeof createUser>[0] = {}) => createUser({ ...o, role: "ADMIN" })
export const createSuperAdmin = (o: Parameters<typeof createUser>[0] = {}) => createUser({ ...o, role: "SUPER_ADMIN" })

/** Attaches an active subscription on the named plan to an existing user. */
export async function giveSubscription(userId: string, planName: PlanName = "PRO") {
  const plan = await prisma.plan.findUniqueOrThrow({ where: { name: planName } })
  const now = new Date()
  const periodEnd = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000)

  return prisma.subscription.upsert({
    where: { userId },
    update: { planId: plan.id, status: "ACTIVE", currentPeriodStart: now, currentPeriodEnd: periodEnd },
    create: { userId, planId: plan.id, status: "ACTIVE", currentPeriodStart: now, currentPeriodEnd: periodEnd },
  })
}

let slugCounter = 0

/** Creates a dynamic QR code owned by `userId`. */
export async function createQRCode(userId: string, overrides: { name?: string; isActive?: boolean; slug?: string } = {}) {
  slugCounter += 1
  return prisma.qRCode.create({
    data: {
      userId,
      name: overrides.name ?? `Test QR ${slugCounter}`,
      slug: overrides.slug ?? `test${slugCounter}${Date.now().toString(36)}`.slice(0, 12),
      type: "URL",
      category: "DYNAMIC",
      isActive: overrides.isActive ?? true,
      content: { create: { data: { url: "https://example.com" } } },
    },
    select: { id: true, slug: true, name: true, isActive: true, userId: true },
  })
}
