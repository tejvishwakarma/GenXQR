import { useState, useCallback, useEffect, useRef } from "react"
import { useSearchParams } from "react-router-dom"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import {
  Check, Zap, Download, ArrowRight, Loader2,
  AlertTriangle, ChevronDown, ChevronUp, Crown, Rocket, Building2,
  CheckCircle, XCircle, FileText,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  getSubscription, getBillingUsage, getPlans, getInvoices, downloadInvoice,
  createPaymentOrder, verifyPayment, cancelSubscription, downgradeSubscription,
  validateCoupon, type CouponQuote,
  getCurrentUser,
  type Plan, type PlanName, type CheckoutSession, type Invoice,
} from "@/lib/api"

// ─── Helpers ──────────────────────────────────────────────────────────────────

function paiseToRupees(paise: number) {
  return `₹${(paise / 100).toLocaleString("en-IN")}`
}

/**
 * Money for the checkout summary, always to two decimals.
 *
 * paiseToRupees drops trailing zeros, which is right for a plan card ("₹799/mo")
 * but wrong in a totals column: ₹799 above −₹791.01 above ₹7.99 reads as a
 * rounding glitch when it is exactly correct.
 */
function paiseToRupeesExact(paise: number) {
  return `₹${(paise / 100).toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })
}

function daysLeft(iso: string) {
  const diff = Math.ceil((new Date(iso).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
  return Math.max(0, diff)
}

function getInvoiceNumber(invoice: Invoice): string {
  const d = new Date(invoice.createdAt)
  const year = d.getFullYear()
  const month = String(d.getMonth() + 1).padStart(2, "0")
  const suffix = invoice.id.slice(-6).toUpperCase()
  return `INV-${year}${month}-${suffix}`
}

const PLAN_ICON: Record<PlanName, React.ReactNode> = {
  FREE:       <Zap size={20} className="text-zinc-400" />,
  STARTER:    <Zap size={20} className="text-violet-400" />,
  PRO:        <Rocket size={20} className="text-violet-400" />,
  BUSINESS:   <Crown size={20} className="text-amber-400" />,
  ENTERPRISE: <Building2 size={20} className="text-emerald-400" />,
}

const PLAN_COLOR: Record<PlanName, string> = {
  FREE:       "bg-zinc-500/20 border-zinc-500/30",
  STARTER:    "bg-violet-500/20 border-violet-500/30",
  PRO:        "bg-violet-500/20 border-violet-500/30",
  BUSINESS:   "bg-amber-500/20 border-amber-500/30",
  ENTERPRISE: "bg-emerald-500/20 border-emerald-500/30",
}

// ─── Cashfree checkout ────────────────────────────────────────────────────────
//
// Flow:
//   1. Backend prices the plan and creates a Cashfree order, returning a
//      payment_session_id (the amount is never sent from here)
//   2. We hand that session id to the Cashfree JS SDK, which navigates the tab
//      to Cashfree's hosted checkout
//   3. Cashfree returns the browser to /app/billing?cf_order_id=... and we ask
//      the backend to verify that order
//
// The npm package is a LOADER, not a self-contained bundle: at runtime it
// injects https://sdk.cashfree.com/js/v3/cashfree.js. Installing from npm
// therefore does not avoid the external script — the CSP must allow
// sdk.cashfree.com in script-src and connect-src either way (see
// deploy/cloudpanel-vhost-nodejs.conf). npm is still preferred over a hand-written
// <script> tag for the pinned version and the typed entry point.
//
// `redirectTarget: "_self"` navigates the whole tab instead of opening a modal.
// That survives popup blockers and in-app browsers, and matches the redirect UX
// the app already had.

async function launchCashfreeCheckout(session: CheckoutSession): Promise<void> {
  // Imported lazily so the SDK is not in the initial bundle for the many page
  // loads that never reach checkout.
  const { load } = await import("@cashfreepayments/cashfree-js")
  const cashfree = await load({ mode: session.mode })
  if (!cashfree) throw new Error("Could not load the payment gateway. Please refresh and try again.")

  await cashfree.checkout({
    paymentSessionId: session.paymentSessionId,
    redirectTarget: "_self",
  })
}

// ─── PlanCard ─────────────────────────────────────────────────────────────────

interface PlanCardProps {
  plan: Plan
  currentPlanName: PlanName
  onSubscribe: (planName: PlanName, cycle: "monthly" | "yearly") => void
  isLoading: boolean
}

function PlanCard({ plan, currentPlanName, onSubscribe, isLoading }: PlanCardProps) {
  const [cycle, setCycle] = useState<"monthly" | "yearly">("monthly")
  const isCurrent = plan.name === currentPlanName
  const planOrder: PlanName[] = ["FREE", "STARTER", "PRO", "BUSINESS", "ENTERPRISE"]
  const isDowngrade = planOrder.indexOf(plan.name) < planOrder.indexOf(currentPlanName)

  const limits = plan.limits
  const features: Array<{ label: string; enabled: boolean }> = [
    { label: `${plan.dynamicQRLimit >= 999999 ? "Unlimited" : plan.dynamicQRLimit} dynamic QR codes`, enabled: true },
    { label: `${plan.scanLimit >= 999999999 ? "Unlimited" : plan.scanLimit.toLocaleString()} scans/month`, enabled: true },
    { label: `${plan.fileStorageGB}GB file storage`, enabled: plan.fileStorageGB > 0 },
    { label: "Advanced analytics", enabled: (limits?.analyticsRetentionDays ?? 0) >= 90 },
    { label: "A/B testing", enabled: limits?.abTesting ?? false },
    { label: "Smart routing", enabled: limits?.smartRouting ?? false },
    { label: "Bulk generation", enabled: limits?.bulkGeneration ?? false },
    { label: "API access", enabled: limits?.apiAccess ?? false },
    { label: "Custom domains", enabled: limits?.customDomains ?? false },
    { label: `${plan.teamSeatsLimit} team seat${plan.teamSeatsLimit !== 1 ? "s" : ""}`, enabled: plan.teamSeatsLimit > 1 },
    { label: "White-label", enabled: limits?.whiteLabel ?? false },
    { label: "Priority support", enabled: limits?.prioritySupport ?? false },
  ]

  return (
    <Card className={`p-5 flex flex-col gap-4 relative h-full min-h-[560px] ${isCurrent ? "ring-2 ring-violet-500" : ""}`}>
      {isCurrent && (
        <div className="absolute -top-3 left-1/2 -translate-x-1/2">
          <Badge variant="default" className="bg-violet-600 text-white text-xs px-3">Current Plan</Badge>
        </div>
      )}

      <div className="flex items-center gap-3">
        <div className={`w-10 h-10 rounded-xl border flex items-center justify-center ${PLAN_COLOR[plan.name as PlanName]}`}>
          {PLAN_ICON[plan.name as PlanName]}
        </div>
        <div>
          <div className="font-bold text-zinc-900 dark:text-white">{plan.displayName}</div>
          {plan.name !== "FREE" && plan.name !== "ENTERPRISE" && (
            <div className="text-zinc-600 dark:text-zinc-400 text-sm">
              {cycle === "monthly"
                ? `₹${plan.priceMonthlyINR}/mo`
                : `₹${Math.round(plan.priceYearlyINR / 12)}/mo · billed yearly`}
            </div>
          )}
          {plan.name === "FREE" && <div className="text-zinc-600 dark:text-zinc-400 text-sm">Free forever</div>}
          {plan.name === "ENTERPRISE" && <div className="text-zinc-600 dark:text-zinc-400 text-sm">Custom pricing</div>}
        </div>
      </div>

      {plan.name !== "FREE" && plan.name !== "ENTERPRISE" && (
        <div className="flex rounded-lg bg-zinc-100 dark:bg-zinc-800 p-1 gap-1 text-xs font-medium">
          <button
            type="button"
            onClick={() => setCycle("monthly")}
            className={`flex-1 rounded py-1.5 transition-all ${cycle === "monthly" ? "bg-white dark:bg-zinc-500 text-zinc-900 dark:text-white shadow-sm" : "text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white"}`}
          >
            Monthly
          </button>
          <button
            type="button"
            onClick={() => setCycle("yearly")}
            className={`flex-1 rounded py-1.5 transition-all ${cycle === "yearly" ? "bg-violet-600 text-white shadow-sm" : "text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white"}`}
          >
            Yearly <span className={cycle === "yearly" ? "text-emerald-300" : "text-emerald-500 dark:text-emerald-400"}>−17%</span>
          </button>
        </div>
      )}

      <div className="space-y-1.5 flex-1">
        {features.map((f) => (
          <div key={f.label} className={`flex items-center gap-2 text-xs ${f.enabled ? "text-zinc-700 dark:text-zinc-300" : "text-zinc-400 dark:text-zinc-600 line-through"}`}>
            <Check size={11} className={f.enabled ? "text-emerald-400 shrink-0" : "text-zinc-600 shrink-0"} />
            {f.label}
          </div>
        ))}
      </div>

      {plan.name === "FREE" && !isCurrent && (
        <Button variant="secondary" size="sm" disabled>Downgrade</Button>
      )}
      {plan.name === "ENTERPRISE" && (
        <a href="mailto:support@genxqr.com">
          <Button variant="outline" size="sm" className="w-full">Contact Sales</Button>
        </a>
      )}
      {plan.name !== "FREE" && plan.name !== "ENTERPRISE" && (
        <Button
          variant={isCurrent ? "secondary" : "glow"}
          size="sm"
          disabled={isCurrent || isLoading}
          onClick={() => !isCurrent && onSubscribe(plan.name as PlanName, cycle)}
          className="w-full"
        >
          {isLoading
            ? <Loader2 size={14} className="animate-spin" />
            : isCurrent
              ? "Current Plan"
              : isDowngrade
                ? "Downgrade"
                : <><ArrowRight size={14} /> Upgrade</>
          }
        </Button>
      )}
    </Card>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function BillingPage() {
  const qc = useQueryClient()
  const [searchParams, setSearchParams] = useSearchParams()
  const plansRef = useRef<HTMLDivElement>(null)
  const [checkoutLoading, setCheckoutLoading]   = useState(false)
  const [checkoutError, setCheckoutError]       = useState("")
  const [showInvoices, setShowInvoices]         = useState(false)
  const [downloadingId, setDownloadingId]       = useState<string | null>(null)
  const [invoicePage, setInvoicePage]           = useState(0)
  const INVOICES_PER_PAGE = 10

  // Set by the verification effect below, or carried in the URL on failure.
  const paymentResult = searchParams.get("payment")  // "success" | "failure" | null

  // Cashfree returns the browser here with our order id. It proves nothing on
  // its own, so it is handed straight to the backend, which re-reads the order
  // from Cashfree before activating anything.
  const returnedOrderId = searchParams.get("cf_order_id")
  const [verifying, setVerifying] = useState(false)
  // React 18 Strict Mode mounts effects twice in dev; without this guard the
  // order is verified twice on every return trip.
  const verifiedOrderRef = useRef<string | null>(null)

  useEffect(() => {
    if (!returnedOrderId || verifiedOrderRef.current === returnedOrderId) return
    verifiedOrderRef.current = returnedOrderId

    let cancelled = false
    setVerifying(true)

    void (async () => {
      let outcome: "success" | "failure" = "failure"
      try {
        const res = await verifyPayment(returnedOrderId)
        // "already_processed" means the webhook got there first — still a success.
        if (res.status === "activated" || res.status === "already_processed") outcome = "success"
      } catch {
        // Network or server error. The webhook is the authoritative path and will
        // still activate the plan, so this is reported as a failure of *this
        // check*, not necessarily of the payment.
        outcome = "failure"
      }

      if (cancelled) return
      setVerifying(false)
      setSearchParams((prev) => {
        prev.delete("cf_order_id")
        prev.set("payment", outcome)
        return prev
      }, { replace: true })
    })()

    return () => { cancelled = true }
  }, [returnedOrderId, setSearchParams])

  // Clear the payment param from URL after showing the banner (after 5s)
  useEffect(() => {
    if (!paymentResult) return
    // Invalidate subscription data so the plan badge updates immediately on success
    if (paymentResult === "success") {
      void qc.invalidateQueries({ queryKey: ["subscription"] })
      void qc.invalidateQueries({ queryKey: ["billing-usage"] })
      void qc.invalidateQueries({ queryKey: ["invoices"] })
      // Auto-open invoices section so user can see and download their new invoice
      setShowInvoices(true)
    }
    const timer = setTimeout(() => {
      setSearchParams((prev) => {
        prev.delete("payment")
        prev.delete("reason")
        return prev
      }, { replace: true })
    }, 6000)
    return () => clearTimeout(timer)
  }, [paymentResult, qc, setSearchParams])

  useEffect(() => {
    if (searchParams.get("upgrade") && plansRef.current) {
      const timer = setTimeout(() => plansRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 400)
      return () => clearTimeout(timer)
    }
  }, [searchParams])

  // Cashfree requires a 10-digit mobile on every order. It is asked for once and
  // stored, so this only appears for customers who have never paid before.
  const { data: meData } = useQuery({
    queryKey: ["current-user"],
    queryFn: getCurrentUser,
    staleTime: 5 * 60 * 1000,
  })
  const storedPhone = meData?.data?.phone ?? null

  const [phoneInput, setPhoneInput] = useState("")
  const [phoneError, setPhoneError] = useState("")
  /**
   * The purchase awaiting confirmation. Every paid upgrade goes through this
   * step rather than jumping straight to the gateway: a coupon can only be
   * priced against a specific plan and cycle, and sending someone to pay without
   * showing the final total is poor form.
   */
  const [pendingPurchase, setPendingPurchase] = useState<
    { planName: PlanName; cycle: "monthly" | "yearly"; listPaise: number } | null
  >(null)

  const [couponInput, setCouponInput] = useState("")
  const [couponError, setCouponError] = useState("")
  const [couponChecking, setCouponChecking] = useState(false)
  /** The server's quote once a code is accepted. Null means no discount applied. */
  const [appliedCoupon, setAppliedCoupon] = useState<CouponQuote | null>(null)

  const { data: subData, isLoading: subLoading } = useQuery({
    queryKey: ["subscription"],
    queryFn: getSubscription,
  })

  const { data: usageData } = useQuery({
    queryKey: ["billing-usage"],
    queryFn: getBillingUsage,
  })

  const { data: plansData } = useQuery({
    queryKey: ["plans"],
    queryFn: getPlans,
    staleTime: 10 * 60 * 1000,
  })

  const { data: invoicesData } = useQuery({
    queryKey: ["invoices", invoicePage],
    queryFn: getInvoices,
    enabled: showInvoices,
    staleTime: 30_000,
  })

  const cancelMut = useMutation({
    mutationFn: cancelSubscription,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["subscription"] })
    },
  })

  const sub      = subData?.data
  const usage    = usageData?.data
  const plans    = plansData?.data ?? []
  const invoices = invoicesData?.data ?? []

  /**
   * Starts a Cashfree checkout. The backend prices the plan and creates the
   * order; the SDK then navigates this tab to Cashfree's hosted payment page.
   * On return, the effect above verifies the order server-side.
   */
  // No phone parameter any more: the number is collected in the confirmation
  // step below, alongside the coupon, rather than in a prompt of its own.
  const handleSubscribe = useCallback(async (
    planName: PlanName,
    cycle: "monthly" | "yearly",
  ) => {
    setCheckoutError("")
    setCheckoutLoading(true)
    try {
      const planOrder: PlanName[] = ["FREE", "STARTER", "PRO", "BUSINESS", "ENTERPRISE"]
      const currentPlan = subData?.data?.planName ?? "FREE"
      const isDowngrade = planOrder.indexOf(planName) < planOrder.indexOf(currentPlan)

      if (isDowngrade) {
        if (!window.confirm(`Are you sure you want to downgrade to ${planName}?`)) {
          setCheckoutLoading(false)
          return
        }
        await downgradeSubscription(planName)
        void qc.invalidateQueries({ queryKey: ["subscription"] })
        void qc.invalidateQueries({ queryKey: ["billing-usage"] })
        setCheckoutLoading(false)
        return
      }

      // Open the confirmation step. Nothing is charged here — the order is only
      // created once the customer confirms, after any coupon has been priced.
      const listPaise = (plans.find((p) => p.name === planName)
        ? (cycle === "yearly"
            ? plans.find((p) => p.name === planName)!.priceYearlyINR
            : plans.find((p) => p.name === planName)!.priceMonthlyINR)
        : 0) * 100

      setCouponInput("")
      setCouponError("")
      setAppliedCoupon(null)
      setPhoneInput("")
      setPhoneError("")
      setPendingPurchase({ planName, cycle, listPaise })
      setCheckoutLoading(false)
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to process request"
      setCheckoutError(msg)
      setCheckoutLoading(false)
    }
  }, [subData?.data?.planName, qc, plans])

  /** Prices the entered code against the plan being bought. */
  const handleApplyCoupon = useCallback(async () => {
    if (!pendingPurchase) return
    const code = couponInput.trim()
    if (!code) {
      setCouponError("Enter a coupon code.")
      return
    }
    setCouponChecking(true)
    setCouponError("")
    try {
      const res = await validateCoupon({
        code,
        planName: pendingPurchase.planName,
        billingCycle: pendingPurchase.cycle,
      })
      if (res.success && res.data) {
        setAppliedCoupon(res.data)
      } else {
        setAppliedCoupon(null)
        // The server explains why — expired, already used, wrong plan.
        setCouponError(res.error ?? "That coupon code is not valid.")
      }
    } catch (err) {
      setAppliedCoupon(null)
      setCouponError(err instanceof Error ? err.message : "Could not check that code.")
    } finally {
      setCouponChecking(false)
    }
  }, [couponInput, pendingPurchase])

  /** Creates the order and hands off to Cashfree. */
  const handleConfirmPurchase = useCallback(async () => {
    if (!pendingPurchase) return

    // A number is required on every order. Use the stored one, or validate what
    // was just typed — mirroring the server rule so nobody meets a raw 422.
    let phone = storedPhone
    if (!phone) {
      const digits = phoneInput.replace(/\D/g, "").replace(/^91(?=\d{10}$)/, "").replace(/^0(?=\d{10}$)/, "")
      if (!/^[6-9]\d{9}$/.test(digits)) {
        setPhoneError("Enter a valid 10-digit Indian mobile number.")
        return
      }
      setPhoneError("")
      phone = digits
    }

    setCheckoutError("")
    setCheckoutLoading(true)
    try {
      const orderRes = await createPaymentOrder(
        pendingPurchase.planName,
        pendingPurchase.cycle,
        phone,
        // Only the code is sent; the server prices it again and is the authority
        // on what is charged.
        appliedCoupon?.code,
      )
      setPendingPurchase(null)
      await launchCashfreeCheckout(orderRes.data)
      // The tab navigates to Cashfree — loading stays true until unload.
    } catch (err) {
      setCheckoutError(err instanceof Error ? err.message : "Failed to start payment")
      setCheckoutLoading(false)
    }
  }, [pendingPurchase, storedPhone, phoneInput, appliedCoupon])

  const handleCancel = useCallback(() => {
    if (!window.confirm("Cancel your subscription? You'll keep access until the end of the current period.")) return
    cancelMut.mutate()
  }, [cancelMut])

  const handleDownloadInvoice = useCallback(async (invoice: Invoice) => {
    setDownloadingId(invoice.id)
    try {
      await downloadInvoice(invoice.id, getInvoiceNumber(invoice))
    } catch (err) {
      // The server explains *why* — notably that a failed PDF render leaves the
      // payment and subscription untouched. Discarding that and saying "please
      // try again" tells a paying customer to retry something that will not
      // succeed, and leaves them unsure whether their money went through.
      const message = err instanceof Error && err.message
        ? err.message
        : "Failed to download invoice. Please try again."
      alert(message)
    } finally {
      setDownloadingId(null)
    }
  }, [])

  if (subLoading) {
    return (
      <div className="flex items-center justify-center py-32 text-zinc-500">
        <Loader2 size={24} className="animate-spin mr-2" /> Loading billing info…
      </div>
    )
  }

  const currentPlanName = sub?.planName ?? "FREE"
  const subscription    = sub?.subscription

  return (
    <div className="space-y-8 animate-fade-in w-full max-w-none">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold text-zinc-900 dark:text-white">Billing &amp; Subscription</h1>
        <p className="text-zinc-500 text-sm mt-1">Manage your plan and payment details</p>
      </div>

      {/* Checkout confirmation — the last stop before the gateway. Shows the real
          total, takes a coupon, and collects a mobile number if none is stored.
          The figures here come from the server (validate-coupon), never from
          arithmetic done in the browser. */}
      {pendingPurchase && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="checkout-title"
        >
          <Card className="w-full max-w-md p-6 max-h-[90vh] overflow-y-auto">
            <h2 id="checkout-title" className="text-lg font-bold text-zinc-900 dark:text-white mb-1">
              Confirm your upgrade
            </h2>
            <p className="text-sm text-zinc-600 dark:text-zinc-400 mb-4">
              {pendingPurchase.planName} plan, billed {pendingPurchase.cycle}.
            </p>

            {/* Coupon */}
            <label htmlFor="coupon-code" className="text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1.5 block">
              Coupon code <span className="text-zinc-500 font-normal">(optional)</span>
            </label>
            <div className="flex items-stretch gap-2">
              <input
                id="coupon-code"
                type="text"
                autoCapitalize="characters"
                value={couponInput}
                disabled={!!appliedCoupon}
                onChange={(e) => { setCouponInput(e.target.value.toUpperCase()); setCouponError("") }}
                onKeyDown={(e) => { if (e.key === "Enter") void handleApplyCoupon() }}
                placeholder="SAVE20"
                className="flex-1 rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-4 py-2.5 text-sm text-zinc-900 dark:text-white placeholder:text-zinc-400 disabled:opacity-60 focus:outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500/50"
              />
              {appliedCoupon ? (
                <Button
                  variant="ghost"
                  onClick={() => { setAppliedCoupon(null); setCouponInput(""); setCouponError("") }}
                >
                  Remove
                </Button>
              ) : (
                <Button variant="secondary" onClick={() => void handleApplyCoupon()} disabled={couponChecking}>
                  {couponChecking ? "Checking…" : "Apply"}
                </Button>
              )}
            </div>
            {couponError && <p className="text-red-500 text-xs mt-2">{couponError}</p>}
            {appliedCoupon && (
              <p className="text-emerald-500 text-xs mt-2">
                {appliedCoupon.code} applied
              </p>
            )}

            {/* Totals — all server-provided */}
            <div className="mt-5 rounded-xl border border-zinc-200 dark:border-zinc-700 p-4 space-y-2 text-sm">
              <div className="flex justify-between text-zinc-600 dark:text-zinc-400">
                <span>Subtotal</span>
                <span>{paiseToRupeesExact(appliedCoupon?.originalPaise ?? pendingPurchase.listPaise)}</span>
              </div>
              {appliedCoupon && (
                <div className="flex justify-between text-emerald-500">
                  <span>Discount</span>
                  <span>−{paiseToRupeesExact(appliedCoupon.discountPaise)}</span>
                </div>
              )}
              <div className="flex justify-between pt-2 border-t border-zinc-200 dark:border-zinc-700 font-bold text-zinc-900 dark:text-white">
                <span>Total due today</span>
                <span>{paiseToRupeesExact(appliedCoupon?.finalPaise ?? pendingPurchase.listPaise)}</span>
              </div>
              {appliedCoupon && (
                <p className="text-zinc-500 text-xs pt-1">
                  The discount applies to this payment. Renewals are charged at the standard rate.
                </p>
              )}
            </div>

            {/* Phone — only when none is on file */}
            {!storedPhone && (
              <div className="mt-5">
                <label htmlFor="checkout-phone" className="text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1.5 block">
                  Mobile number
                </label>
                <div className="flex items-stretch gap-2">
                  <span className="flex items-center px-3 rounded-xl border border-zinc-300 dark:border-zinc-700 bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 text-sm">
                    +91
                  </span>
                  <input
                    id="checkout-phone"
                    type="tel"
                    inputMode="numeric"
                    autoComplete="tel-national"
                    maxLength={14}
                    value={phoneInput}
                    onChange={(e) => { setPhoneInput(e.target.value); setPhoneError("") }}
                    placeholder="98765 43210"
                    aria-invalid={phoneError ? true : undefined}
                    className="flex-1 rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-4 py-2.5 text-sm text-zinc-900 dark:text-white placeholder:text-zinc-400 focus:outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500/50"
                  />
                </div>
                {phoneError && <p className="text-red-500 text-xs mt-2">{phoneError}</p>}
                <p className="text-zinc-500 text-xs mt-1">
                  Required by the payment provider for your receipt. We only ask once.
                </p>
              </div>
            )}

            <div className="flex gap-2 mt-6">
              <Button variant="ghost" className="flex-1" onClick={() => setPendingPurchase(null)}>
                Cancel
              </Button>
              <Button
                variant="glow"
                className="flex-1"
                onClick={() => void handleConfirmPurchase()}
                disabled={checkoutLoading}
              >
                {checkoutLoading ? "Starting…" : "Continue to payment"}
              </Button>
            </div>
          </Card>
        </div>
      )}

      {/* Payment result banners (shown after returning from Cashfree) */}
      {verifying && (
        <div className="flex items-center gap-3 p-4 rounded-xl bg-violet-500/10 border border-violet-500/30 text-sm">
          <Loader2 size={16} className="text-violet-400 shrink-0 animate-spin" />
          <span className="text-zinc-700 dark:text-zinc-300">
            Confirming your payment with the gateway…
          </span>
        </div>
      )}
      {paymentResult === "success" && (
        <div className="flex items-center gap-3 p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-sm">
          <CheckCircle size={16} className="text-emerald-400 shrink-0" />
          <span className="text-zinc-700 dark:text-zinc-300">
            Payment successful! Your subscription has been activated.
          </span>
        </div>
      )}
      {paymentResult === "failure" && (
        <div className="flex items-center gap-3 p-4 rounded-xl bg-red-500/10 border border-red-500/30 text-sm">
          <XCircle size={16} className="text-red-400 shrink-0" />
          <span className="text-zinc-700 dark:text-zinc-300">
            Payment was not completed. Please try again or contact support if the issue persists.
          </span>
        </div>
      )}

      {/* Trial banner */}
      {sub?.isTrialing && sub.trialEndsAt && (
        <div className="flex flex-wrap items-center gap-3 p-4 rounded-xl bg-violet-500/10 border border-violet-500/30 text-sm">
          <Rocket size={16} className="text-violet-400 shrink-0" />
          <span className="text-zinc-700 dark:text-zinc-300 flex-1 min-w-0">
            You're on a <span className="text-violet-300 font-semibold">14-day PRO trial</span>
            {" "}— {daysLeft(sub.trialEndsAt)} day{daysLeft(sub.trialEndsAt) !== 1 ? "s" : ""} remaining.
            Upgrade now to keep PRO features.
          </span>
          <Button variant="glow" size="sm" className="shrink-0" onClick={() => void handleSubscribe("PRO", "monthly")} disabled={checkoutLoading}>
            {checkoutLoading ? <Loader2 size={14} className="animate-spin" /> : "Upgrade"}
          </Button>
        </div>
      )}

      {/* Cancellation notice */}
      {subscription?.cancelAtPeriodEnd && (
        <div className="flex items-center gap-3 p-4 rounded-xl bg-amber-500/10 border border-amber-500/30 text-sm">
          <AlertTriangle size={16} className="text-amber-400 shrink-0" />
          <span className="text-zinc-700 dark:text-zinc-300">
            Your subscription will be cancelled on{" "}
            <span className="font-semibold text-amber-300">{formatDate(subscription.currentPeriodEnd)}</span>.
            You'll be downgraded to the Free plan.
          </span>
        </div>
      )}

      {/* Past due warning */}
      {sub?.subscriptionStatus === "PAST_DUE" && (
        <div className="flex items-center gap-3 p-4 rounded-xl bg-red-500/10 border border-red-500/30 text-sm">
          <AlertTriangle size={16} className="text-red-400 shrink-0" />
          <span className="text-zinc-700 dark:text-zinc-300">
            Your last payment failed — your account is <span className="text-red-300 font-semibold">past due</span>.
            Please renew to restore full access.
          </span>
        </div>
      )}

      {checkoutError && (
        <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-300 text-sm">
          {checkoutError}
        </div>
      )}

      {(subscription || usage) && (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          {/* Current plan summary */}
          {subscription && (
            <Card className="h-full">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base">Current Plan</CardTitle>
                  <Badge variant={sub?.subscriptionStatus === "ACTIVE" || sub?.subscriptionStatus === "TRIALING" ? "success" : "secondary"}>
                    {sub?.subscriptionStatus === "TRIALING" ? "Trial" : sub?.subscriptionStatus ?? "Active"}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent>
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 sm:gap-6">
                  <div>
                    <div className="flex items-center gap-3 mb-2">
                      <div className={`w-10 h-10 rounded-xl border flex items-center justify-center ${PLAN_COLOR[currentPlanName]}`}>
                        {PLAN_ICON[currentPlanName]}
                      </div>
                      <div>
                        <div className="text-zinc-900 dark:text-white font-bold text-xl">{subscription.planDisplayName}</div>
                        <div className="text-zinc-600 dark:text-zinc-400 text-sm">
                          {sub?.isTrialing
                            ? `Trial ends ${formatDate(subscription.trialEndsAt!)}`
                            : `Renews ${formatDate(subscription.currentPeriodEnd)}`}
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="flex flex-col gap-2 shrink-0">
                    {currentPlanName === "BUSINESS" && (
                      <a href="mailto:support@genxqr.com" className="w-full sm:w-auto">
                        <Button variant="outline" size="sm" className="w-full">
                          Contact Sales to Upgrade
                        </Button>
                      </a>
                    )}
                    {currentPlanName !== "ENTERPRISE" && currentPlanName !== "BUSINESS" && (
                      <Button
                        variant="glow"
                        size="sm"
                        disabled={checkoutLoading}
                        onClick={() => void handleSubscribe(currentPlanName === "FREE" ? "PRO" : "BUSINESS", "monthly")}
                      >
                        {checkoutLoading ? <Loader2 size={14} className="animate-spin" /> : <ArrowRight size={14} />}
                        {currentPlanName === "FREE" ? "Upgrade to Pro" : "Upgrade to Business"}
                      </Button>
                    )}
                    {currentPlanName !== "FREE" && !subscription.cancelAtPeriodEnd && (
                      <button
                        onClick={handleCancel}
                        disabled={cancelMut.isPending}
                        className="text-red-400 hover:text-red-300 text-xs text-center transition-colors"
                      >
                        {cancelMut.isPending ? "Cancelling…" : "Cancel subscription"}
                      </button>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Usage */}
          {usage && (
            <Card className="h-full">
              <CardHeader><CardTitle className="text-base">Plan Usage</CardTitle></CardHeader>
              <CardContent>
                <div className="space-y-5">
                  {[
                    { label: "Dynamic QR Codes", used: usage.qrCodes.used, max: usage.qrCodes.limit },
                    ...(currentPlanName !== "FREE" ? [
                      { label: "Storage Used", used: usage.storageGB.used, max: usage.storageGB.limit, unit: "GB" },
                      { label: "API Calls (this month)", used: usage.apiCalls.used, max: usage.apiCalls.limit },
                    ] : []),
                  ].map((item) => {
                    const unlimited = item.max === 0
                    const pct = unlimited ? 0 : (item.used / Math.max(item.max, 1)) * 100
                    return (
                      <div key={item.label}>
                        <div className="flex items-center justify-between mb-1.5">
                          <span className="text-zinc-700 dark:text-zinc-300 text-sm">{item.label}</span>
                          <span className="text-zinc-500 text-sm">
                            {item.used} / {unlimited ? "—" : item.max}
                            {item.unit ? ` ${item.unit}` : ""}
                          </span>
                        </div>
                        {!unlimited && (
                          <div className="h-2 bg-zinc-100 dark:bg-zinc-800 rounded-full overflow-hidden">
                            <div
                              className={`h-full rounded-full transition-all ${pct > 80 ? "bg-amber-500" : "bg-violet-600"}`}
                              style={{ width: `${Math.min(pct, 100)}%` }}
                            />
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* Plan comparison */}
      {plans.length > 0 && (
        <div ref={plansRef}>
          <h2 className="text-lg font-bold text-zinc-900 dark:text-white mb-4">Available Plans</h2>
          <div className="grid grid-flow-col auto-cols-[minmax(260px,1fr)] gap-5 overflow-x-auto overflow-y-visible pt-3 pb-2">
            {plans.map((plan) => (
              <div key={plan.id} className="min-w-[260px] h-full">
                <PlanCard
                  plan={plan}
                  currentPlanName={currentPlanName}
                  onSubscribe={(p, c) => void handleSubscribe(p, c)}
                  isLoading={checkoutLoading}
                />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Invoices */}
      <Card>
        <CardHeader>
          <button
            onClick={() => setShowInvoices(!showInvoices)}
            className="flex items-center justify-between w-full text-left"
          >
            <div className="flex items-center gap-2">
              <FileText size={16} className="text-violet-400" />
              <CardTitle className="text-base">Payment History</CardTitle>
            </div>
            {showInvoices ? <ChevronUp size={16} className="text-zinc-400" /> : <ChevronDown size={16} className="text-zinc-400" />}
          </button>
        </CardHeader>
        {showInvoices && (
          <CardContent className="p-0">
            {invoices.length === 0 ? (
              <div className="flex flex-col items-center gap-2 py-10 text-zinc-500">
                <FileText size={28} className="text-zinc-700" />
                <p className="text-sm">No invoices yet. Your invoices will appear here after your first payment.</p>
              </div>
            ) : (
              <>
                {/* Table header */}
                <div className="hidden md:grid grid-cols-[1fr_120px_120px_90px_80px] gap-4 px-6 py-2 bg-zinc-50 dark:bg-zinc-800/50 border-b border-zinc-200 dark:border-zinc-800 text-xs font-semibold uppercase tracking-wide text-zinc-500">
                  <span>Invoice</span>
                  <span>Plan</span>
                  <span>Amount</span>
                  <span>Status</span>
                  <span className="text-right">Action</span>
                </div>

                {invoices.map((inv, i) => {
                  const invNum = getInvoiceNumber(inv)
                  const isDownloading = downloadingId === inv.id
                  return (
                    <div
                      key={inv.id}
                      className={`px-6 py-4 flex flex-col md:grid md:grid-cols-[1fr_120px_120px_90px_80px] md:items-center gap-2 md:gap-4 ${i < invoices.length - 1 ? "border-b border-zinc-200 dark:border-zinc-800" : ""}`}
                    >
                      {/* Invoice number + dates */}
                      <div>
                        <div className="text-zinc-900 dark:text-white text-sm font-semibold font-mono">{invNum}</div>
                        <div className="text-zinc-500 text-xs mt-0.5">
                          Issued {formatDate(inv.createdAt)}
                        </div>
                        <div className="text-zinc-500 text-xs">
                          Period: {formatDate(inv.periodStart)} – {formatDate(inv.periodEnd)}
                        </div>
                        {inv.cashfreeOrderId && (
                          <div className="text-zinc-600 text-xs mt-0.5 font-mono" title={`Order ID: ${inv.cashfreeOrderId}`}>
                            ORDER: …{inv.cashfreeOrderId.slice(-12)}
                          </div>
                        )}
                      </div>

                      {/* Plan + cycle */}
                      <div className="text-sm text-zinc-700 dark:text-zinc-300">
                        <div className="font-medium">{inv.planName}</div>
                        <div className="text-zinc-500 text-xs capitalize">{inv.billingCycle}</div>
                      </div>

                      {/* Amount */}
                      <div className="text-zinc-900 dark:text-white font-semibold text-sm">
                        {paiseToRupees(inv.amount)}
                      </div>

                      {/* Status */}
                      <div>
                        <Badge variant={inv.status === "paid" ? "success" : inv.status === "failed" ? "destructive" : "secondary"}>
                          {inv.status}
                        </Badge>
                      </div>

                      {/* Download */}
                      <div className="md:text-right">
                        <button
                          onClick={() => void handleDownloadInvoice(inv)}
                          disabled={isDownloading}
                          title="Download invoice"
                          className="inline-flex items-center gap-1.5 text-xs text-violet-400 hover:text-violet-300 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium"
                        >
                          {isDownloading
                            ? <Loader2 size={13} className="animate-spin" />
                            : <Download size={13} />
                          }
                          {isDownloading ? "…" : "Download"}
                        </button>
                      </div>
                    </div>
                  )
                })}

                {/* Pagination */}
                {invoices.length === INVOICES_PER_PAGE && (
                  <div className="flex items-center justify-between px-6 py-3 border-t border-zinc-200 dark:border-zinc-800">
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={invoicePage === 0}
                      onClick={() => setInvoicePage((p) => p - 1)}
                    >
                      ← Previous
                    </Button>
                    <span className="text-xs text-zinc-500">Page {invoicePage + 1}</span>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setInvoicePage((p) => p + 1)}
                    >
                      Next →
                    </Button>
                  </div>
                )}
              </>
            )}
          </CardContent>
        )}
      </Card>

    </div>
  )
}
