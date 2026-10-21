import { useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Gift, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { cancelAdminReferral, fetchAdminReferrals, type AdminReferral, type ReferralStatus } from "@/lib/api"

/**
 * Referral programme oversight (backend referral.service.ts). The main action
 * is cancelling a referral when its qualifying purchase is refunded: refunds
 * are made in the Cashfree dashboard, which does not tell GenXQR, so the
 * matching rewards have to be voided here.
 */

const FILTERS: Array<{ id: ReferralStatus | "all"; label: string }> = [
  { id: "all", label: "All" },
  { id: "signed_up", label: "Signed up" },
  { id: "pending", label: "Pending" },
  { id: "credited", label: "Credited" },
  { id: "cancelled", label: "Cancelled" },
]

const BADGE: Record<ReferralStatus, "secondary" | "warning" | "success" | "destructive"> = {
  signed_up: "secondary",
  pending: "warning",
  credited: "success",
  cancelled: "destructive",
}

function rupees(paise: number | null) {
  return paise === null ? "—" : `₹${(paise / 100).toLocaleString("en-IN", { minimumFractionDigits: paise % 100 ? 2 : 0, maximumFractionDigits: 2 })}`
}

function date(iso: string | null) {
  return iso ? new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "—"
}

export default function AdminReferralsPage() {
  const qc = useQueryClient()
  const [filter, setFilter] = useState<ReferralStatus | "all">("all")
  const { data, isLoading } = useQuery({
    queryKey: ["admin-referrals", filter],
    queryFn: () => fetchAdminReferrals(filter === "all" ? undefined : filter),
  })
  const cancel = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) => cancelAdminReferral(id, reason),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["admin-referrals"] }),
    onError: (err) => window.alert(err instanceof Error ? err.message : "Could not cancel the referral."),
  })

  function handleCancel(r: AdminReferral) {
    const spent = r.status === "credited"
      ? "\n\nThe rewards are already usable, so either person may have spent theirs; their balance can go negative and future credit will cover it."
      : ""
    const reason = window.prompt(
      `Cancel the referral of ${r.referee?.email ?? "a deleted account"} by ${r.referrer.email}? Both rewards will be voided.${spent}\n\nReason (e.g. "Qualifying purchase refunded"):`,
    )
    if (reason && reason.trim().length >= 3) cancel.mutate({ id: r.id, reason: reason.trim() })
  }

  const rows = data?.data ?? []

  return (
    <div className="space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold text-zinc-900 dark:text-white">
          <Gift size={22} className="text-violet-500" /> Referrals
        </h1>
        <p className="mt-1 text-sm text-zinc-500">
          A referral qualifies on the friend's first paid purchase; both sides then get 20% of it as credit, usable 15 days later.
          A referrer can refer each person once — a second account on the same inbox (alias or re-created) is not recorded.
          If a qualifying purchase is refunded in Cashfree, cancel the referral here to void both rewards.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <Button key={f.id} size="sm" variant={filter === f.id ? "default" : "outline"} onClick={() => setFilter(f.id)}>
            {f.label}
          </Button>
        ))}
      </div>

      <Card>
        <CardContent className="p-0 overflow-x-auto">
          {isLoading ? (
            <div className="flex items-center justify-center py-16 text-zinc-500"><Loader2 size={18} className="mr-2 animate-spin" /> Loading…</div>
          ) : rows.length === 0 ? (
            <p className="py-16 text-center text-sm text-zinc-500">No referrals.</p>
          ) : (
            <table className="w-full min-w-[900px] text-sm">
              <thead>
                <tr className="border-b border-zinc-200 dark:border-zinc-800 text-left text-xs uppercase tracking-wide text-zinc-500">
                  <th className="px-5 py-3">Referrer</th>
                  <th className="px-5 py-3">Friend</th>
                  <th className="px-5 py-3">Joined</th>
                  <th className="px-5 py-3">Status</th>
                  <th className="px-5 py-3">Paid / reward each</th>
                  <th className="px-5 py-3">Usable from</th>
                  <th className="px-5 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-b border-zinc-100 dark:border-zinc-800/60 last:border-0 align-top">
                    <td className="px-5 py-3 text-zinc-800 dark:text-zinc-200">{r.referrer.email}</td>
                    <td className="px-5 py-3 text-zinc-800 dark:text-zinc-200">{r.referee?.email ?? <span className="text-zinc-500">Deleted account</span>}</td>
                    <td className="px-5 py-3 text-zinc-500">{date(r.createdAt)}</td>
                    <td className="px-5 py-3">
                      <Badge variant={BADGE[r.status]}>{r.status.replace("_", " ")}</Badge>
                      {r.cancelReason && <div className="mt-1 text-xs text-zinc-500">{r.cancelReason}</div>}
                    </td>
                    <td className="px-5 py-3 text-zinc-700 dark:text-zinc-300">
                      {rupees(r.qualifyingAmountPaise)} / {rupees(r.rewardPaise)}
                      {r.qualifyingOrderId && <div className="font-mono text-[11px] text-zinc-500">{r.qualifyingOrderId}</div>}
                    </td>
                    <td className="px-5 py-3 text-zinc-500">{date(r.availableAt)}</td>
                    <td className="px-5 py-3 text-right">
                      {r.status !== "cancelled" && r.status !== "signed_up" && (
                        <Button size="sm" variant="ghost" className="text-red-500" onClick={() => handleCancel(r)} disabled={cancel.isPending}>
                          Cancel
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
