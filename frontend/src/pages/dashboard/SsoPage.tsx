import { useEffect, useState, type ReactNode } from "react"
import { useSearchParams } from "react-router-dom"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { KeyRound, Loader2, CheckCircle2, Copy, Check, ShieldCheck, Trash2, Link2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { FeatureLocked } from "@/components/PlanFeatureGate"
import { cn } from "@/lib/utils"
import {
  ApiError,
  deleteSsoConnection,
  getSsoSettings,
  linkSsoDirectory,
  saveSsoConnection,
  setSsoEnforced,
  verifySsoDomain,
  type SsoProvider,
} from "@/lib/api"

/**
 * Single sign-on (backend sso.service.ts): people at the company's email domain
 * sign in with Google Workspace or Microsoft Entra ID and join this account's
 * team. Steps: domain + provider → DNS TXT proof → (Microsoft) link directory.
 * The account's own setting, like billing.
 */

const PROVIDERS: { id: SsoProvider; label: string }[] = [
  { id: "google", label: "Google Workspace" },
  { id: "microsoft", label: "Microsoft Entra ID (Microsoft 365)" },
]

const LINK_ERRORS: Record<string, string> = {
  sso_link_wrong_account: "That Microsoft account isn't at your verified domain. Sign in with a work account at the domain.",
  sso_cancelled: "Linking was cancelled.",
  sso_state: "The link expired. Please try again.",
}

function CopyText({ value }: { value: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <button
      type="button"
      onClick={() => navigator.clipboard.writeText(value).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500) }).catch(() => {})}
      className="inline-flex items-center gap-1 text-xs text-violet-500 hover:text-violet-400"
      aria-label={`Copy ${value}`}
    >
      {copied ? <Check size={12} /> : <Copy size={12} />}
      {copied ? "Copied" : "Copy"}
    </button>
  )
}

function Step({ n, done, title, children }: { n: number; done: boolean; title: string; children?: ReactNode }) {
  return (
    <div className="flex gap-3">
      <span className={cn(
        "flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold",
        done ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400" : "bg-violet-500/15 text-violet-600 dark:text-violet-400",
      )}>
        {done ? <Check size={13} /> : n}
      </span>
      <div className="min-w-0 flex-1 space-y-3">
        <p className="text-sm font-medium text-zinc-900 dark:text-white">{title}</p>
        {children}
      </div>
    </div>
  )
}

const selectClass = "w-full h-10 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 text-sm text-zinc-900 dark:text-white"

