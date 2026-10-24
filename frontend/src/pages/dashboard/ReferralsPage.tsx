import { useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { Check, Copy, Gift, Loader2, MessageCircle, Clock, Wallet } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { getReferralSummary, type ReferralStatus, type ReferralSummary } from "@/lib/api"
import { referralLink } from "@/lib/referralLink"

/** ₹ with paise only when there are any: ₹159.80, ₹200. */
function rupees(paise: number) {
  const value = paise / 100
  return `₹${value.toLocaleString("en-IN", { minimumFractionDigits: Number.isInteger(value) ? 0 : 2, maximumFractionDigits: 2 })}`
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })
}

const STATUS: Record<ReferralStatus, { label: string; variant: "secondary" | "warning" | "success" | "destructive" }> = {
  signed_up: { label: "Signed up", variant: "secondary" },
  pending: { label: "Reward pending", variant: "warning" },
  credited: { label: "Credited", variant: "success" },
  cancelled: { label: "Cancelled", variant: "destructive" },
}

const HISTORY_LABEL: Record<ReferralSummary["history"][number]["kind"], string> = {
  REFERRAL_REWARD: "Referral reward",
  REDEMPTION: "Used at checkout",
  ADJUSTMENT: "Adjustment",
}

export default function ReferralsPage() {
  const { data, isLoading, isError } = useQuery({ queryKey: ["referrals"], queryFn: getReferralSummary })
  const summary = data?.data

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-32 text-zinc-500">
        <Loader2 size={22} className="animate-spin mr-2" /> Loading…
      </div>
    )
  }
  if (isError || !summary) {
    return <p className="py-32 text-center text-zinc-500">Could not load your referrals. Please refresh.</p>
  }

  const link = referralLink(summary.code, window.location.origin)
  const { balance } = summary

  return (
    <div className="space-y-8 animate-fade-in max-w-4xl">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold text-zinc-900 dark:text-white">Refer &amp; earn</h1>
        <p className="text-zinc-500 text-sm mt-1">
          Invite friends to GenXQR. When a friend makes their first purchase, you each get {summary.rewardPercent}% of what they paid as GenXQR credit.
        </p>
      </div>

      {/* Link */}
      <Card>
        <CardContent className="p-5 sm:p-6 space-y-4">
          <div className="flex items-center gap-2 text-sm font-semibold text-zinc-900 dark:text-white">
            <Gift size={16} className="text-violet-500" /> Your invite link
          </div>
          <ShareLink link={link} code={summary.code} percent={summary.rewardPercent} />
        </CardContent>
      </Card>

      {/* Credit */}
      <div className="grid sm:grid-cols-2 gap-4">
        <Card>
          <CardContent className="p-5 sm:p-6">
            <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-zinc-500">
              <Wallet size={14} /> Available credit
            </div>
            <p className="mt-2 text-3xl font-bold text-zinc-900 dark:text-white">{rupees(Math.max(0, balance.availablePaise))}</p>
            <p className="mt-1 text-xs text-zinc-500">Applied automatically at your next checkout on the Billing page.</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5 sm:p-6">
            <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-zinc-500">
              <Clock size={14} /> Pending
            </div>
            <p className="mt-2 text-3xl font-bold text-zinc-900 dark:text-white">{rupees(balance.pendingPaise)}</p>
            <p className="mt-1 text-xs text-zinc-500">
              {balance.nextAvailableAt
                ? `Next amount becomes usable on ${formatDate(balance.nextAvailableAt)}.`
                : `Rewards become usable ${summary.holdDays} days after the purchase.`}
            </p>
          </CardContent>
        </Card>
      </div>

      {summary.referredBy && (
        <p className="rounded-xl border border-violet-500/30 bg-violet-500/10 px-4 py-3 text-sm text-zinc-700 dark:text-zinc-300">
          You joined through a friend's invite.{" "}
          {summary.referredBy.status === "signed_up"
            ? `After your first purchase you'll both get ${summary.rewardPercent}% of it as credit.`
            : summary.referredBy.status === "pending" && summary.referredBy.availableAt
              ? `Your reward of ${rupees(summary.referredBy.rewardPaise ?? 0)} becomes usable on ${formatDate(summary.referredBy.availableAt)}.`
              : summary.referredBy.status === "credited"
                ? `Your reward of ${rupees(summary.referredBy.rewardPaise ?? 0)} has been added to your credit.`
                : "The reward for this referral was cancelled."}
        </p>
      )}

      {/* How it works */}
      <Card>
        <CardContent className="p-5 sm:p-6">
          <p className="text-sm font-semibold text-zinc-900 dark:text-white mb-4">How it works</p>
          <ol className="grid sm:grid-cols-3 gap-4 text-sm">
            {[
              ["Share your link", "Your friend signs up for GenXQR through it."],
              ["They make their first purchase", `You each earn ${summary.rewardPercent}% of the amount they paid.`],
              [`Credit after ${summary.holdDays} days`, "Use it on any plan purchase. It's applied automatically at checkout."],
            ].map(([title, text], i) => (
              <li key={title} className="flex gap-3">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-violet-500/15 text-xs font-bold text-violet-500">{i + 1}</span>
                <span>
                  <span className="block font-medium text-zinc-900 dark:text-white">{title}</span>
                  <span className="text-zinc-500 text-xs">{text}</span>
                </span>
              </li>
            ))}
          </ol>
        </CardContent>
      </Card>

      {/* Referrals */}
      <Card>
        <CardContent className="p-0">
          <p className="px-5 sm:px-6 pt-5 pb-3 text-sm font-semibold text-zinc-900 dark:text-white">Your referrals</p>
          {summary.referrals.length === 0 ? (
            <p className="px-5 sm:px-6 pb-6 text-sm text-zinc-500">No one has signed up through your link yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[480px] text-sm">
                <thead>
                  <tr className="border-y border-zinc-200 dark:border-zinc-800 text-left text-xs text-zinc-500">
                    <th className="px-5 sm:px-6 py-2.5 font-medium">Friend</th>
                    <th className="px-3 py-2.5 font-medium">Joined</th>
                    <th className="px-3 py-2.5 font-medium">Status</th>
                    <th className="px-5 sm:px-6 py-2.5 font-medium text-right">Your reward</th>
                  </tr>
                </thead>
                <tbody>
                  {summary.referrals.map((r) => (
                    <tr key={r.id} className="border-b border-zinc-100 dark:border-zinc-800/60 last:border-0">
                      <td className="px-5 sm:px-6 py-3 font-mono text-xs text-zinc-700 dark:text-zinc-300">{r.friend}</td>
                      <td className="px-3 py-3 text-zinc-500">{formatDate(r.joinedAt)}</td>
                      <td className="px-3 py-3">
                        <Badge variant={STATUS[r.status].variant}>{STATUS[r.status].label}</Badge>
                        {r.status === "pending" && r.availableAt && (
                          <span className="ml-2 text-xs text-zinc-500">usable {formatDate(r.availableAt)}</span>
                        )}
                      </td>
                      <td className="px-5 sm:px-6 py-3 text-right text-zinc-900 dark:text-white">
                        {r.rewardPaise ? rupees(r.rewardPaise) : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Credit history */}
      {summary.history.length > 0 && (
        <Card>
          <CardContent className="p-5 sm:p-6">
            <p className="text-sm font-semibold text-zinc-900 dark:text-white mb-3">Credit history</p>
            <ul className="divide-y divide-zinc-100 dark:divide-zinc-800 text-sm">
              {summary.history.map((h) => (
                <li key={h.id} className="flex items-center justify-between gap-3 py-2.5">
                  <span>
                    <span className="text-zinc-800 dark:text-zinc-200">
                      {/* Credit is held when a checkout starts; an unpaid checkout gives it back. */}
                      {h.kind === "REDEMPTION" && h.voidedAt ? "Checkout not completed — credit returned" : HISTORY_LABEL[h.kind]}
                    </span>
                    {h.voidedAt && h.kind !== "REDEMPTION" && <span className="ml-2 text-xs text-red-500">cancelled</span>}
                    <span className="block text-xs text-zinc-500">{formatDate(h.createdAt)}</span>
                  </span>
                  <span className={h.voidedAt ? "text-zinc-400 line-through" : h.amountPaise < 0 ? "text-zinc-700 dark:text-zinc-300" : "text-emerald-600 dark:text-emerald-400"}>
                    {h.amountPaise < 0 ? "−" : "+"}{rupees(Math.abs(h.amountPaise))}
                  </span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      <div className="text-xs leading-relaxed text-zinc-500 space-y-1">
        <p>
          Rewards are {summary.rewardPercent}% of what your friend actually paid on their first purchase, after any coupon. A purchase made
          entirely with coupons or credit earns nothing.
        </p>
        <p>
          Rewards become usable {summary.holdDays} days after the purchase. If that purchase is refunded, both rewards are cancelled.
          Credit can be used on GenXQR plan purchases; it can't be withdrawn as cash. You can refer each person once — a second account on the same inbox doesn't count, and neither does referring yourself. See the{" "}
          <a href="/terms" className="underline hover:text-zinc-700 dark:hover:text-zinc-300">Terms of Service</a> (section 4).
        </p>
      </div>
    </div>
  )
}

function ShareLink({ link, code, percent }: { link: string; code: string; percent: number }) {
  const [copied, setCopied] = useState(false)
  const message = `I use GenXQR for QR codes that stay editable after printing. Sign up with my link and we both get ${percent}% of your first purchase back as credit: ${link}`
  return (
    <div className="space-y-3">
      <div className="flex flex-col sm:flex-row gap-2">
        <input
          readOnly
          value={link}
          onFocus={(e) => e.currentTarget.select()}
          className="flex-1 rounded-xl border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-900 px-4 py-2.5 font-mono text-sm text-zinc-800 dark:text-zinc-200"
          aria-label="Your invite link"
        />
        <Button
          className="gap-2"
          onClick={() => {
            void navigator.clipboard.writeText(link).then(() => {
              setCopied(true)
              setTimeout(() => setCopied(false), 2000)
            })
          }}
        >
          {copied ? <Check size={15} /> : <Copy size={15} />} {copied ? "Copied" : "Copy link"}
        </Button>
        <a
          href={`https://wa.me/?text=${encodeURIComponent(message)}`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center justify-center gap-2 rounded-xl border border-zinc-300 dark:border-zinc-700 px-4 py-2.5 text-sm font-medium text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800"
        >
          <MessageCircle size={15} /> WhatsApp
        </a>
      </div>
      <p className="text-xs text-zinc-500">
        Your code: <span className="font-mono font-semibold text-zinc-700 dark:text-zinc-300">{code}</span>
      </p>
    </div>
  )
}
