/**
 * Prisma Seed Script (plain ESM — no transpilation needed)
 * Run via: node --env-file=.env prisma/seed.mjs
 *    or:   DATABASE_URL='...' node prisma/seed.mjs
 */

import { PrismaClient } from "@prisma/client"
import bcrypt from "bcryptjs"

const prisma = new PrismaClient()

const SUPER_ADMIN = {
  name: "Super Admin",
  email: process.env.ADMIN_EMAIL,
  password: process.env.ADMIN_PASSWORD,
  role: "SUPER_ADMIN",
}

const PLANS = [
  {
    name: "FREE", displayName: "Free",
    priceMonthlyINR: 0, priceYearlyINR: 0, priceMonthlyUSD: 0, priceYearlyUSD: 0,
    dynamicQRLimit: 3, scanLimit: 500, fileStorageGB: 0, teamSeatsLimit: 1, apiCallsLimit: 0,
    features: { customDomains: false, analytics: "30d", bulkGeneration: false, apiAccess: false, whiteLabel: false, prioritySupport: false },
  },
  {
    name: "STARTER", displayName: "Starter",
    priceMonthlyINR: 299, priceYearlyINR: 2988, priceMonthlyUSD: 4, priceYearlyUSD: 36,
    dynamicQRLimit: 25, scanLimit: 5000, fileStorageGB: 1, teamSeatsLimit: 1, apiCallsLimit: 0,
    features: { customDomains: false, analytics: "90d", bulkGeneration: false, apiAccess: false, whiteLabel: false, prioritySupport: false },
  },
  {
    name: "PRO", displayName: "Pro",
    priceMonthlyINR: 799, priceYearlyINR: 7788, priceMonthlyUSD: 10, priceYearlyUSD: 96,
    dynamicQRLimit: 250, scanLimit: 50000, fileStorageGB: 5, teamSeatsLimit: 5, apiCallsLimit: 10000,
    features: { customDomains: true, analytics: "1y", bulkGeneration: true, apiAccess: true, whiteLabel: false, prioritySupport: false },
  },
  {
    name: "BUSINESS", displayName: "Business",
    priceMonthlyINR: 2499, priceYearlyINR: 23988, priceMonthlyUSD: 30, priceYearlyUSD: 288,
    dynamicQRLimit: 2000, scanLimit: 500000, fileStorageGB: 50, teamSeatsLimit: 20, apiCallsLimit: 100000,
    features: { customDomains: true, analytics: "2y", bulkGeneration: true, apiAccess: true, whiteLabel: true, prioritySupport: true },
  },
  {
    name: "ENTERPRISE", displayName: "Enterprise",
    priceMonthlyINR: 9999, priceYearlyINR: 99990, priceMonthlyUSD: 120, priceYearlyUSD: 1200,
    dynamicQRLimit: 999999, scanLimit: 999999999, fileStorageGB: 1000, teamSeatsLimit: 999, apiCallsLimit: 999999999,
    features: { customDomains: true, analytics: "unlimited", bulkGeneration: true, apiAccess: true, whiteLabel: true, prioritySupport: true },
  },
]

async function main() {
  console.log("Seeding database…")

  for (const plan of PLANS) {
    await prisma.plan.upsert({ where: { name: plan.name }, update: plan, create: plan })
  }
  console.log(`  ✔ ${PLANS.length} plans upserted`)

  const passwordHash = await bcrypt.hash(SUPER_ADMIN.password, 12)

  const admin = await prisma.user.upsert({
    where: { email: SUPER_ADMIN.email },
    update: { name: SUPER_ADMIN.name, role: SUPER_ADMIN.role, emailVerified: true, passwordHash },
    create: { email: SUPER_ADMIN.email, name: SUPER_ADMIN.name, role: SUPER_ADMIN.role, emailVerified: true, passwordHash },
  })
  console.log(`  ✔ Super admin upserted: ${admin.email}`)

  const enterprisePlan = await prisma.plan.findUniqueOrThrow({ where: { name: "ENTERPRISE" } })
  const existingSub = await prisma.subscription.findUnique({ where: { userId: admin.id } })
  if (!existingSub) {
    await prisma.subscription.create({
      data: {
        userId: admin.id,
        planId: enterprisePlan.id,
        status: "ACTIVE",
        currentPeriodStart: new Date(),
        currentPeriodEnd: new Date("2099-12-31T23:59:59Z"),
      },
    })
    console.log("  ✔ Enterprise subscription created")
  } else {
    console.log("  ✔ Subscription already exists — skipped")
  }

  console.log("\nDone!")
  console.log("─────────────────────────────────────────────")
  console.log(`  Email    : ${SUPER_ADMIN.email}`)
  console.log(`  Password : ${SUPER_ADMIN.password}`)
  console.log("─────────────────────────────────────────────")
}

main()
  .catch((e) => { console.error("Seed failed:", e); process.exit(1) })
  .finally(() => prisma.$disconnect())
