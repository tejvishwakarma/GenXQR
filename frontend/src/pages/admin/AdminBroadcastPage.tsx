import { useState } from "react"
import { useMutation } from "@tanstack/react-query"
import {
  AlertTriangle, CheckCircle, Loader2, Eye, Code,
  Bell, Mail, ExternalLink, Info,
} from "lucide-react"
import { sendBroadcast, adminBroadcastNotification, getTokenRole, type NotificationType } from "@/lib/api"

// ─── Shared segment options ────────────────────────────────────────────────────

const SEGMENTS = [
  { value: "all",      label: "All Users",      description: "Everyone on the platform" },
  { value: "free",     label: "Free Users",     description: "Users without a paid subscription" },
  { value: "paid",     label: "Paid Users",     description: "Active STARTER, PRO, BUSINESS subscribers" },
  { value: "trialing", label: "Trialing Users", description: "Users currently in trial period" },
  { value: "past_due", label: "Past Due Users", description: "Subscribers with a failed or overdue payment" },
]

const NOTIFICATION_TYPES: { value: NotificationType; label: string; color: string }[] = [
  { value: "SYSTEM",  label: "System",  color: "text-zinc-300 border-zinc-600 bg-zinc-800" },
  { value: "FEATURE", label: "Feature", color: "text-violet-300 border-violet-700 bg-violet-900/30" },
  { value: "BILLING", label: "Billing", color: "text-amber-300 border-amber-700 bg-amber-900/30" },
  { value: "LIMIT",   label: "Limit",   color: "text-red-300 border-red-700 bg-red-900/30" },
  { value: "TEAM",    label: "Team",    color: "text-emerald-300 border-emerald-700 bg-emerald-900/30" },
]

// ─── Guard ─────────────────────────────────────────────────────────────────────

function SuperAdminGuard({ children }: { children: React.ReactNode }) {
  const role = getTokenRole()
  if (role !== "SUPER_ADMIN") {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-4">
        <AlertTriangle className="text-amber-400" size={40} />
        <p className="text-zinc-400 text-lg">SUPER_ADMIN role required.</p>
      </div>
    )
  }
  return <>{children}</>
}

// ─── Segment picker shared component ──────────────────────────────────────────

function SegmentPicker({ segment, onChange }: { segment: string; onChange: (v: string) => void }) {
  return (
    <div className="space-y-2">
      <label className="text-zinc-400 text-sm font-medium">Target Segment</label>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        {SEGMENTS.map((s) => (
          <button
            key={s.value}
            type="button"
            onClick={() => onChange(s.value)}
            className={`text-left p-3 rounded-xl border transition ${
              segment === s.value
                ? "border-violet-500/50 bg-violet-500/10"
                : "border-zinc-700 bg-zinc-800 hover:border-zinc-600"
            }`}
          >
            <div className={`text-sm font-medium ${segment === s.value ? "text-violet-300" : "text-zinc-200"}`}>
              {s.label}
            </div>
            <div className="text-zinc-500 text-xs mt-0.5">{s.description}</div>
          </button>
        ))}
      </div>
    </div>
  )
}

// ─── Email broadcast tab ───────────────────────────────────────────────────────

