/**
 * Referral programme (decided 21 Oct 2026).
 *
 *   - Each user has a code; a NEW account created through `?ref=CODE` records
 *     who referred it (attachReferralAtSignup). One referrer per account, and
 *     a referrer can refer as many people as they like but each PERSON once:
 *     a second account on the same inbox (alias, or deleted and recreated)
 *     is not recorded again (unique referrerId + refereeEmailHash).
 *   - The referee's FIRST paid purchase qualifies the referral: the referee and
 *     the referrer each get REFERRAL_REWARD_PERCENT of what was ACTUALLY paid
 *     (after coupons and credit — a ₹0 purchase earns nothing) as GenXQR credit.
 *   - Rewards are usable REFERRAL_HOLD_DAYS after the purchase: longer than the
 *     7-day refund window plus time to process a refund asked for on day 7. If
 *     the purchase is refunded, an admin cancels the referral, voiding both.
 *   - Credit is spent automatically at checkout and may cover a whole payment.
 *
 * Credit is a ledger (CreditEntry), never a stored balance: the balance is the
 * sum of unvoided entries already available. Nothing here pays cash out — bank
 * payouts would need Cashfree Payouts and TDS handling, and are not built.
 */
import { createHash, randomInt } from "node:crypto"
import { Prisma, type CreditKind } from "@prisma/client"
import { prisma } from "../db/prisma.js"
import { AppError } from "../middleware/error.middleware.js"
import { logger } from "../logger/index.js"
import { normalizeEmail } from "../utils/normalize-email.util.js"

export const REFERRAL_REWARD_PERCENT = 20
export const REFERRAL_HOLD_DAYS = 15

type Tx = Prisma.TransactionClient

/**
 * Identifies the referee as a person rather than an address: the normalised
 * inbox (user+2@gmail.com and u.ser@gmail.com are user@gmail.com), hashed so
 * the row can outlive the account without keeping the address itself.
 */
export function refereeEmailHash(email: string): string {
  const key = normalizeEmail(email) ?? email.trim().toLowerCase()
  return createHash("sha256").update(key).digest("hex")
}

// ─── Codes ────────────────────────────────────────────────────────────────────

/** No 0/O, 1/I/L: codes get read out loud and typed from screenshots. */
const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"
const CODE_LENGTH = 8

function generateCode(): string {
  let code = ""
  for (let i = 0; i < CODE_LENGTH; i++) code += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]
  return code
}

export function normaliseReferralCode(code: string): string {
  return code.trim().toUpperCase()
}

/** The user's code, created on first request. */
export async function getOrCreateReferralCode(userId: string): Promise<string> {
  const existing = await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { referralCode: true } })
  if (existing.referralCode) return existing.referralCode
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      // Only fills an EMPTY code, so two concurrent first visits cannot
      // replace each other's: the second matches no row and re-reads.
      const filled = await prisma.user.updateMany({
        where: { id: userId, referralCode: null },
        data: { referralCode: generateCode() },
      })
      const now = await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { referralCode: true } })
      if (now.referralCode) return now.referralCode
      if (filled.count === 0) continue
    } catch (err) {
      // P2002: the generated code is someone else's; try another.
      if ((err as { code?: string }).code !== "P2002") throw err
    }
  }
  throw new AppError(500, "Could not create a referral code. Please try again.")
}

/**
 * Records that a brand-new account was referred. Called right after the
 * account is created (email sign-up or first Google sign-in). Never throws: a
 * bad code must not break sign-up, it just records nothing.
 */
export async function attachReferralAtSignup(refereeId: string, rawCode: unknown): Promise<void> {
  if (typeof rawCode !== "string") return
  const code = normaliseReferralCode(rawCode)
  if (!code || code.length > 20) return
  try {
    const [referrer, referee] = await Promise.all([
      prisma.user.findUnique({ where: { referralCode: code }, select: { id: true, email: true, normalizedEmail: true } }),
      prisma.user.findUniqueOrThrow({ where: { id: refereeId }, select: { id: true, email: true, normalizedEmail: true } }),
    ])
    if (!referrer || referrer.id === referee.id) return
    // Same inbox under another alias (user+2@gmail.com, u.ser@gmail.com) is
    // the same person — the same rule that stops repeat free trials.
    const a = referrer.normalizedEmail ?? normalizeEmail(referrer.email)
    const b = referee.normalizedEmail ?? normalizeEmail(referee.email)
    if (a && b && a === b) {
      logger.info("Self-referral refused", { refereeId })
      return
    }
    // The unique (referrerId, refereeEmailHash) refuses a second account of a
    // person this referrer already referred — including at the same instant.
    await prisma.referral.create({
      data: { referrerId: referrer.id, refereeId: referee.id, refereeEmailHash: refereeEmailHash(referee.email) },
    })
  } catch (err) {
    // P2002: this account, or this person, was already referred. Anything
    // else: log, never fail sign-up.
    if ((err as { code?: string }).code !== "P2002") {
      logger.warn("Could not record referral at sign-up", { refereeId, error: String(err) })
    }
  }
}

