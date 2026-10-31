import { useMemo, useState, type ReactElement } from "react"
import { useQuery } from "@tanstack/react-query"
import { Activity, ShieldCheck, Download, Loader2, QrCode, Users, Settings, Key, Webhook, LifeBuoy, ChevronLeft, ChevronRight } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { FeatureLocked, usePlanFeature } from "@/components/PlanFeatureGate"
import { useWorkspace } from "@/hooks/useWorkspace"
import { cn } from "@/lib/utils"
import {
  ApiError,
  downloadActivityCsv,
  getActivity,
  getActivityActors,
  type ActivityEntry,
  type ActivityFilters,
  type ActivityScope,
} from "@/lib/api"

/**
 * Activity (backend activity.service.ts). Two views over the audit log:
 * - Security: your own sign-ins, password, API keys, webhooks — every plan.
 * - Team activity: every change to the workspace's codes, team and settings,
 *   by whom — Pro and above, owner/admin only.
 * IPs arrive masked; the server decides who sees what.
 */

const PAGE_SIZE = 50

const RANGES = [
  { id: "7", label: "Last 7 days", days: 7 },
  { id: "30", label: "Last 30 days", days: 30 },
  { id: "90", label: "Last 90 days", days: 90 },
  { id: "365", label: "Last 12 months", days: 365 },
  { id: "all", label: "All time", days: null },
] as const

const CATEGORY_OPTIONS: Record<ActivityScope, { id: string; label: string }[]> = {
  security: [
    { id: "auth", label: "Sign-ins & account" },
    { id: "apikey", label: "API keys" },
    { id: "webhook", label: "Webhooks" },
  ],
  team: [
    { id: "qr", label: "QR codes" },
    { id: "team", label: "Team" },
    { id: "settings", label: "Settings" },
  ],
}

const CATEGORY_ICON: Record<string, ReactElement> = {
  auth: <ShieldCheck size={15} />,
  apikey: <Key size={15} />,
  webhook: <Webhook size={15} />,
  qr: <QrCode size={15} />,
  team: <Users size={15} />,
  settings: <Settings size={15} />,
}

const str = (v: unknown) => (typeof v === "string" && v.length > 0 ? v : null)
const quoted = (v: unknown) => (str(v) ? ` “${str(v)}”` : "")

/** A sentence for one entry. Unknown actions fall back to their code, so a new one is never hidden. */
function describe(e: ActivityEntry): string {
  const m = e.metadata ?? {}
  const base = ((): string => {
    switch (e.action) {
      case "auth.login": return "Signed in"
      case "auth.login.google": return "Signed in with Google"
      case "auth.login.sso": return `Signed in with SSO${str(m.provider) === "microsoft" ? " (Microsoft)" : str(m.provider) === "google" ? " (Google Workspace)" : ""}`
      case "auth.logout": return "Signed out"
      case "auth.register": return "Created the account"
      case "auth.password.change": return "Changed the password"
      case "auth.password.reset": return "Reset the password from an email link"
      case "auth.profile.update": return Array.isArray(m.fields) && m.fields.length > 0 ? `Updated profile (${m.fields.join(", ")})` : "Updated profile"
      case "apikey.create": return `Created API key${quoted(m.name)}`
      case "apikey.revoke": return "Revoked an API key"
      case "apikey.delete": return "Deleted an API key"
      case "webhook.create": return `Added a webhook${str(m.url) ? ` to ${str(m.url)}` : ""}`
      case "webhook.update": return Array.isArray(m.changed) && m.changed.length > 0 ? `Changed a webhook (${m.changed.join(", ")})` : "Changed a webhook"
      case "webhook.delete": return "Deleted a webhook"
      case "qr.create": return `Created code${quoted(m.name)}`
      case "qr.update": return `Edited code${quoted(m.name)}`
      case "qr.delete": return `Deleted code${quoted(m.name)}`
      case "qr.activate": return "Turned a code on"
      case "qr.deactivate": return "Turned a code off"
      case "qr.duplicate": return `Duplicated a code${str(m.name) ? ` as “${str(m.name)}”` : ""}`
      case "qr.bulk_create": return `Bulk-created ${Number(m.created) || 0} code${Number(m.created) === 1 ? "" : "s"}${Number(m.failed) > 0 ? ` (${Number(m.failed)} rows failed)` : ""}`
      case "qr.routing.add": return "Added a smart-routing rule"
      case "qr.routing.update": return "Changed a smart-routing rule"
      case "qr.routing.remove": return "Removed a smart-routing rule"
      case "qr.abtest.update": return m.abTestEnabled === false ? "Turned off an A/B test" : "Changed an A/B test"
      case "qr.abvariant.add": return "Added an A/B variant"
      case "qr.abvariant.update": return "Changed an A/B variant"
      case "qr.abvariant.remove": return "Removed an A/B variant"
      case "team.invite.create": return `Invited ${str(m.email) ?? "someone"}${str(m.role) ? ` as ${String(m.role).toLowerCase()}` : ""}`
      case "team.invite.resend": return `Re-sent the invite to ${str(m.email) ?? "someone"}`
      case "team.invite.cancel": return `Cancelled the invite to ${str(m.email) ?? "someone"}`
      case "team.invite.accept": return "Joined the team"
      case "team.member.role": return `Changed ${str(m.memberEmail) ?? "a member"}'s role${str(m.to) ? ` to ${String(m.to).toLowerCase()}` : ""}`
      case "team.member.remove": return `Removed ${str(m.memberEmail) ?? "a member"} from the team`
      case "team.member.leave": return "Left the team"
      case "team.member.join_sso": return `Joined the team through SSO${str(m.role) ? ` as ${String(m.role).toLowerCase()}` : ""}`
      case "sso.configure": return `Set up single sign-on for ${str(m.domain) ?? "a domain"}`
      case "sso.verify": return `Verified ${str(m.domain) ?? "the SSO domain"}`
      case "sso.link": return "Linked the Microsoft directory for SSO"
      case "sso.enforce": return `Required SSO for ${str(m.domain) ?? "the domain"}`
      case "sso.unenforce": return "Stopped requiring SSO"
      case "sso.remove": return "Removed single sign-on"
      case "branding.update": return "Changed scan-page branding"
      case "domain.add": return `Added custom domain${str(m.hostname) ? ` ${str(m.hostname)}` : ""}`
      case "domain.remove": return "Removed a custom domain"
      default: return e.action
    }
  })()
  return m.via === "api" ? `${base} (via API)` : base
}

