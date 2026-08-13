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
  createPaymentOrder, cancelSubscription, downgradeSubscription,
  type Plan, type PlanName, type PayUOrderParams, type Invoice,
} from "@/lib/api"

// ─── Helpers ──────────────────────────────────────────────────────────────────

function paiseToRupees(paise: number) {
  return `₹${(paise / 100).toLocaleString("en-IN")}`
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

// ─── PayU form-POST helper ────────────────────────────────────────────────────
//
// The standard PayU Prebuilt Checkout integration works via a browser form POST:
//   1. Backend generates hash + returns all payment params
//   2. We build a hidden <form> and submit it programmatically
//   3. Browser navigates to PayU's hosted checkout page
//   4. After payment, PayU POSTs to our backend surl/furl
//   5. Backend verifies hash, activates subscription, redirects browser back here
//
// This is the ONLY method that works — the Bolt SDK popup is rate-limited by
// PayU's test sandbox after just a few attempts.

function submitPayUForm(params: PayUOrderParams): void {
  const form = document.createElement("form")
  form.method = "POST"
  form.action = params.baseUrl   // e.g. https://test.payu.in/_payment

  const fields: Record<string, string> = {
    key:         params.key,
    txnid:       params.txnid,
    amount:      params.amount,
    productinfo: params.productinfo,
    firstname:   params.firstname,
    email:       params.email,
    phone:       params.phone,
    surl:        params.surl,
    furl:        params.furl,
    hash:        params.hash,
    udf1:        params.udf1,
    udf2:        params.udf2,
    udf3:        params.udf3,
  }

  for (const [name, value] of Object.entries(fields)) {
    const input = document.createElement("input")
    input.type  = "hidden"
    input.name  = name
    input.value = value ?? ""
    form.appendChild(input)
  }

  document.body.appendChild(form)
  form.submit()
  // The browser navigates away — no cleanup needed
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

  // Read payment result from URL params (set by backend redirect after PayU callback)
  const paymentResult = searchParams.get("payment")  // "success" | "failure" | null

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
   * Initiates a PayU payment via the standard Prebuilt Checkout (form POST redirect).
   * The browser navigates away to PayU's payment page. After payment, PayU POSTs
   * to our backend /api/billing/payu-success or /api/billing/payu-failure, which
   * verifies the hash and redirects back here with ?payment=success or ?payment=failure.
   */
  const handleSubscribe = useCallback(async (planName: PlanName, cycle: "monthly" | "yearly") => {
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

      const orderRes = await createPaymentOrder(planName, cycle)
      submitPayUForm(orderRes.data)
      // Browser navigates away — loading state stays true until page unloads
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to process request"
      setCheckoutError(msg)
      setCheckoutLoading(false)
    }
  }, [subData?.data?.planName, qc])

  const handleCancel = useCallback(() => {
    if (!window.confirm("Cancel your subscription? You'll keep access until the end of the current period.")) return
    cancelMut.mutate()
  }, [cancelMut])

  const handleDownloadInvoice = useCallback(async (invoice: Invoice) => {
    setDownloadingId(invoice.id)
    try {
      await downloadInvoice(invoice.id, getInvoiceNumber(invoice))
    } catch {
      alert("Failed to download invoice. Please try again.")
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

      {/* Payment result banners (shown after returning from PayU) */}
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
                        {inv.payuTxnId && (
                          <div className="text-zinc-600 text-xs mt-0.5 font-mono" title={`Transaction ID: ${inv.payuTxnId}`}>
                            TXN: …{inv.payuTxnId.slice(-12)}
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