// ─── Balance ──────────────────────────────────────────────────────────────────

export interface CreditBalance {
  /** Spendable now, in paise. Can be negative after a cancelled, already-spent reward. */
  availablePaise: number
  /** Earned but still in the hold, in paise. */
  pendingPaise: number
  /** When the next held reward becomes usable, if any. */
  nextAvailableAt: Date | null
}

export async function getCreditBalance(userId: string, db: Tx | typeof prisma = prisma, now = new Date()): Promise<CreditBalance> {
  const [available, pending, next] = await Promise.all([
    db.creditEntry.aggregate({
      where: { userId, voidedAt: null, availableAt: { lte: now } },
      _sum: { amountPaise: true },
    }),
    db.creditEntry.aggregate({
      where: { userId, voidedAt: null, availableAt: { gt: now } },
      _sum: { amountPaise: true },
    }),
    db.creditEntry.findFirst({
      where: { userId, voidedAt: null, availableAt: { gt: now } },
      orderBy: { availableAt: "asc" },
      select: { availableAt: true },
    }),
  ])
  return {
    availablePaise: available._sum.amountPaise ?? 0,
    pendingPaise: pending._sum.amountPaise ?? 0,
    nextAvailableAt: next?.availableAt ?? null,
  }
}

/**
 * Serialises credit spending for one user inside a transaction, so two
 * checkouts cannot both spend the same balance. Released at commit/rollback.
 */