export default function SsoPage() {
  const qc = useQueryClient()
  const [params, setParams] = useSearchParams()
  const { data, isLoading, error: loadError } = useQuery({ queryKey: ["sso"], queryFn: getSsoSettings })
  const settings = data?.data
  const c = settings?.connection ?? null

  const [domain, setDomain] = useState("")
  const [provider, setProvider] = useState<SsoProvider>("google")
  const [defaultRole, setDefaultRole] = useState<"EDITOR" | "VIEWER">("VIEWER")
  const [editing, setEditing] = useState(false)
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null)
  const [confirmRemove, setConfirmRemove] = useState(false)

  useEffect(() => {
    if (c && !editing) { setDomain(c.domain); setProvider(c.provider); setDefaultRole(c.defaultRole) }
  }, [c, editing])

  // Back from the Microsoft link round trip.
  useEffect(() => {
    if (params.get("linked")) setMessage({ kind: "ok", text: "Your Microsoft directory is linked." })
    const err = params.get("error")
    if (err) setMessage({ kind: "error", text: LINK_ERRORS[err] ?? "Linking failed. Please try again." })
    if (params.get("linked") || err) setParams({}, { replace: true })
  }, [params, setParams])

  const refresh = () => qc.invalidateQueries({ queryKey: ["sso"] })
  const fail = (err: unknown) => setMessage({ kind: "error", text: err instanceof ApiError ? err.message : "Something went wrong. Please try again." })

  const save = useMutation({
    mutationFn: () => saveSsoConnection({ domain, provider, defaultRole }),
    onSuccess: () => { setEditing(false); setMessage(null); refresh() },
    onError: fail,
  })
  const verify = useMutation({
    mutationFn: verifySsoDomain,
    onSuccess: () => { setMessage({ kind: "ok", text: "Domain verified." }); refresh() },
    onError: fail,
  })
  const link = useMutation({
    mutationFn: linkSsoDirectory,
    onSuccess: (res) => { window.location.href = res.data.url },
    onError: fail,
  })
  const enforce = useMutation({
    mutationFn: (on: boolean) => setSsoEnforced(on),
    onSuccess: (res, on) => {
      setMessage({ kind: "ok", text: on ? `SSO is now required. ${res.data.sessionsEnded} session${res.data.sessionsEnded === 1 ? "" : "s"} were signed out.` : "SSO is no longer required." })
      refresh()
    },
    onError: fail,
  })
  const remove = useMutation({
    mutationFn: deleteSsoConnection,
    onSuccess: () => { setConfirmRemove(false); setDomain(""); setMessage(null); refresh() },
    onError: fail,
  })

  const showForm = !c || editing
  const needsLink = c?.provider === "microsoft"

  return (
    <div className="space-y-6 animate-fade-in max-w-3xl">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold text-zinc-900 dark:text-white">Single sign-on</h1>
        <p className="text-zinc-500 text-sm mt-1">
          Let people at your company sign in with their Google Workspace or Microsoft work account. New people join your team automatically.
        </p>
      </div>

      {isLoading && <div className="flex items-center text-zinc-500 text-sm"><Loader2 size={18} className="animate-spin mr-2" /> Loading…</div>}
      {loadError && <p className="text-sm text-red-500">Could not load your SSO settings. Please refresh the page.</p>}

      {settings && !settings.available && !c && (
        <FeatureLocked feature="sso" title="Single sign-on" description="Your team signs in with Google Workspace or Microsoft Entra ID, joins your team automatically, and you can require it for everyone at your domain." />
      )}

      {message && (
        <p className={cn("rounded-xl border px-4 py-3 text-sm", message.kind === "ok"
          ? "border-emerald-500/30 bg-emerald-500/5 text-emerald-700 dark:text-emerald-300"
          : "border-red-500/30 bg-red-500/5 text-red-600 dark:text-red-400")}>
          {message.text}
        </p>
      )}

      {settings && (settings.available || c) && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center justify-between gap-2">
              <span className="flex items-center gap-2"><KeyRound size={16} className="text-violet-400" /> Set up</span>
              {c?.ready && <Badge variant="success">On</Badge>}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <Step n={1} done={!!c && !editing} title="Your company's email domain and provider">
              {showForm ? (
                <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); save.mutate() }}>
                  <div>
                    <label htmlFor="sso-domain" className="text-xs text-zinc-500">Email domain</label>
                    <Input id="sso-domain" placeholder="acme.com" value={domain} onChange={(e) => setDomain(e.target.value)} required />
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div>
                      <label htmlFor="sso-provider" className="text-xs text-zinc-500">Sign in with</label>
                      <select id="sso-provider" className={selectClass} value={provider} onChange={(e) => setProvider(e.target.value as SsoProvider)}>
                        {PROVIDERS.map((p) => (
                          <option key={p.id} value={p.id} disabled={!settings.providers[p.id]}>
                            {p.label}{settings.providers[p.id] ? "" : " (not available yet)"}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label htmlFor="sso-role" className="text-xs text-zinc-500">New people join your team as</label>
                      <select id="sso-role" className={selectClass} value={defaultRole} onChange={(e) => setDefaultRole(e.target.value as "EDITOR" | "VIEWER")}>
                        <option value="VIEWER">Viewer — sees codes and analytics</option>
                        <option value="EDITOR">Editor — also creates and edits codes</option>
                      </select>
                    </div>
                  </div>
                  {c && <p className="text-xs text-amber-600 dark:text-amber-400">Changing the domain or provider means verifying and linking again, and turns off "require SSO" until then.</p>}
                  <div className="flex gap-2">
                    <Button type="submit" className="h-9 text-sm" disabled={save.isPending || !settings.available}>
                      {save.isPending && <Loader2 size={14} className="animate-spin mr-1.5" />} Save
                    </Button>
                    {c && <Button type="button" variant="ghost" className="h-9 text-sm" onClick={() => setEditing(false)}>Cancel</Button>}
                  </div>
                </form>
              ) : c && (
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-zinc-600 dark:text-zinc-300">
                  <span className="font-mono">@{c.domain}</span>
                  <span>· {PROVIDERS.find((p) => p.id === c.provider)?.label}</span>
                  <span>· joins as {c.defaultRole.toLowerCase()}</span>
                  <button type="button" className="text-xs text-violet-500 hover:text-violet-400" onClick={() => setEditing(true)}>Change</button>
                </div>
              )}
            </Step>

            {c && !editing && (
              <Step n={2} done={c.verified} title="Prove you own the domain">
                {!c.verified && (
                  <>
                    <p className="text-xs text-zinc-500">Add this record where you manage DNS for {c.domain}, then check it. It can take a few minutes to appear.</p>
                    <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900 p-3 text-xs overflow-x-auto">
                      <table className="text-left">
                        <thead><tr className="text-zinc-500"><th className="pr-6 font-medium">Type</th><th className="pr-6 font-medium">Name</th><th className="font-medium">Value</th></tr></thead>
                        <tbody>
                          <tr className="font-mono text-zinc-900 dark:text-white align-top">
                            <td className="pr-6 py-1">TXT</td>
                            <td className="pr-6 py-1 break-all">{c.dns.name} <CopyText value={c.dns.name} /></td>
                            <td className="py-1 break-all">{c.dns.value} <CopyText value={c.dns.value} /></td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                    <Button variant="outline" className="h-9 text-sm gap-1.5" onClick={() => verify.mutate()} disabled={verify.isPending}>
                      {verify.isPending ? <Loader2 size={14} className="animate-spin" /> : <ShieldCheck size={14} />} Check DNS
                    </Button>
                  </>
                )}
              </Step>
            )}

            {c && !editing && needsLink && (
              <Step n={3} done={c.tenantLinked} title="Link your Microsoft directory">
                {c.verified && !c.tenantLinked && (
                  <>
                    <p className="text-xs text-zinc-500">Sign in once with your Microsoft work account at @{c.domain}. That tells us which company directory may sign in. Your IT admin may need to approve GenXQR the first time.</p>
                    <Button variant="outline" className="h-9 text-sm gap-1.5" onClick={() => link.mutate()} disabled={link.isPending}>
                      {link.isPending ? <Loader2 size={14} className="animate-spin" /> : <Link2 size={14} />} Sign in with Microsoft to link
                    </Button>
                  </>
                )}
              </Step>
            )}

            {c?.ready && !editing && (
              <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-4 text-sm text-emerald-700 dark:text-emerald-300 flex gap-2">
                <CheckCircle2 size={16} className="mt-0.5 shrink-0" />
                <p>Single sign-on is on. Anyone at @{c.domain} can sign in at genxqr.com/login → <strong>Sign in with SSO</strong>.</p>
              </div>
            )}
            {c && !settings.available && (
              <p className="text-sm text-amber-600 dark:text-amber-400">SSO is paused: your plan no longer includes it. Upgrade to Business to turn it back on.</p>
            )}
          </CardContent>
        </Card>
      )}

      {c && !editing && (
        <Card>
          <CardHeader><CardTitle className="text-base">Require SSO</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-zinc-500">
              Everyone at @{c.domain} must sign in through {c.provider === "google" ? "Google Workspace" : "Microsoft"} — passwords and password-reset emails stop working for them, and their current sessions end. You are never locked out: as the owner you can always sign in with your password.
            </p>
            <label className="flex items-center gap-3 text-sm text-zinc-900 dark:text-white">
              <input
                type="checkbox"
                className="h-4 w-4 accent-violet-600"
                checked={c.enforced}
                disabled={enforce.isPending || (!c.ready && !c.enforced)}
                onChange={(e) => enforce.mutate(e.target.checked)}
              />
              Require SSO for @{c.domain}
              {!c.ready && !c.enforced && <span className="text-xs text-zinc-500">(finish setup first)</span>}
            </label>
          </CardContent>
        </Card>
      )}

      {c && !editing && (
        <div className="flex items-center gap-3">
          {confirmRemove ? (
            <>
              <span className="text-sm text-zinc-600 dark:text-zinc-300">Turn off SSO for @{c.domain}? People keep their accounts and can reset a password.</span>
              <Button variant="destructive" className="h-8 text-xs" onClick={() => remove.mutate()} disabled={remove.isPending}>Turn off</Button>
              <Button variant="ghost" className="h-8 text-xs" onClick={() => setConfirmRemove(false)}>Cancel</Button>
            </>
          ) : (
            <Button variant="ghost" className="h-8 text-xs gap-1.5 text-red-500 hover:text-red-400" onClick={() => setConfirmRemove(true)}>
              <Trash2 size={13} /> Remove SSO
            </Button>
          )}
        </div>
      )}
    </div>
  )
}