function actorName(e: ActivityEntry): string {
  if (e.actor.kind === "support") return "GenXQR support"
  if (e.actor.kind === "deleted") return "Deleted account"
  return e.actor.name || e.actor.email
}

function ActivityRow({ e, showActor }: { e: ActivityEntry; showActor: boolean }) {
  const when = new Date(e.createdAt)
  const where = [e.device, e.ip].filter(Boolean).join(" · ")
  return (
    <li className="flex gap-3 px-5 py-3.5 border-b border-zinc-200 dark:border-zinc-800 last:border-0">
      <span className={cn(
        "mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg",
        e.actor.kind === "support" ? "bg-amber-500/10 text-amber-500" : "bg-violet-500/10 text-violet-500",
      )}>
        {e.actor.kind === "support" ? <LifeBuoy size={15} /> : CATEGORY_ICON[e.category] ?? <Activity size={15} />}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm text-zinc-900 dark:text-white break-words">
          {showActor && <span className="font-medium">{actorName(e)} </span>}
          <span className={cn(showActor && "text-zinc-600 dark:text-zinc-300")}>
            {showActor ? describe(e).charAt(0).toLowerCase() + describe(e).slice(1) : describe(e)}
          </span>
        </p>
        <p className="mt-0.5 text-xs text-zinc-500">
          <time dateTime={e.createdAt} title={when.toString()}>{when.toLocaleString()}</time>
          {where && <> · {where}</>}
          {!showActor && e.actor.kind === "support" && <> · by GenXQR support</>}
        </p>
      </div>
    </li>
  )
}

const selectClass = "h-9 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 text-sm text-zinc-900 dark:text-white"

