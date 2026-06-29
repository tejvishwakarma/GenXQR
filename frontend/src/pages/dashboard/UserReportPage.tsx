import { useState } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { Link } from "react-router-dom"
import {
  Flag, ShieldAlert, CheckCircle2, Clock, AlertTriangle,
  ChevronRight, QrCode, Loader2, CircleCheck,
} from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { submitAbuseReport, getMyQRReports, type ReportReason, type MyQRReport } from "@/lib/api"

// ─── Reason options ────────────────────────────────────────────────────────────

const REASONS: { value: ReportReason; label: string; description: string }[] = [
  { value: "SPAM",          label: "Spam",               description: "Unsolicited or repetitive promotional content" },
  { value: "PHISHING",      label: "Phishing / Malware", description: "Attempts to steal credentials or install malware" },
  { value: "INAPPROPRIATE", label: "Inappropriate",      description: "Offensive, adult, or disturbing content" },
  { value: "COPYRIGHT",     label: "Copyright",          description: "Unauthorized use of copyrighted material" },
  { value: "ILLEGAL",       label: "Illegal content",    description: "Content that violates applicable laws" },
  { value: "OTHER",         label: "Other",              description: "Something else not listed above" },
]

const REASON_LABELS: Record<string, string> = Object.fromEntries(REASONS.map((r) => [r.value, r.label]))

// ─── Sub-components ───────────────────────────────────────────────────────────