function EmailBroadcastTab() {
  const [subject, setSubject]       = useState("")
  const [body, setBody]             = useState("")
  const [segment, setSegment]       = useState("all")
  const [testEmail, setTestEmail]   = useState("")
  const [mode, setMode]             = useState<"preview" | "live">("preview")
  const [bodyFormat, setBodyFormat] = useState<"text" | "html">("text")
  const [showPreview, setShowPreview] = useState(false)
  const [result, setResult]         = useState<{ sent: number; total?: number; preview?: boolean } | null>(null)

  const mutation = useMutation({
    mutationFn: () =>
      sendBroadcast(subject, body, segment, mode === "preview" ? testEmail || undefined : undefined, bodyFormat),
    onSuccess: (data) => setResult(data),
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setResult(null)
    mutation.mutate()
  }

  const year = new Date().getFullYear()

  const logoBlock = `
    <table cellpadding="0" cellspacing="0" role="presentation" style="margin-bottom:20px">
      <tr>
        <td width="36" height="36" align="center" valign="middle"
          style="background:linear-gradient(135deg,#6366f1,#818cf8);border-radius:9px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:17px;font-weight:800;color:#fff;line-height:36px;text-align:center">
          N
        </td>
        <td width="10"></td>
        <td valign="middle">
          <span style="font-size:19px;font-weight:700;color:#4f46e5;letter-spacing:-0.4px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif">GenXQR</span>
        </td>
      </tr>
    </table>`

  const footerBlock = `
    <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="background:#fafafa;border-top:1px solid #e4e4e7;padding:18px 48px;margin-top:0">
      <tr>
        <td style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:12px;color:#71717a;line-height:1.65">
          You received this because you have a GenXQR account.<br>© ${year} GenXQR · All rights reserved.
        </td>
        <td align="right" valign="top" style="white-space:nowrap">
          <a href="#" style="font-size:12px;color:#6366f1;text-decoration:none;font-weight:500;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif">genxqr.com</a>
        </td>
      </tr>
    </table>`

  const plainContent = body
    ? body.split(/\n\n+/).map((p) =>
        `<p style="margin:0 0 16px;font-size:15px;color:#3f3f46;line-height:1.75;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif">${p.replace(/\n/g, "<br>")}</p>`
      ).join("")
    : `<p style="color:#a1a1aa;font-style:italic;font-family:sans-serif">Your message will appear here…</p>`

  const htmlContent = body || `<p style="color:#a1a1aa;font-style:italic;font-family:sans-serif">Your HTML content will appear here…</p>`

  const previewHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <style>
    .email-body h1 { font-size:22px;font-weight:700;color:#0f0f11;margin:0 0 16px;line-height:1.35;letter-spacing:-0.4px }
    .email-body h2 { font-size:18px;font-weight:600;color:#18181b;margin:24px 0 10px;line-height:1.4 }
    .email-body h3 { font-size:15px;font-weight:600;color:#27272a;margin:20px 0 8px }
    .email-body p  { font-size:15px;color:#3f3f46;line-height:1.75;margin:0 0 16px }
    .email-body a  { color:#6366f1;text-decoration:underline;font-weight:500 }
    .email-body ul,.email-body ol { padding-left:22px;margin:0 0 16px;color:#3f3f46;font-size:15px;line-height:1.75 }
    .email-body li { margin-bottom:6px }
    .email-body blockquote { margin:0 0 16px;padding:14px 20px;border-left:3px solid #6366f1;background:#f5f3ff;border-radius:0 8px 8px 0;color:#4338ca;font-style:italic;font-size:15px;line-height:1.7 }
    .email-body code { background:#f4f4f5;border:1px solid #e4e4e7;border-radius:4px;padding:2px 6px;font-family:'SF Mono',Menlo,Monaco,'Courier New',monospace;font-size:13px;color:#6366f1 }
    .email-body pre { background:#18181b;border-radius:10px;padding:18px 22px;margin:0 0 16px }
    .email-body pre code { background:none;border:none;color:#a5b4fc;font-size:13px;padding:0 }
    .email-body hr { border:none;border-top:1px solid #e4e4e7;margin:24px 0 }
    .email-body .btn { display:inline-block;padding:13px 30px;background:#6366f1;color:#fff !important;text-decoration:none !important;font-weight:600;font-size:14px;border-radius:9px;letter-spacing:0.1px;margin:4px 0 }
  </style>
</head>
<body style="margin:0;padding:0;background:#f0f1f5;-webkit-font-smoothing:antialiased">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f0f1f5;padding:40px 16px">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%">
        <tr><td style="padding:0 0 20px 0">${logoBlock}</td></tr>
      </table>
      <table width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background:#fff;border-radius:16px;border:1px solid #e4e4e7;overflow:hidden">
        <tr><td height="3" style="height:3px;font-size:0;line-height:0;background:linear-gradient(90deg,#6366f1,#818cf8 55%,#c7d2fe)">&#8203;</td></tr>
        <tr>
          <td class="email-body" style="padding:40px 48px 36px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif">
            ${bodyFormat === "html" ? htmlContent : plainContent}
          </td>
        </tr>
        <tr><td style="padding:0">${footerBlock}</td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`

  return (
    <form onSubmit={handleSubmit} className="space-y-5 bg-zinc-900 border border-zinc-800 rounded-2xl p-6">
      <SegmentPicker segment={segment} onChange={setSegment} />

      {/* Subject */}
      <div className="space-y-1.5">
        <label className="text-zinc-400 text-sm font-medium">Subject</label>
        <input
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          required
          placeholder="Important update from GenXQR"
          className="w-full bg-zinc-800 border border-zinc-700 text-white rounded-xl px-4 py-2.5 text-sm placeholder-zinc-600 focus:outline-none focus:ring-2 focus:ring-violet-500/40"
        />
      </div>

      {/* Body */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <label className="text-zinc-400 text-sm font-medium">Message Body</label>
          <div className="flex items-center gap-1 bg-zinc-800 rounded-lg p-1 border border-zinc-700">
            <button
              type="button"
              onClick={() => { setBodyFormat("text"); setShowPreview(false) }}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition ${bodyFormat === "text" ? "bg-zinc-600 text-white" : "text-zinc-400 hover:text-zinc-200"}`}
            >
              <Code size={11} /> Plain text
            </button>
            <button
              type="button"
              onClick={() => setBodyFormat("html")}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition ${bodyFormat === "html" ? "bg-zinc-600 text-white" : "text-zinc-400 hover:text-zinc-200"}`}
            >
              <span className="font-bold">&lt;/&gt;</span> HTML
            </button>
          </div>
        </div>

        {bodyFormat === "html" && (
          <div className="flex gap-2 mb-1">
            <button
              type="button"
              onClick={() => setShowPreview(false)}
              className={`text-xs px-3 py-1 rounded-lg transition ${!showPreview ? "bg-zinc-700 text-white" : "text-zinc-500 hover:text-zinc-300"}`}
            >
              Editor
            </button>
            <button
              type="button"
              onClick={() => setShowPreview(true)}
              className={`flex items-center gap-1 text-xs px-3 py-1 rounded-lg transition ${showPreview ? "bg-zinc-700 text-white" : "text-zinc-500 hover:text-zinc-300"}`}
            >
              <Eye size={11} /> Preview
            </button>
          </div>
        )}

        {!showPreview ? (
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            required
            rows={bodyFormat === "html" ? 14 : 8}
            placeholder={bodyFormat === "html" ? "<h2>Hello!</h2>\n<p>We have an exciting update…</p>" : "Write your announcement here…"}
            spellCheck={bodyFormat === "text"}
            className="w-full bg-zinc-800 border border-zinc-700 text-white rounded-xl px-4 py-3 text-sm placeholder-zinc-600 focus:outline-none focus:ring-2 focus:ring-violet-500/40 resize-none font-mono"
          />
        ) : (
          <iframe
            srcDoc={previewHtml}
            title="Email preview"
            className="w-full rounded-xl border border-zinc-700 bg-white"
            style={{ height: 420 }}
            sandbox="allow-same-origin"
          />
        )}

        <p className="text-zinc-600 text-xs">{body.length} / 50,000 characters</p>
      </div>

      {/* Mode toggle */}
      <div className="flex gap-3 p-4 bg-zinc-800 rounded-xl border border-zinc-700">
        <div className="flex flex-col gap-2 flex-1">
          <div className="flex gap-2">
            {(["preview", "live"] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMode(m)}
                className={`px-3 py-1.5 text-xs font-medium rounded-lg transition capitalize ${mode === m ? "bg-violet-600 text-white" : "bg-zinc-700 text-zinc-400 hover:text-zinc-200"}`}
              >
                {m === "preview" ? "Send Preview" : "Send Live"}
              </button>
            ))}
          </div>
          {mode === "preview" && (
            <input
              value={testEmail}
              onChange={(e) => setTestEmail(e.target.value)}
              placeholder="test@example.com (preview recipient)"
              className="bg-zinc-700 border border-zinc-600 text-white rounded-lg px-3 py-2 text-sm placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-violet-500/40"
            />
          )}
          {mode === "live" && (
            <p className="text-amber-400 text-xs flex items-center gap-1.5">
              <AlertTriangle size={12} /> This will send to ALL users in the selected segment.
            </p>
          )}
        </div>
      </div>

      <button
        type="submit"
        disabled={mutation.isPending || !subject.trim() || !body.trim() || (mode === "preview" && !testEmail.trim())}
        className="w-full flex items-center justify-center gap-2 py-3 bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-white font-medium rounded-xl transition"
      >
        {mutation.isPending ? <Loader2 size={16} className="animate-spin" /> : <Mail size={16} />}
        {mode === "preview" ? "Send Preview Email" : "Send to All Recipients"}
      </button>

      {mutation.error && (
        <div className="flex items-start gap-3 p-4 bg-red-500/10 border border-red-500/20 rounded-xl">
          <AlertTriangle className="text-red-400 mt-0.5 shrink-0" size={18} />
          <p className="text-red-300 text-sm">{(mutation.error as Error).message}</p>
        </div>
      )}

      {result && (
        <div className="flex items-start gap-3 p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-xl">
          <CheckCircle className="text-emerald-400 mt-0.5 shrink-0" size={18} />
          <div>
            <p className="text-emerald-300 font-medium text-sm">
              {result.preview
                ? `Preview sent to ${testEmail}`
                : `Broadcast sent: ${result.sent}${result.total !== undefined ? ` / ${result.total}` : ""} delivered`}
            </p>
            {!result.preview && result.total !== undefined && result.sent < result.total && (
              <p className="text-amber-400 text-xs mt-0.5">
                {result.total - result.sent} failed — check the Email Logs tab for details.
              </p>
            )}
          </div>
        </div>
      )}
    </form>
  )
}

// ─── In-app notification tab ───────────────────────────────────────────────────

const TYPE_COLORS: Record<NotificationType, string> = {
  SYSTEM:  "bg-zinc-700 text-zinc-200",
  FEATURE: "bg-violet-900/50 text-violet-300",
  BILLING: "bg-amber-900/40 text-amber-300",
  LIMIT:   "bg-red-900/40 text-red-300",
  TEAM:    "bg-emerald-900/40 text-emerald-300",
}

function InAppNotificationTab() {
  const [segment, setSegment]   = useState("all")
  const [type, setType]         = useState<NotificationType>("SYSTEM")
  const [title, setTitle]       = useState("")
  const [body, setBody]         = useState("")
  const [actionUrl, setActionUrl] = useState("")
  const [result, setResult]     = useState<{ created: number } | null>(null)

  const mutation = useMutation({
    mutationFn: () =>
      adminBroadcastNotification({
        segment,
        type,
        title:     title.trim(),
        body:      body.trim(),
        actionUrl: actionUrl.trim() || undefined,
      }),
    onSuccess: (data) => {
      setResult(data.data)
      // Clear form on success
      setTitle("")
      setBody("")
      setActionUrl("")
    },
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setResult(null)
    mutation.mutate()
  }

  // Live preview of what the notification will look like in the dashboard
  const selectedType = NOTIFICATION_TYPES.find((t) => t.value === type)

  return (
    <div className="space-y-6">
      {/* Info banner */}
      <div className="flex items-start gap-3 p-4 bg-blue-500/10 border border-blue-500/20 rounded-xl">
        <Info className="text-blue-400 mt-0.5 shrink-0" size={16} />
        <p className="text-blue-300 text-sm leading-relaxed">
          In-app notifications appear instantly in users' notification bell (🔔) inside their dashboard.
          They are delivered in real-time via polling and shown as an unread badge.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5 bg-zinc-900 border border-zinc-800 rounded-2xl p-6">
        <SegmentPicker segment={segment} onChange={setSegment} />

        {/* Type picker */}
        <div className="space-y-2">
          <label className="text-zinc-400 text-sm font-medium">Notification Type</label>
          <div className="flex flex-wrap gap-2">
            {NOTIFICATION_TYPES.map((t) => (
              <button
                key={t.value}
                type="button"
                onClick={() => setType(t.value)}
                className={`px-3 py-1.5 rounded-lg border text-xs font-medium transition ${
                  type === t.value
                    ? t.color + " border-current"
                    : "border-zinc-700 bg-zinc-800 text-zinc-400 hover:text-zinc-200"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {/* Title */}
        <div className="space-y-1.5">
          <label className="text-zinc-400 text-sm font-medium">
            Title <span className="text-zinc-600 font-normal">(max 100 chars)</span>
          </label>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value.slice(0, 100))}
            required
            placeholder="New feature available 🎉"
            className="w-full bg-zinc-800 border border-zinc-700 text-white rounded-xl px-4 py-2.5 text-sm placeholder-zinc-600 focus:outline-none focus:ring-2 focus:ring-violet-500/40"
          />
          <p className="text-zinc-600 text-xs text-right">{title.length} / 100</p>
        </div>

        {/* Body */}
        <div className="space-y-1.5">
          <label className="text-zinc-400 text-sm font-medium">
            Message <span className="text-zinc-600 font-normal">(max 2000 chars)</span>
          </label>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value.slice(0, 2000))}
            required
            rows={4}
            placeholder="We've just launched bulk QR export. Try it now from your dashboard."
            className="w-full bg-zinc-800 border border-zinc-700 text-white rounded-xl px-4 py-3 text-sm placeholder-zinc-600 focus:outline-none focus:ring-2 focus:ring-violet-500/40 resize-none"
          />
          <p className="text-zinc-600 text-xs text-right">{body.length} / 2000</p>
        </div>

        {/* Action URL (optional) */}
        <div className="space-y-1.5">
          <label className="text-zinc-400 text-sm font-medium">
            Action URL <span className="text-zinc-600 font-normal">(optional — adds "View" button)</span>
          </label>
          <div className="relative">
            <ExternalLink size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-500" />
            <input
              value={actionUrl}
              onChange={(e) => setActionUrl(e.target.value)}
              type="url"
              placeholder="https://genxqr.streamsnatcher.com/app/billing"
              className="w-full bg-zinc-800 border border-zinc-700 text-white rounded-xl pl-9 pr-4 py-2.5 text-sm placeholder-zinc-600 focus:outline-none focus:ring-2 focus:ring-violet-500/40"
            />
          </div>
        </div>

        {/* Live preview */}
        {(title || body) && (
          <div className="space-y-2">
            <label className="text-zinc-500 text-xs font-medium uppercase tracking-wide">Preview</label>
            <div className="bg-zinc-950 border border-zinc-700 rounded-xl p-4 space-y-1.5">
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-lg bg-zinc-800 flex items-center justify-center shrink-0 mt-0.5">
                  <Bell size={15} className="text-violet-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    {selectedType && (
                      <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-md ${TYPE_COLORS[type]}`}>
                        {selectedType.label.toUpperCase()}
                      </span>
                    )}
                    <span className="text-zinc-500 text-xs">just now</span>
                  </div>
                  <p className="text-white text-sm font-medium leading-snug">
                    {title || <span className="text-zinc-500 italic">Title will appear here</span>}
                  </p>
                  <p className="text-zinc-400 text-xs mt-1 leading-relaxed line-clamp-3">
                    {body || <span className="italic">Message body will appear here</span>}
                  </p>
                  {actionUrl && (
                    <span className="inline-flex items-center gap-1 mt-2 text-violet-400 text-xs font-medium">
                      <ExternalLink size={11} /> View
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        <button
          type="submit"
          disabled={mutation.isPending || !title.trim() || !body.trim()}
          className="w-full flex items-center justify-center gap-2 py-3 bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-white font-medium rounded-xl transition"
        >
          {mutation.isPending ? <Loader2 size={16} className="animate-spin" /> : <Bell size={16} />}
          Send In-App Notification
        </button>
      </form>

      {mutation.error && (
        <div className="flex items-start gap-3 p-4 bg-red-500/10 border border-red-500/20 rounded-xl">
          <AlertTriangle className="text-red-400 mt-0.5 shrink-0" size={18} />
          <p className="text-red-300 text-sm">{(mutation.error as Error).message}</p>
        </div>
      )}

      {result && (
        <div className="flex items-start gap-3 p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-xl">
          <CheckCircle className="text-emerald-400 mt-0.5 shrink-0" size={18} />
          <div>
            <p className="text-emerald-300 font-medium text-sm">
              Notification sent to {result.created} {result.created === 1 ? "user" : "users"}
            </p>
            <p className="text-zinc-400 text-xs mt-0.5">
              Recipients will see the bell badge update within 60 seconds.
            </p>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Page ──────────────────────────────────────────────────────────────────────

type Tab = "email" | "inapp"

export default function AdminBroadcastPage() {
  const [activeTab, setActiveTab] = useState<Tab>("email")

  const tabs: { id: Tab; label: string; icon: React.ReactNode; description: string }[] = [
    {
      id: "email",
      label: "Email Broadcast",
      icon: <Mail size={16} />,
      description: "Send an HTML or plain-text email to a user segment via the configured email provider.",
    },
    {
      id: "inapp",
      label: "In-App Notification",
      icon: <Bell size={16} />,
      description: "Push a notification directly into users' dashboard notification centre — no email required.",
    },
  ]

  return (
    <SuperAdminGuard>
      <div className="space-y-6 max-w-3xl">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold text-white mb-1">Broadcast</h1>
          <p className="text-zinc-500 text-sm">Send announcements to user segments via email or in-app notifications.</p>
        </div>

        {/* Tab bar */}
        <div className="flex gap-1 bg-zinc-900 border border-zinc-800 rounded-2xl p-1.5">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl text-sm font-medium transition ${
                activeTab === tab.id
                  ? "bg-violet-600 text-white shadow-md"
                  : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800"
              }`}
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </div>

        {/* Active tab description */}
        <p className="text-zinc-500 text-sm -mt-2 px-1">
          {tabs.find((t) => t.id === activeTab)?.description}
        </p>

        {/* Tab content */}
        {activeTab === "email"  && <EmailBroadcastTab />}
        {activeTab === "inapp" && <InAppNotificationTab />}
      </div>
    </SuperAdminGuard>
  )
}
