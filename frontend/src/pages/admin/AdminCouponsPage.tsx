import { useState, useCallback } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { Loader2, Plus, Trash2, Pencil, Ticket } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import {
  fetchAdminCoupons,
  createAdminCoupon,
  updateAdminCoupon,
  deleteAdminCoupon,
  type AdminCoupon,
  type AdminCouponInput,
  type CouponDiscountType,
  type PlanName,
} from "@/lib/api"

/**
 * Coupon management.
 *
 * Amounts are entered in RUPEES and converted to paise on the way out, because
 * the API speaks paise throughout (matching plan prices and invoices) but nobody
 * wants to type "79900" for ₹799. Percentages are entered as whole numbers.
 */

const PURCHASABLE_PLANS: PlanName[] = ["STARTER", "PRO", "BUSINESS"]
const CYCLES = ["monthly", "yearly"] as const

function rupees(paise: number): string {
  return `₹${(paise / 100).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`
}

function formatDate(iso: string | null): string {
  if (!iso) return "—"
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })
}

/** Empty form state — a percentage coupon is the common case, so it is the default. */
function blankForm() {
  return {
    id: null as string | null,
    code: "",
    description: "",
    discountType: "PERCENTAGE" as CouponDiscountType,
    /** Percent for PERCENTAGE, RUPEES for FIXED. Converted on submit. */
    discountValue: "",
    maxDiscountRupees: "",
    minOrderRupees: "",
    applicablePlans: [] as PlanName[],
    applicableCycles: [] as string[],
    maxRedemptions: "",
    maxRedemptionsPerUser: "1",
    validFrom: "",
    validUntil: "",
    isActive: true,
  }
}

type FormState = ReturnType<typeof blankForm>

function toInput(form: FormState): AdminCouponInput {
  const num = (v: string) => (v.trim() === "" ? null : Number(v))
  const rupeesToPaise = (v: string) => {
    const n = num(v)
    return n === null ? null : Math.round(n * 100)
  }
  return {
    code: form.code.trim().toUpperCase(),
    description: form.description.trim() || null,
    discountType: form.discountType,
    // Percent stays a percent; a fixed amount is entered in rupees and stored in paise.
    discountValue:
      form.discountType === "PERCENTAGE"
        ? Number(form.discountValue)
        : Math.round(Number(form.discountValue) * 100),
    maxDiscountPaise: form.discountType === "PERCENTAGE" ? rupeesToPaise(form.maxDiscountRupees) : null,
    minOrderPaise: rupeesToPaise(form.minOrderRupees),
    applicablePlans: form.applicablePlans,
    applicableCycles: form.applicableCycles,
    maxRedemptions: num(form.maxRedemptions),
    maxRedemptionsPerUser: Number(form.maxRedemptionsPerUser || "1"),
    validFrom: form.validFrom ? new Date(form.validFrom).toISOString() : null,
    validUntil: form.validUntil ? new Date(form.validUntil).toISOString() : null,
    isActive: form.isActive,
  }
}

function fromCoupon(c: AdminCoupon): FormState {
  const paiseToRupees = (p: number | null) => (p === null ? "" : String(p / 100))
  return {
    id: c.id,
    code: c.code,
    description: c.description ?? "",
    discountType: c.discountType,
    discountValue: c.discountType === "PERCENTAGE" ? String(c.discountValue) : String(c.discountValue / 100),
    maxDiscountRupees: paiseToRupees(c.maxDiscountPaise),
    minOrderRupees: paiseToRupees(c.minOrderPaise),
    applicablePlans: c.applicablePlans,
    applicableCycles: c.applicableCycles,
    maxRedemptions: c.maxRedemptions === null ? "" : String(c.maxRedemptions),
    maxRedemptionsPerUser: String(c.maxRedemptionsPerUser),
    validFrom: c.validFrom ? c.validFrom.slice(0, 10) : "",
    validUntil: c.validUntil ? c.validUntil.slice(0, 10) : "",
    isActive: c.isActive,
  }
}

