import type { Prisma, SubscriptionStatus } from "@prisma/client"

/**
 * What a subscription is actually doing — for the admin panel (decided 24 Oct 2026).
 *
 * The raw `status` column cannot say this: the app only ever writes ACTIVE and
 * TRIALING (CANCELLED, PAST_DUE and PAUSED are never set — cancelling is the
 * cancelAtPeriodEnd flag), and an expired plan becomes FREE with status
 * ACTIVE. So "status: ACTIVE" covered a paying customer, a lapsed one not yet
 * processed and every free account alike.
 *
 * Same rules as isLapsed (subscription-expiry.service): a trial ends at
 * trialEndsAt, anything else at currentPeriodEnd; an ended plan inside its
 * codesPauseAt notice is not lapsed yet.
 *
 *   trial       on a trial that has not ended              date: when it ends
 *   paid        paid plan in force                          date: period end
 *   cancelling  paid plan in force, cancelled at period end date: period end
 *   notice      ended, inside the one-time notice period    date: codesPauseAt
 *   ending      ended, waiting for the expiry job (≤ 10 min, or the user's next request)
 *   free        on the FREE plan                            date: lapsedAt
 *   other       a status the app never writes (defensive)
 *
 * subscriptionStateWhere must select exactly the rows subscriptionState puts
 * in each state — tests/integration/subscription-state.test.ts checks that.
 */

export const SUBSCRIPTION_STATES = ["trial", "paid", "cancelling", "notice", "ending", "free", "other"] as const
export type SubscriptionStateKey = (typeof SUBSCRIPTION_STATES)[number]

export interface SubscriptionState {
  key: SubscriptionStateKey
  /** The date that goes with the state (see the table above); null when there is none. */
  date: string | null
  /** For notice / ending: the time that ended was a trial, not a paid period. */
  wasTrial: boolean
}

export interface StateCheckable {
  status: SubscriptionStatus
  trialEndsAt: Date | null
  currentPeriodEnd: Date
  cancelAtPeriodEnd: boolean
  codesPauseAt: Date | null
  lapsedAt: Date | null
  plan: { name: string }
}

export function subscriptionState(sub: StateCheckable, now = new Date()): SubscriptionState {
  const iso = (d: Date | null) => (d ? d.toISOString() : null)
  if (sub.plan.name === "FREE") return { key: "free", date: iso(sub.lapsedAt), wasTrial: false }
  if (sub.status !== "ACTIVE" && sub.status !== "TRIALING") return { key: "other", date: null, wasTrial: false }

  const wasTrial = sub.status === "TRIALING"
  const end = wasTrial && sub.trialEndsAt ? sub.trialEndsAt : sub.currentPeriodEnd
  if (!(end < now)) {
    if (wasTrial) return { key: "trial", date: iso(end), wasTrial }
    return { key: sub.cancelAtPeriodEnd ? "cancelling" : "paid", date: iso(end), wasTrial }
  }
  if (sub.codesPauseAt && sub.codesPauseAt > now) return { key: "notice", date: iso(sub.codesPauseAt), wasTrial }
  return { key: "ending", date: iso(end), wasTrial }
}

/** Rows in `key`, for filtering lists in the database. */
export function subscriptionStateWhere(key: SubscriptionStateKey, now = new Date()): Prisma.SubscriptionWhereInput {
  const notFree: Prisma.SubscriptionWhereInput = { plan: { name: { not: "FREE" } } }
  const trialLive: Prisma.SubscriptionWhereInput = {
    status: "TRIALING",
    OR: [{ trialEndsAt: { gte: now } }, { trialEndsAt: null, currentPeriodEnd: { gte: now } }],
  }
  const ended: Prisma.SubscriptionWhereInput = {
    OR: [
      { status: "TRIALING", trialEndsAt: { lt: now } },
      { status: "TRIALING", trialEndsAt: null, currentPeriodEnd: { lt: now } },
      { status: "ACTIVE", currentPeriodEnd: { lt: now } },
    ],
  }
  switch (key) {
    case "free":
      return { plan: { name: "FREE" } }
    case "trial":
      return { AND: [notFree, trialLive] }
    case "paid":
      return { AND: [notFree, { status: "ACTIVE", currentPeriodEnd: { gte: now }, cancelAtPeriodEnd: false }] }
    case "cancelling":
      return { AND: [notFree, { status: "ACTIVE", currentPeriodEnd: { gte: now }, cancelAtPeriodEnd: true }] }
    case "notice":
      return { AND: [notFree, ended, { codesPauseAt: { gt: now } }] }
    case "ending":
      return { AND: [notFree, ended, { OR: [{ codesPauseAt: null }, { codesPauseAt: { lte: now } }] }] }
    case "other":
      return { AND: [notFree, { status: { notIn: ["ACTIVE", "TRIALING"] } }] }
  }
}

/** The fields subscriptionState needs, for Prisma selects. */
export const STATE_FIELDS = {
  status: true, trialEndsAt: true, currentPeriodEnd: true, cancelAtPeriodEnd: true,
  codesPauseAt: true, lapsedAt: true, plan: { select: { name: true } },
} as const