function ActivityList({ scope }: { scope: ActivityScope }) {
  const [range, setRange] = useState<(typeof RANGES)[number]["id"]>("30")
  const [category, setCategory] = useState("")
  const [actorId, setActorId] = useState("")
  const [page, setPage] = useState(1)
  const [exporting, setExporting] = useState(false)
  const [exportError, setExportError] = useState<string | null>(null)

  // Computed once per range change, so paging doesn't shift the window.
  const filters = useMemo<ActivityFilters>(() => {
    const days = RANGES.find((r) => r.id === range)?.days ?? null
    return {
      category: category || undefined,
      actorId: scope === "team" && actorId ? actorId : undefined,
      from: days ? new Date(Date.now() - days * 86_400_000).toISOString() : undefined,
    }
  }, [range, category, actorId, scope])

  const { data, isLoading, error } = useQuery({
    queryKey: ["activity", scope, filters, page],
    queryFn: () => getActivity(scope, filters, page, PAGE_SIZE),
    placeholderData: (prev) => prev,
  })
  const actors = useQuery({ queryKey: ["activity-actors"], queryFn: getActivityActors, enabled: scope === "team" })

  const result = data?.data
  const pages = result ? Math.max(1, Math.ceil(result.total / result.limit)) : 1
  const reset = <T,>(set: (v: T) => void) => (v: T) => { set(v); setPage(1) }

  const exportCsv = async () => {
    setExporting(true)
    setExportError(null)
    try {
      await downloadActivityCsv(scope, filters)
    } catch {
      setExportError("Could not export. Please try again.")
    } finally {
      setExporting(false)
    }
  }

  if (error instanceof ApiError && error.status === 403) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-sm text-zinc-500">{error.message}</CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <select aria-label="Time range" value={range} onChange={(e) => reset(setRange)(e.target.value as typeof range)} className={selectClass}>
          {RANGES.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
        </select>
        <select aria-label="Type" value={category} onChange={(e) => reset(setCategory)(e.target.value)} className={selectClass}>
          <option value="">Everything</option>
          {CATEGORY_OPTIONS[scope].map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
        </select>
        {scope === "team" && (actors.data?.data.length ?? 0) > 1 && (
          <select aria-label="Person" value={actorId} onChange={(e) => reset(setActorId)(e.target.value)} className={selectClass}>
            <option value="">Everyone</option>
            {actors.data?.data.map((a) => <option key={a.id} value={a.id}>{a.name || a.email}</option>)}
          </select>
        )}
        <Button variant="outline" className="h-9 text-sm gap-1.5 ml-auto" onClick={exportCsv} disabled={exporting || !result || result.total === 0}>
          {exporting ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
          Export CSV
        </Button>
      </div>
      {exportError && <p className="text-sm text-red-500">{exportError}</p>}

      <Card>
        <CardContent className="p-0">
          {isLoading && (
            <div className="flex items-center px-5 py-6 text-sm text-zinc-500"><Loader2 size={16} className="animate-spin mr-2" /> Loading…</div>
          )}
          {error && !(error instanceof ApiError && error.status === 403) && (
            <p className="px-5 py-6 text-sm text-red-500">Could not load activity. Please refresh the page.</p>
          )}
          {result && result.items.length === 0 && (
            <p className="px-5 py-10 text-center text-sm text-zinc-500">Nothing in this period.</p>
          )}
          {result && result.items.length > 0 && (
            <ul>{result.items.map((e) => <ActivityRow key={e.id} e={e} showActor={scope === "team"} />)}</ul>
          )}
        </CardContent>
      </Card>

      {result && pages > 1 && (
        <div className="flex items-center justify-between text-sm text-zinc-500">
          <span>Page {result.page} of {pages} · {result.total.toLocaleString()} entries</span>
          <div className="flex gap-2">
            <Button variant="outline" className="h-8 px-2.5" onClick={() => setPage((p) => p - 1)} disabled={page <= 1} aria-label="Previous page"><ChevronLeft size={15} /></Button>
            <Button variant="outline" className="h-8 px-2.5" onClick={() => setPage((p) => p + 1)} disabled={page >= pages} aria-label="Next page"><ChevronRight size={15} /></Button>
          </div>
        </div>
      )}
    </div>
  )
}

export default function ActivityPage() {
  const ws = useWorkspace()
  const canSeeTeam = ws.can("team:manage")
  const [tab, setTab] = useState<ActivityScope>(ws.isPersonal ? "security" : "team")
  const current: ActivityScope = tab === "team" && !canSeeTeam ? "security" : tab
  // Your own plan decides only in your own workspace; in someone else's the
  // owner's plan applies and the server's answer is shown instead.
  const teamFeature = usePlanFeature("activityLog")
  const teamLocked = ws.isPersonal && !teamFeature.isLoading && !teamFeature.allowed

  const tabs: { id: ActivityScope; label: string; hint: string }[] = [
    { id: "security", label: "Security", hint: "Your sign-ins, password, API keys and webhooks." },
    ...(canSeeTeam ? [{ id: "team" as const, label: "Team activity", hint: ws.isPersonal ? "Every change to your codes, team and settings, and who made it." : "Every change in this workspace, and who made it." }] : []),
  ]

  return (
    <div className="space-y-6 animate-fade-in max-w-4xl">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold text-zinc-900 dark:text-white">Activity</h1>
        <p className="text-zinc-500 text-sm mt-1">{tabs.find((t) => t.id === current)?.hint}</p>
      </div>

      {tabs.length > 1 && (
        <div className="flex gap-1" role="tablist">
          {tabs.map((t) => (
            <button
              key={t.id}
              role="tab"
              aria-selected={current === t.id}
              onClick={() => setTab(t.id)}
              className={cn(
                "px-3 py-1.5 rounded-lg text-sm font-medium transition-colors",
                current === t.id
                  ? "bg-violet-500/15 text-violet-600 dark:text-violet-400 border border-violet-500/30"
                  : "text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 border border-transparent",
              )}
            >
              {t.label}
            </button>
          ))}
        </div>
      )}

      {current === "team" && teamLocked ? (
        <FeatureLocked
          feature="activityLog"
          title="Team activity log"
          description="See every change to your codes, team and settings — who made it and when — and export it as CSV."
        />
      ) : (
        <ActivityList key={`${current}:${ws.current?.ownerId ?? ""}`} scope={current} />
      )}
      <p className="text-xs text-zinc-500">Entries are kept for 3 years. IP addresses are shortened to the network (the last part is hidden).</p>
    </div>
  )
}