function ReportCard({ report }: { report: MyQRReport }) {
  return (
    <div className="flex items-start gap-4 p-4 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/50">
      <div className="w-9 h-9 rounded-lg bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center shrink-0">
        <QrCode size={16} className="text-zinc-500" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap mb-1">
          <Link
            to={`/app/qr/${report.qrCode.id}`}
            className="text-sm font-medium text-zinc-900 dark:text-zinc-100 hover:text-violet-600 dark:hover:text-violet-400 truncate transition-colors"
          >
            {report.qrCode.name}
          </Link>
          <span className="text-zinc-400 text-xs font-mono shrink-0">/{report.qrCode.slug}</span>
        </div>

        <div className="flex items-center gap-3 flex-wrap text-xs text-zinc-500">
          <span className="px-2 py-0.5 rounded-md bg-amber-500/10 text-amber-600 dark:text-amber-400 font-medium">
            {REASON_LABELS[report.reason] ?? report.reason}
          </span>
          <span className="flex items-center gap-1">
            <Clock size={11} />
            {new Date(report.createdAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
          </span>
          {!report.qrCode.isActive && (
            <span className="px-2 py-0.5 rounded-md bg-red-500/10 text-red-500 font-medium">QR deactivated</span>
          )}
        </div>

        {report.adminNotes && (
          <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400 italic border-l-2 border-zinc-300 dark:border-zinc-700 pl-2">
            Admin note: {report.adminNotes}
          </p>
        )}
      </div>

      <div className="shrink-0">
        {report.isResolved ? (
          <span className="flex items-center gap-1 text-xs text-emerald-500 font-medium">
            <CheckCircle2 size={13} />
            Resolved
          </span>
        ) : (
          <span className="flex items-center gap-1 text-xs text-amber-500 font-medium">
            <Clock size={13} />
            Under review
          </span>
        )}
      </div>
    </div>
  )
}

// ─── Page ──────────────────────────────────────────────────────────────────────

export default function UserReportPage() {
  const queryClient = useQueryClient()
  const [activeTab, setActiveTab] = useState<"submit" | "my-qrs">("submit")

  // Submit form state
  const [qrSlug, setQrSlug]     = useState("")
  const [reason, setReason]     = useState<ReportReason | "">("")
  const [details, setDetails]   = useState("")
  const [submitted, setSubmitted] = useState(false)
  const [formError, setFormError] = useState("")

  // My QR reports
  const { data: myReportsData, isLoading: reportsLoading } = useQuery({
    queryKey: ["my-qr-reports"],
    queryFn: getMyQRReports,
    enabled: activeTab === "my-qrs",
  })
  const myReports: MyQRReport[] = myReportsData?.data ?? []

  const submitMutation = useMutation({
    mutationFn: () => submitAbuseReport({
      qrSlug: qrSlug.trim().replace(/^\/r\//, "").replace(/^\//, ""),
      reason: reason as ReportReason,
      details: details.trim() || undefined,
    }),
    onSuccess: () => {
      setSubmitted(true)
      setQrSlug("")
      setReason("")
      setDetails("")
      setFormError("")
      void queryClient.invalidateQueries({ queryKey: ["my-qr-reports"] })
    },
    onError: (err: Error) => {
      setFormError(err.message ?? "Failed to submit report. Please try again.")
    },
  })

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setFormError("")
    setSubmitted(false)
    if (!qrSlug.trim()) { setFormError("Please enter the QR code slug or ID."); return }
    if (!reason)         { setFormError("Please select a reason."); return }
    submitMutation.mutate()
  }

  const tabs = [
    { id: "submit" as const,  label: "Submit a Report", icon: <Flag size={14} /> },
    { id: "my-qrs" as const,  label: "Reports on my QRs", icon: <ShieldAlert size={14} />, count: myReports.filter((r) => !r.isResolved).length },
  ]

  return (
    <div className="space-y-6 max-w-2xl">
      {/* Header */}
      <div>
        <h1 className="text-xl sm:text-2xl font-bold text-zinc-900 dark:text-white">Report &amp; Abuse</h1>
        <p className="text-zinc-500 text-sm mt-1">
          Report problematic QR codes or review moderation notices on your own codes.
        </p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 p-1 bg-zinc-100 dark:bg-zinc-900 rounded-xl w-fit">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all",
              activeTab === tab.id
                ? "bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white shadow-sm"
                : "text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300",
            )}
          >
            {tab.icon}
            {tab.label}
            {tab.count != null && tab.count > 0 && (
              <span className="min-w-4 h-4 px-1 rounded-full bg-amber-500 text-white text-[10px] leading-none flex items-center justify-center font-semibold">
                {tab.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ── Submit a Report ─────────────────────────────────────────────────── */}
      {activeTab === "submit" && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Flag size={16} className="text-red-500" />
              Report a QR Code
            </CardTitle>
            <p className="text-zinc-500 text-sm">
              Found a QR code violating our{" "}
              <Link to="/terms" className="text-violet-500 hover:underline">Terms of Service</Link>?
              Submit a report and our moderation team will review it within 48 hours.
            </p>
          </CardHeader>
          <CardContent className="space-y-5">

            {submitted && (
              <div className="flex items-start gap-3 p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400">
                <CircleCheck size={18} className="shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-medium">Report submitted successfully</p>
                  <p className="text-xs mt-0.5 opacity-80">Our team will review it and take action within 48 hours.</p>
                </div>
              </div>
            )}

            {formError && (
              <div className="flex items-start gap-3 p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-600 dark:text-red-400">
                <AlertTriangle size={16} className="shrink-0 mt-0.5" />
                <p className="text-sm">{formError}</p>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-5">
              {/* QR Slug */}
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                  QR Code Slug <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400 text-sm font-mono select-none">/r/</span>
                  <input
                    type="text"
                    value={qrSlug}
                    onChange={(e) => setQrSlug(e.target.value)}
                    placeholder="abc123"
                    className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-violet-500/30 focus:border-violet-500 transition"
                  />
                </div>
                <p className="text-xs text-zinc-400">Enter the short code from the QR's URL — e.g. for <code className="text-xs bg-zinc-100 dark:bg-zinc-800 px-1 rounded">/r/abc123</code> enter <code className="text-xs bg-zinc-100 dark:bg-zinc-800 px-1 rounded">abc123</code></p>
              </div>

              {/* Reason */}
              <div className="space-y-2">
                <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                  Reason <span className="text-red-500">*</span>
                </label>
                <div className="grid sm:grid-cols-2 gap-2">
                  {REASONS.map((r) => (
                    <button
                      key={r.value}
                      type="button"
                      onClick={() => setReason(r.value)}
                      className={cn(
                        "flex flex-col items-start gap-0.5 p-3 rounded-xl border text-left transition-all",
                        reason === r.value
                          ? "border-violet-500 bg-violet-500/10 ring-1 ring-violet-500/30"
                          : "border-zinc-200 dark:border-zinc-700 hover:border-zinc-300 dark:hover:border-zinc-600",
                      )}
                    >
                      <span className={cn("text-sm font-medium", reason === r.value ? "text-violet-600 dark:text-violet-400" : "text-zinc-800 dark:text-zinc-200")}>
                        {r.label}
                      </span>
                      <span className="text-xs text-zinc-400 leading-snug">{r.description}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Additional details */}
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                  Additional details <span className="text-zinc-400 font-normal">(optional)</span>
                </label>
                <textarea
                  value={details}
                  onChange={(e) => setDetails(e.target.value)}
                  rows={3}
                  maxLength={1000}
                  placeholder="Describe what you observed — destination URL, content seen, etc."
                  className="w-full px-3 py-2.5 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-violet-500/30 focus:border-violet-500 transition placeholder:text-zinc-400"
                />
                <p className="text-xs text-zinc-400 text-right">{details.length}/1000</p>
              </div>

              <Button
                type="submit"
                disabled={submitMutation.isPending}
                className="w-full sm:w-auto"
              >
                {submitMutation.isPending ? (
                  <><Loader2 size={14} className="animate-spin" /> Submitting…</>
                ) : (
                  <><Flag size={14} /> Submit Report</>
                )}
              </Button>
            </form>
          </CardContent>
        </Card>
      )}

      {/* ── Reports on my QR codes ──────────────────────────────────────────── */}
      {activeTab === "my-qrs" && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <ShieldAlert size={16} className="text-amber-500" />
              Reports on my QR codes
            </CardTitle>
            <p className="text-zinc-500 text-sm">
              Reports filed by other users against your QR codes. Our team reviews each one.
            </p>
          </CardHeader>
          <CardContent>
            {reportsLoading ? (
              <div className="flex justify-center py-12">
                <Loader2 size={20} className="animate-spin text-violet-500" />
              </div>
            ) : myReports.length === 0 ? (
              <div className="flex flex-col items-center gap-3 py-12 text-center">
                <div className="w-12 h-12 rounded-xl bg-emerald-500/10 flex items-center justify-center">
                  <CheckCircle2 size={22} className="text-emerald-500" />
                </div>
                <p className="text-zinc-700 dark:text-zinc-300 font-medium text-sm">All clear</p>
                <p className="text-zinc-400 text-xs max-w-xs">
                  None of your QR codes have been reported. Keep up the great work!
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {/* Summary pills */}
                <div className="flex gap-3 flex-wrap mb-4">
                  <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800">
                    <Flag size={12} className="text-zinc-400" />
                    <span className="text-xs text-zinc-600 dark:text-zinc-400 font-medium">{myReports.length} total</span>
                  </div>
                  {myReports.filter((r) => !r.isResolved).length > 0 && (
                    <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-500/10 border border-amber-500/20">
                      <Clock size={12} className="text-amber-500" />
                      <span className="text-xs text-amber-600 dark:text-amber-400 font-medium">
                        {myReports.filter((r) => !r.isResolved).length} under review
                      </span>
                    </div>
                  )}
                  {myReports.filter((r) => r.isResolved).length > 0 && (
                    <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
                      <CheckCircle2 size={12} className="text-emerald-500" />
                      <span className="text-xs text-emerald-600 dark:text-emerald-400 font-medium">
                        {myReports.filter((r) => r.isResolved).length} resolved
                      </span>
                    </div>
                  )}
                </div>

                {myReports.map((report) => (
                  <ReportCard key={report.id} report={report} />
                ))}

                <div className="pt-2 border-t border-zinc-100 dark:border-zinc-800">
                  <p className="text-xs text-zinc-400 flex items-center gap-1.5">
                    <ShieldAlert size={11} />
                    If a report leads to a violation confirmed by our team, your QR code may be deactivated.
                    <Link to="/terms" className="text-violet-500 hover:underline shrink-0 flex items-center gap-0.5">
                      Learn more <ChevronRight size={10} />
                    </Link>
                  </p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  )
}
