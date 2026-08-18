import type { ReactNode } from "react"
import { Link } from "react-router-dom"
import { Lock, Sparkles } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { useSubscription } from "@/hooks/useSubscription"
import type { PlanLimits } from "@/lib/api"

/**
 * Plan gating for the dashboard UI.
 *
 * The backend already refuses these features via `requirePlanFeature`, but a 403
 * is a dead end: the user clicked something the UI offered, and got a red error
 * string. This mirrors the same rules on the client so a locked feature reads as
 * an upgrade path instead of a failure.
 *
 * This is presentation only — never authorisation. The server remains the sole
 * authority; anything here can be edited in devtools.
 */

/** The boolean flags on PlanLimits — the ones that gate a whole feature. */
export type GatedFeature = {
  [K in keyof PlanLimits]: PlanLimits[K] extends boolean ? K : never
}[keyof PlanLimits]

/**
 * The cheapest plan that includes each feature, for the upgrade copy.
 *
 * AUTHORITATIVE SOURCE: `PLAN_LIMITS` in backend/src/services/billing.service.ts.
 * That table decides access; this map only decides which plan name to show. If
 * you move a feature between plans there, update this too — otherwise the prompt
 * points at the wrong plan while the gate itself stays correct.
 */
const REQUIRED_PLAN: Record<GatedFeature, string> = {
  qrExpiry: "Starter",
  abTesting: "Pro",
  smartRouting: "Pro",
  bulkGeneration: "Pro",
  apiAccess: "Pro",
  customDomains: "Pro",
  whiteLabel: "Business",
  prioritySupport: "Business",
}

/**
 * Whether the current plan includes `feature`.
 *
 * FAILS OPEN, deliberately. `allowed` is true whenever we do not actually know the
 * plan — still loading, request failed, limits absent. Since the server enforces
 * the real gate, the worst case of guessing "allowed" is the 403 that used to
 * happen anyway; the worst case of guessing "locked" is telling a paying customer
 * their feature is unavailable because one request timed out. Only a loaded
 * subscription that explicitly lacks the flag locks the UI.
 */
export function usePlanFeature(feature: GatedFeature) {
  const { limits, planName, isLoading, isError } = useSubscription()
  const known = !isLoading && !isError && limits !== undefined
  return {
    allowed: known ? Boolean(limits[feature]) : true,
    /** True until we have a definite answer; page gates should wait on this. */
    isLoading: !known,
    planName,
    requiredPlan: REQUIRED_PLAN[feature],
  }
}

/** Small "Pro"/"Business" chip for a locked entry point. */
export function PlanChip({ plan }: { plan: string }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-violet-100 dark:bg-violet-500/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-violet-700 dark:text-violet-300">
      <Sparkles size={9} />
      {plan}
    </span>
  )
}

/**
 * Full-panel locked state, for when someone lands on a gated page directly —
 * a bookmark, a shared link, or a plan that changed under them.
 */
export function FeatureLocked({
  feature,
  title,
  description,
  children,
}: {
  feature: GatedFeature
  title: string
  description: string
  /** Optional extra context, e.g. what the feature does. */
  children?: ReactNode
}) {
  const { planName, requiredPlan } = usePlanFeature(feature)

  return (
    <Card>
      <CardContent className="py-10 text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-zinc-100 dark:bg-zinc-800">
          <Lock size={20} className="text-zinc-500 dark:text-zinc-400" />
        </div>
        <h2 className="mb-1.5 text-base font-semibold text-zinc-900 dark:text-white">{title}</h2>
        <p className="mx-auto mb-1 max-w-md text-sm text-zinc-500">{description}</p>
        <p className="mx-auto mb-6 max-w-md text-sm text-zinc-500">
          It is not included in your <span className="font-medium text-zinc-700 dark:text-zinc-300">{planName}</span> plan
          {" — available on "}
          <span className="font-medium text-zinc-700 dark:text-zinc-300">{requiredPlan}</span> and above.
        </p>
        {children}
        <Link to="/app/billing">
          <Button size="sm" className="gap-1.5">
            <Sparkles size={14} /> View plans
          </Button>
        </Link>
      </CardContent>
    </Card>
  )
}