export async function lockCredit(tx: Tx, userId: string): Promise<void> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`credit:${userId}`}))`
}

/** Records credit spent on an order. Unique per order, so a replay spends nothing extra. */
export async function recordCreditSpend(tx: Tx, userId: string, orderId: string, amountPaise: number): Promise<void> {
  if (amountPaise <= 0) return
  await tx.creditEntry.create({
    data: { userId, amountPaise: -amountPaise, kind: "REDEMPTION" satisfies CreditKind, orderId },
  })
}

// ─── Qualification ────────────────────────────────────────────────────────────

/**
 * Called inside the purchase transaction (billing.service applyPurchasedPeriod)
 * after the invoice is written. If this is the buyer's FIRST paid purchase and
 * they were referred, the referral qualifies and both rewards are created,
 * held until `REFERRAL_HOLD_DAYS` from now.
 */
export async function qualifyReferralInTx(
  tx: Tx,
  params: { userId: string; orderId: string; amountPaise: number; now: Date },
): Promise<void> {
  if (params.amountPaise <= 0) return // a free purchase earns nothing

  const referral = await tx.referral.findUnique({
    where: { refereeId: params.userId },
    select: { id: true, referrerId: true, qualifyingOrderId: true, cancelledAt: true },
  })
  if (!referral || referral.qualifyingOrderId || referral.cancelledAt) return

  // FIRST paid purchase only. The current invoice already exists in this
  // transaction, so it is excluded by its order id.
  const earlierPaid = await tx.invoice.count({
    where: { userId: params.userId, amount: { gt: 0 }, NOT: { cashfreeOrderId: params.orderId } },
  })
  if (earlierPaid > 0) return

  const rewardPaise = Math.floor((params.amountPaise * REFERRAL_REWARD_PERCENT) / 100)
  if (rewardPaise <= 0) return
  const availableAt = new Date(params.now.getTime() + REFERRAL_HOLD_DAYS * 24 * 60 * 60 * 1000)

  await tx.referral.update({
    where: { id: referral.id },
    data: {
      qualifyingOrderId: params.orderId,
      qualifyingAmountPaise: params.amountPaise,
      rewardPaise,
      qualifiedAt: params.now,
      availableAt,
    },
  })
  await tx.creditEntry.createMany({
    data: [
      { userId: referral.referrerId, amountPaise: rewardPaise, kind: "REFERRAL_REWARD", availableAt, referralId: referral.id, note: "Friend's first purchase" },
      { userId: params.userId, amountPaise: rewardPaise, kind: "REFERRAL_REWARD", availableAt, referralId: referral.id, note: "Your first purchase (referred)" },
    ],
  })
  logger.info("Referral qualified", { referralId: referral.id, orderId: params.orderId, rewardPaise })
}

// ─── What users see ───────────────────────────────────────────────────────────

/** "a••••@gmail.com" — enough for the referrer to recognise a friend, not to harvest addresses. */
function maskEmail(email: string): string {
  const [local = "", domain = ""] = email.split("@")
  return `${local.slice(0, 1)}${"•".repeat(Math.max(1, Math.min(local.length - 1, 4)))}@${domain}`
}

export type ReferralStatus = "signed_up" | "pending" | "credited" | "cancelled"

function statusOf(r: { qualifiedAt: Date | null; availableAt: Date | null; cancelledAt: Date | null }, now: Date): ReferralStatus {
  if (r.cancelledAt) return "cancelled"
  if (!r.qualifiedAt) return "signed_up"
  return r.availableAt && r.availableAt <= now ? "credited" : "pending"
}

export async function getReferralSummary(userId: string) {
  const now = new Date()
  const [code, balance, referrals, entries, referredBy] = await Promise.all([
    getOrCreateReferralCode(userId),
    getCreditBalance(userId, prisma, now),
    prisma.referral.findMany({
      where: { referrerId: userId },
      orderBy: { createdAt: "desc" },
      take: 100,
      select: {
        id: true, createdAt: true, qualifiedAt: true, availableAt: true, cancelledAt: true, rewardPaise: true,
        referee: { select: { email: true } },
      },
    }),
    prisma.creditEntry.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: 50,
      select: { id: true, amountPaise: true, kind: true, availableAt: true, voidedAt: true, note: true, createdAt: true },
    }),
    prisma.referral.findUnique({
      where: { refereeId: userId },
      select: { qualifiedAt: true, availableAt: true, cancelledAt: true, rewardPaise: true },
    }),
  ])

  return {
    code,
    rewardPercent: REFERRAL_REWARD_PERCENT,
    holdDays: REFERRAL_HOLD_DAYS,
    balance,
    referrals: referrals.map((r) => ({
      id: r.id,
      friend: r.referee ? maskEmail(r.referee.email) : "Deleted account",
      joinedAt: r.createdAt,
      status: statusOf(r, now),
      rewardPaise: r.rewardPaise,
      availableAt: r.availableAt,
    })),
    /** Set when this user signed up through someone else's link. */
    referredBy: referredBy ? { status: statusOf(referredBy, now), rewardPaise: referredBy.rewardPaise, availableAt: referredBy.availableAt } : null,
    history: entries,
  }
}

// ─── Admin ────────────────────────────────────────────────────────────────────

export async function listReferralsForAdmin(params: { status?: ReferralStatus; limit?: number } = {}) {
  const now = new Date()
  const rows = await prisma.referral.findMany({
    orderBy: { createdAt: "desc" },
    take: Math.min(params.limit ?? 100, 500),
    select: {
      id: true, createdAt: true, qualifyingOrderId: true, qualifyingAmountPaise: true, rewardPaise: true,
      qualifiedAt: true, availableAt: true, cancelledAt: true, cancelReason: true,
      referrer: { select: { id: true, email: true, name: true } },
      referee: { select: { id: true, email: true, name: true } },
    },
  })
  return rows
    .map((r) => ({ ...r, status: statusOf(r, now) }))
    .filter((r) => !params.status || r.status === params.status)
}

/**
 * Cancels a referral and voids both rewards — for a refunded qualifying
 * purchase, or abuse. Credit already spent is not taken back from the
 * purchase it paid for; the balance goes negative and future credit covers it.
 */
export async function cancelReferral(referralId: string, reason: string): Promise<void> {
  const now = new Date()
  await prisma.$transaction(async (tx) => {
    const referral = await tx.referral.findUnique({ where: { id: referralId }, select: { cancelledAt: true } })
    if (!referral) throw new AppError(404, "Referral not found")
    if (referral.cancelledAt) throw new AppError(409, "This referral is already cancelled")
    await tx.referral.update({ where: { id: referralId }, data: { cancelledAt: now, cancelReason: reason } })
    await tx.creditEntry.updateMany({ where: { referralId, voidedAt: null }, data: { voidedAt: now } })
  })
  logger.info("Referral cancelled", { referralId, reason })
}