const inputClass =
  "w-full rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-2 text-sm text-zinc-900 dark:text-white placeholder:text-zinc-500 focus:outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500/50"
const labelClass = "text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1 block"

export default function AdminCouponsPage() {
  const qc = useQueryClient()
  const [form, setForm] = useState<FormState | null>(null)
  const [error, setError] = useState("")

  const { data, isLoading } = useQuery({
    queryKey: ["admin-coupons"],
    queryFn: () => fetchAdminCoupons(true),
  })
  const coupons = data?.data ?? []

  const saveMut = useMutation({
    mutationFn: (f: FormState) =>
      f.id ? updateAdminCoupon(f.id, toInput(f)) : createAdminCoupon(toInput(f)),
    onSuccess: () => {
      setForm(null)
      setError("")
      void qc.invalidateQueries({ queryKey: ["admin-coupons"] })
    },
    // The server rejects things the form cannot catch — a duplicate code, or a
    // fixed discount worth more than the cheapest plan it applies to. Show its
    // message rather than a generic failure.
    onError: (err: unknown) => setError(err instanceof Error ? err.message : "Could not save the coupon."),
  })

  const deleteMut = useMutation({
    mutationFn: deleteAdminCoupon,
    onSuccess: (res) => {
      void qc.invalidateQueries({ queryKey: ["admin-coupons"] })
      // A redeemed coupon is deactivated instead of deleted; say which happened.
      if (res.message) window.alert(res.message)
    },
  })

  const handleDelete = useCallback((c: AdminCoupon) => {
    const used = c.redemptionCount > 0
    const question = used
      ? `"${c.code}" has been redeemed ${c.redemptionCount} time(s). It will be deactivated rather than deleted, so its redemption history is kept. Continue?`
      : `Delete "${c.code}"? It has never been used, so it will be removed completely.`
    if (window.confirm(question)) deleteMut.mutate(c.id)
  }, [deleteMut])

  const toggle = <T,>(list: T[], value: T): T[] =>
    list.includes(value) ? list.filter((v) => v !== value) : [...list, value]

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-white">Coupons</h1>
          <p className="text-zinc-500 text-sm mt-1">
            Discount codes for checkout. Applied to the first payment; renewals charge the standard rate.
          </p>
        </div>
        {!form && (
          <Button variant="glow" onClick={() => { setForm(blankForm()); setError("") }}>
            <Plus size={16} /> New coupon
          </Button>
        )}
      </div>

      {form && (
        <Card>
          <CardContent className="p-6 space-y-4">
            <h2 className="font-semibold text-zinc-900 dark:text-white">
              {form.id ? `Edit ${form.code}` : "New coupon"}
            </h2>

            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <label className={labelClass} htmlFor="c-code">Code</label>
                <input
                  id="c-code"
                  className={inputClass}
                  value={form.code}
                  onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })}
                  placeholder="SAVE20"
                />
                <p className="text-zinc-500 text-xs mt-1">Customers may type it in any case.</p>
              </div>
              <div>
                <label className={labelClass} htmlFor="c-desc">Description (internal)</label>
                <input
                  id="c-desc"
                  className={inputClass}
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  placeholder="Diwali campaign"
                />
              </div>
            </div>

            <div className="grid sm:grid-cols-3 gap-4">
              <div>
                <label className={labelClass} htmlFor="c-type">Discount type</label>
                <select
                  id="c-type"
                  className={inputClass}
                  value={form.discountType}
                  onChange={(e) => setForm({ ...form, discountType: e.target.value as CouponDiscountType })}
                >
                  <option value="PERCENTAGE">Percentage</option>
                  <option value="FIXED">Fixed amount</option>
                </select>
              </div>
              <div>
                <label className={labelClass} htmlFor="c-value">
                  {form.discountType === "PERCENTAGE" ? "Percent off" : "Amount off (₹)"}
                </label>
                <input
                  id="c-value"
                  type="number"
                  min="1"
                  className={inputClass}
                  value={form.discountValue}
                  onChange={(e) => setForm({ ...form, discountValue: e.target.value })}
                  placeholder={form.discountType === "PERCENTAGE" ? "20" : "200"}
                />
              </div>
              {form.discountType === "PERCENTAGE" && (
                <div>
                  <label className={labelClass} htmlFor="c-cap">Max discount (₹)</label>
                  <input
                    id="c-cap"
                    type="number"
                    min="1"
                    className={inputClass}
                    value={form.maxDiscountRupees}
                    onChange={(e) => setForm({ ...form, maxDiscountRupees: e.target.value })}
                    placeholder="no cap"
                  />
                  <p className="text-zinc-500 text-xs mt-1">
                    Worth setting — 50% off a yearly plan is a large giveaway.
                  </p>
                </div>
              )}
            </div>

            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <label className={labelClass}>Applies to plans</label>
                <div className="flex flex-wrap gap-2">
                  {PURCHASABLE_PLANS.map((plan) => (
                    <button
                      key={plan}
                      type="button"
                      onClick={() => setForm({ ...form, applicablePlans: toggle(form.applicablePlans, plan) })}
                      className={`px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors ${
                        form.applicablePlans.includes(plan)
                          ? "border-violet-500 bg-violet-500/15 text-violet-500"
                          : "border-zinc-300 dark:border-zinc-700 text-zinc-500 hover:border-violet-500/40"
                      }`}
                    >
                      {plan}
                    </button>
                  ))}
                </div>
                <p className="text-zinc-500 text-xs mt-1">None selected = all plans.</p>
              </div>
              <div>
                <label className={labelClass}>Applies to billing</label>
                <div className="flex flex-wrap gap-2">
                  {CYCLES.map((cycle) => (
                    <button
                      key={cycle}
                      type="button"
                      onClick={() => setForm({ ...form, applicableCycles: toggle(form.applicableCycles, cycle) })}
                      className={`px-3 py-1.5 rounded-lg border text-xs font-medium capitalize transition-colors ${
                        form.applicableCycles.includes(cycle)
                          ? "border-violet-500 bg-violet-500/15 text-violet-500"
                          : "border-zinc-300 dark:border-zinc-700 text-zinc-500 hover:border-violet-500/40"
                      }`}
                    >
                      {cycle}
                    </button>
                  ))}
                </div>
                <p className="text-zinc-500 text-xs mt-1">None selected = both.</p>
              </div>
            </div>

            <div className="grid sm:grid-cols-4 gap-4">
              <div>
                <label className={labelClass} htmlFor="c-min">Min order (₹)</label>
                <input id="c-min" type="number" min="0" className={inputClass}
                  value={form.minOrderRupees}
                  onChange={(e) => setForm({ ...form, minOrderRupees: e.target.value })}
                  placeholder="none" />
              </div>
              <div>
                <label className={labelClass} htmlFor="c-max">Total uses</label>
                <input id="c-max" type="number" min="1" className={inputClass}
                  value={form.maxRedemptions}
                  onChange={(e) => setForm({ ...form, maxRedemptions: e.target.value })}
                  placeholder="unlimited" />
              </div>
              <div>
                <label className={labelClass} htmlFor="c-peruser">Uses per customer</label>
                <input id="c-peruser" type="number" min="1" className={inputClass}
                  value={form.maxRedemptionsPerUser}
                  onChange={(e) => setForm({ ...form, maxRedemptionsPerUser: e.target.value })} />
              </div>
              <div className="flex items-end pb-2">
                <label className="flex items-center gap-2 text-sm text-zinc-700 dark:text-zinc-300">
                  <input
                    type="checkbox"
                    checked={form.isActive}
                    onChange={(e) => setForm({ ...form, isActive: e.target.checked })}
                  />
                  Active
                </label>
              </div>
            </div>

            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <label className={labelClass} htmlFor="c-from">Valid from</label>
                <input id="c-from" type="date" className={inputClass}
                  value={form.validFrom}
                  onChange={(e) => setForm({ ...form, validFrom: e.target.value })} />
              </div>
              <div>
                <label className={labelClass} htmlFor="c-until">Valid until</label>
                <input id="c-until" type="date" className={inputClass}
                  value={form.validUntil}
                  onChange={(e) => setForm({ ...form, validUntil: e.target.value })} />
              </div>
            </div>

            {error && <p className="text-red-500 text-sm">{error}</p>}

            <div className="flex gap-2">
              <Button variant="ghost" onClick={() => { setForm(null); setError("") }}>Cancel</Button>
              <Button
                variant="glow"
                onClick={() => saveMut.mutate(form)}
                disabled={saveMut.isPending || !form.code.trim() || !form.discountValue}
              >
                {saveMut.isPending ? "Saving…" : form.id ? "Save changes" : "Create coupon"}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {isLoading ? (
        <div className="flex items-center justify-center py-20 text-zinc-500">
          <Loader2 className="animate-spin" size={20} />
        </div>
      ) : coupons.length === 0 ? (
        <Card>
          <CardContent className="p-12 text-center">
            <Ticket size={32} className="mx-auto text-zinc-400 mb-3" />
            <p className="text-zinc-500 text-sm">No coupons yet. Create one to offer a discount at checkout.</p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-200 dark:border-zinc-800 text-left text-xs uppercase tracking-wider text-zinc-500">
                  <th className="px-5 py-3">Code</th>
                  <th className="px-5 py-3">Discount</th>
                  <th className="px-5 py-3">Applies to</th>
                  <th className="px-5 py-3">Used</th>
                  <th className="px-5 py-3">Valid until</th>
                  <th className="px-5 py-3">Status</th>
                  <th className="px-5 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {coupons.map((c) => (
                  <tr key={c.id} className="border-b border-zinc-100 dark:border-zinc-800/60 last:border-0">
                    <td className="px-5 py-3">
                      <div className="font-mono font-semibold text-zinc-900 dark:text-white">{c.code}</div>
                      {c.description && <div className="text-zinc-500 text-xs">{c.description}</div>}
                    </td>
                    <td className="px-5 py-3 text-zinc-700 dark:text-zinc-300">
                      {c.discountType === "PERCENTAGE"
                        ? `${c.discountValue}%${c.maxDiscountPaise ? ` (max ${rupees(c.maxDiscountPaise)})` : ""}`
                        : rupees(c.discountValue)}
                      {/* Concrete comparison so percentage and fixed can be judged side by side. */}
                      <div className="text-zinc-500 text-xs">
                        {rupees(c.examplePaiseOffProMonthly)} off PRO monthly
                      </div>
                    </td>
                    <td className="px-5 py-3 text-zinc-500 text-xs">
                      {c.applicablePlans.length ? c.applicablePlans.join(", ") : "All plans"}
                      {" · "}
                      {c.applicableCycles.length ? c.applicableCycles.join(", ") : "both cycles"}
                    </td>
                    <td className="px-5 py-3 text-zinc-700 dark:text-zinc-300">
                      {c.redemptionCount}
                      {c.maxRedemptions !== null && ` / ${c.maxRedemptions}`}
                    </td>
                    <td className="px-5 py-3 text-zinc-500">{formatDate(c.validUntil)}</td>
                    <td className="px-5 py-3">
                      <Badge variant={c.isActive ? "success" : "secondary"}>
                        {c.isActive ? "Active" : "Inactive"}
                      </Badge>
                    </td>
                    <td className="px-5 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <Button variant="ghost" size="sm" onClick={() => { setForm(fromCoupon(c)); setError("") }}>
                          <Pencil size={14} />
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => handleDelete(c)}>
                          <Trash2 size={14} className="text-red-400" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
