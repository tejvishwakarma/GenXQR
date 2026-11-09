import { useState, type ReactNode } from "react"
import { Link, useNavigate } from "react-router-dom"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Briefcase, Plus, Loader2, ArrowRight, Trash2, Link2, Copy, Check, Pencil, Upload, X, Sparkles } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { useWorkspace } from "@/hooks/useWorkspace"
import { cn } from "@/lib/utils"
import {
  ApiError,
  createAgencyClient,
  deleteAgencyClient,
  getAgencyClients,
  setAgencyClientReport,
  updateAgencyClient,
  uploadFile,
  type AgencyClient,
  type AgencyClientList,
  type AgencyClientCaps,
  type AgencyClientFeatures,
} from "@/lib/api"

/**
 * Agency clients (backend agency.service.ts). Each client is a workspace the
 * agency switches into; the agency gives it caps out of the plan's pool, sets
 * the brand its scan pages show, and can share an agency-branded report.
 */

const DEFAULT_CAPS: AgencyClientCaps = { maxCodes: 100, maxScansPerMonth: 20_000, maxDomains: 1, maxStorageGB: 2 }
const DEFAULT_FEATURES: AgencyClientFeatures = { abTesting: true, smartRouting: true, bulkGeneration: true }
// No "Scans / month" field: Agency and Enterprise have unlimited scans (9 Nov 2026), so
// the backend ignores a client's scan cap (billing.service clientLimits). maxScansPerMonth
// is still sent (DEFAULT_CAPS) in case a plan that caps scans can ever have clients.
const CAP_FIELDS: { key: keyof AgencyClientCaps; label: string }[] = [
  { key: "maxCodes", label: "QR codes" },
  { key: "maxDomains", label: "Custom domains" },
  { key: "maxStorageGB", label: "Storage (GB)" },
]
const FEATURE_FIELDS: { key: keyof AgencyClientFeatures; label: string }[] = [
  { key: "abTesting", label: "A/B testing" },
  { key: "smartRouting", label: "Smart routing" },
  { key: "bulkGeneration", label: "Bulk generation" },
]

const n = (v: number) => v.toLocaleString("en-US")
const errorText = (err: unknown) => (err instanceof ApiError ? err.message : "Something went wrong. Please try again.")
const reportUrl = (token: string) => `${window.location.origin}/l/report/${token}`

function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <button
      type="button"
      onClick={() => navigator.clipboard.writeText(value).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500) }).catch(() => {})}
      className="inline-flex items-center gap-1 text-xs text-violet-500 hover:text-violet-400"
    >
      {copied ? <Check size={12} /> : <Copy size={12} />} {copied ? "Copied" : "Copy link"}
    </button>
  )
}

function CapsAndFeatures({
  caps, features, onCaps, onFeatures,
}: {
  caps: AgencyClientCaps
  features: AgencyClientFeatures
  onCaps: (c: AgencyClientCaps) => void
  onFeatures: (f: AgencyClientFeatures) => void
}) {
  return (
    <>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {CAP_FIELDS.map((f) => (
          <label key={f.key} className="text-xs text-zinc-500 space-y-1">
            <span>{f.label}</span>
            <Input
              type="number"
              min={f.key === "maxCodes" ? 1 : 0}
              value={caps[f.key]}
              onChange={(e) => onCaps({ ...caps, [f.key]: Math.max(0, Math.floor(Number(e.target.value) || 0)) })}
            />
          </label>
        ))}
      </div>
      <div className="flex flex-wrap gap-x-5 gap-y-2">
        {FEATURE_FIELDS.map((f) => (
          <label key={f.key} className="flex items-center gap-2 text-sm text-zinc-700 dark:text-zinc-300">
            <input
              type="checkbox"
              className="h-4 w-4 accent-violet-600"
              checked={features[f.key]}
              onChange={(e) => onFeatures({ ...features, [f.key]: e.target.checked })}
            />
            {f.label}
          </label>
        ))}
      </div>
    </>
  )
}

function Meter({ label, used, cap }: { label: string; used: number; cap: number | "unlimited" }) {
  if (cap === "unlimited") {
    return (
      <div className="min-w-0">
        <div className="flex justify-between text-xs text-zinc-500"><span>{label}</span><span>{n(used)} / Unlimited</span></div>
        <div className="mt-1 h-1.5 rounded-full bg-zinc-200 dark:bg-zinc-800" />
      </div>
    )
  }
  const pct = cap > 0 ? Math.min(100, Math.round((used / cap) * 100)) : 0
  return (
    <div className="min-w-0">
      <div className="flex justify-between text-xs text-zinc-500"><span>{label}</span><span>{n(used)} / {n(cap)}</span></div>
      <div className="mt-1 h-1.5 rounded-full bg-zinc-200 dark:bg-zinc-800 overflow-hidden">
        <div className={cn("h-full rounded-full", pct >= 100 ? "bg-red-500" : pct >= 80 ? "bg-amber-500" : "bg-violet-500")} style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}

function ClientRow({ c, onError }: { c: AgencyClient; onError: (msg: string) => void }) {
  const qc = useQueryClient()
  const navigate = useNavigate()
  const ws = useWorkspace()
  const [editing, setEditing] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [name, setName] = useState(c.name)
  const [brandName, setBrandName] = useState(c.brandName ?? "")
  const [brandLogoUrl, setBrandLogoUrl] = useState<string | null>(c.brandLogoUrl)
  const [caps, setCaps] = useState(c.caps)
  const [features, setFeatures] = useState(c.features)
  const [uploading, setUploading] = useState(false)
  const refresh = () => qc.invalidateQueries({ queryKey: ["agency-clients"] })

  const save = useMutation({
    mutationFn: () => updateAgencyClient(c.id, { name, brandName: brandName.trim(), brandLogoUrl: brandLogoUrl ?? "", ...caps, features }),
    onSuccess: () => { setEditing(false); refresh(); qc.invalidateQueries({ queryKey: ["workspaces"] }) },
    onError: (e) => onError(errorText(e)),
  })
  const report = useMutation({
    mutationFn: (enabled: boolean) => setAgencyClientReport(c.id, enabled),
    onSuccess: refresh,
    onError: (e) => onError(errorText(e)),
  })
  const remove = useMutation({
    mutationFn: () => deleteAgencyClient(c.id),
    onSuccess: () => { refresh(); qc.invalidateQueries({ queryKey: ["workspaces"] }) },
    onError: (e) => onError(errorText(e)),
  })

  const uploadLogo = async (file: File) => {
    if (file.size > 2 * 1024 * 1024) return onError("Logo must be 2 MB or smaller.")
    setUploading(true)
    try {
      setBrandLogoUrl((await uploadFile(file, "image")).tempUrl)
    } catch (e) {
      onError(errorText(e))
    } finally {
      setUploading(false)
    }
  }

  const open = () => {
    ws.switchTo(c.workspaceId)
    navigate("/app/dashboard")
  }

  return (
    <li className="px-5 py-4 border-b border-zinc-200 dark:border-zinc-800 last:border-0 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          {c.brandLogoUrl
            ? <img src={c.brandLogoUrl} alt="" className="h-9 w-9 rounded-lg object-contain bg-white border border-zinc-200 dark:border-zinc-700" />
            : <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-violet-500/10 text-violet-500 text-sm font-semibold">{c.name.slice(0, 1).toUpperCase()}</span>}
          <div className="min-w-0">
            <p className="font-medium text-zinc-900 dark:text-white truncate">{c.name}</p>
            <p className="text-xs text-zinc-500">{c.brandName ? `Scan pages show “${c.brandName}”` : "Scan pages show GenXQR until you set a brand name"}</p>
          </div>
          {!c.active && <Badge variant="warning">Paused — not covered by your plan</Badge>}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button className="h-8 text-xs px-3 gap-1.5" onClick={open} disabled={!c.active}>
            Open workspace <ArrowRight size={13} />
          </Button>
          <Button variant="outline" className="h-8 text-xs px-3 gap-1.5" onClick={() => setEditing((v) => !v)}>
            {editing ? <X size={13} /> : <Pencil size={13} />} {editing ? "Close" : "Edit"}
          </Button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Meter label="QR codes" used={c.usage.codes} cap={c.caps.maxCodes} />
        <Meter label="Scans this month" used={c.usage.scansThisMonth} cap="unlimited" />
        <Meter label="Custom domains" used={c.usage.domains} cap={c.caps.maxDomains} />
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs">
        <span className="flex items-center gap-1.5 text-zinc-500"><Link2 size={12} /> Client report:</span>
        {c.reportToken ? (
          <>
            <a href={reportUrl(c.reportToken)} target="_blank" rel="noreferrer" className="font-mono text-violet-500 hover:underline break-all">{reportUrl(c.reportToken)}</a>
            <CopyButton value={reportUrl(c.reportToken)} />
            <button type="button" className="text-zinc-500 hover:text-zinc-300" onClick={() => report.mutate(true)}>New link</button>
            <button type="button" className="text-red-500 hover:text-red-400" onClick={() => report.mutate(false)}>Turn off</button>
          </>
        ) : (
          <button type="button" className="text-violet-500 hover:text-violet-400" onClick={() => report.mutate(true)} disabled={report.isPending}>
            Create a share link
          </button>
        )}
      </div>

      {editing && (
        <form
          className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/50 p-4 space-y-4"
          onSubmit={(e) => { e.preventDefault(); save.mutate() }}
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-xs text-zinc-500 space-y-1">
              <span>Client name (for you)</span>
              <Input value={name} onChange={(e) => setName(e.target.value)} required maxLength={80} />
            </label>
            <label className="text-xs text-zinc-500 space-y-1">
              <span>Brand on its scan pages</span>
              <Input value={brandName} onChange={(e) => setBrandName(e.target.value)} maxLength={60} placeholder="e.g. Blue Cafe" />
            </label>
          </div>
          <div className="flex flex-wrap items-center gap-3 text-xs text-zinc-500">
            <span>Logo on its scan pages:</span>
            {brandLogoUrl && <img src={brandLogoUrl} alt="" className="h-8 max-w-[120px] object-contain bg-white rounded border border-zinc-200" />}
            <label className="inline-flex items-center gap-1.5 cursor-pointer text-violet-500 hover:text-violet-400">
              {uploading ? <Loader2 size={13} className="animate-spin" /> : <Upload size={13} />}
              {brandLogoUrl ? "Replace" : "Upload"}
              <input type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void uploadLogo(f); e.target.value = "" }} />
            </label>
            {brandLogoUrl && <button type="button" className="text-zinc-500 hover:text-red-500" onClick={() => setBrandLogoUrl(null)}>Remove</button>}
          </div>
          <CapsAndFeatures caps={caps} features={features} onCaps={setCaps} onFeatures={setFeatures} />
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Button type="submit" className="h-9 text-sm" disabled={save.isPending || uploading}>
              {save.isPending && <Loader2 size={14} className="animate-spin mr-1.5" />} Save
            </Button>
            {confirmDelete ? (
              <span className="flex flex-wrap items-center gap-2 text-xs">
                <span className="text-red-500">Delete {c.name} and all its codes, scans and domains? This can't be undone.</span>
                <Button type="button" variant="destructive" className="h-8 text-xs" onClick={() => remove.mutate()} disabled={remove.isPending}>Delete client</Button>
                <Button type="button" variant="ghost" className="h-8 text-xs" onClick={() => setConfirmDelete(false)}>Cancel</Button>
              </span>
            ) : (
              <Button type="button" variant="ghost" className="h-8 text-xs gap-1.5 text-red-500 hover:text-red-400" onClick={() => setConfirmDelete(true)}>
                <Trash2 size={13} /> Delete client
              </Button>
            )}
          </div>
        </form>
      )}
    </li>
  )
}

function PoolSummary({ clients, pool }: { clients: AgencyClient[]; pool: NonNullable<AgencyClientList["pool"]> }) {
  const sum = (k: keyof AgencyClientCaps) => clients.reduce((t, c) => t + c.caps[k], 0)
  const items: { label: string; given: number; total: number; unit?: string }[] = [
    { label: "Clients", given: clients.length, total: pool.clients },
    { label: "QR codes given", given: sum("maxCodes"), total: pool.codes },
    { label: "Domains given", given: sum("maxDomains"), total: pool.domains },
    { label: "Storage given", given: sum("maxStorageGB"), total: pool.storageGB, unit: " GB" },
  ]
  return (
    <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
      <Card>
        <CardContent className="p-4">
          <p className="text-xs text-zinc-500">Scans / month</p>
          <p className="mt-1 text-lg font-semibold text-zinc-900 dark:text-white">Unlimited</p>
        </CardContent>
      </Card>
      {items.map((i) => (
        <Card key={i.label}>
          <CardContent className="p-4">
            <p className="text-xs text-zinc-500">{i.label}</p>
            <p className="mt-1 text-lg font-semibold text-zinc-900 dark:text-white">{n(i.given)}{i.unit}<span className="text-sm font-normal text-zinc-500"> / {n(i.total)}{i.unit}</span></p>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}

function Section({ title, children }: { title: ReactNode; children: ReactNode }) {
  return (
    <Card>
      <CardHeader><CardTitle className="text-base flex items-center gap-2">{title}</CardTitle></CardHeader>
      <CardContent className="space-y-4">{children}</CardContent>
    </Card>
  )
}

export default function ClientsPage() {
  const qc = useQueryClient()
  const { data, isLoading, error } = useQuery({ queryKey: ["agency-clients"], queryFn: getAgencyClients })
  const [message, setMessage] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  const [name, setName] = useState("")
  const [caps, setCaps] = useState(DEFAULT_CAPS)
  const [features, setFeatures] = useState(DEFAULT_FEATURES)

  const create = useMutation({
    mutationFn: () => createAgencyClient({ name: name.trim(), ...caps, features }),
    onSuccess: () => {
      setAdding(false); setName(""); setCaps(DEFAULT_CAPS); setFeatures(DEFAULT_FEATURES); setMessage(null)
      qc.invalidateQueries({ queryKey: ["agency-clients"] })
      qc.invalidateQueries({ queryKey: ["workspaces"] })
    },
    onError: (e) => setMessage(errorText(e)),
  })

  const list = data?.data
  const locked = error instanceof ApiError && error.status === 403
  const full = !!list?.pool && list.clients.length >= list.pool.clients

  return (
    <div className="space-y-6 animate-fade-in max-w-5xl">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold text-zinc-900 dark:text-white">Clients</h1>
        <p className="text-zinc-500 text-sm mt-1">
          Run each client&apos;s QR codes in its own workspace, with its own brand and domain on scan pages. Share an analytics report under your agency&apos;s brand.
        </p>
      </div>

      {isLoading && <div className="flex items-center text-zinc-500 text-sm"><Loader2 size={18} className="animate-spin mr-2" /> Loading…</div>}
      {error && !locked && <p className="text-sm text-red-500">Could not load your clients. Please refresh the page.</p>}

      {(locked || (list && !list.pool && list.clients.length === 0)) && (
        <Card>
          <CardContent className="py-10 text-center space-y-3">
            <Briefcase size={28} className="text-zinc-400 mx-auto" />
            <p className="text-zinc-900 dark:text-white font-semibold">Managing clients is part of the Agency plan</p>
            <p className="text-zinc-500 text-sm max-w-md mx-auto">Up to 15 clients, each with its own codes, brand and custom domain, sharing one pool of 5,000 codes, with unlimited scans.</p>
            <Link to="/app/billing" className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-violet-600 hover:bg-violet-500 text-white text-sm font-semibold transition-colors">
              <Sparkles size={14} /> See plans
            </Link>
          </CardContent>
        </Card>
      )}

      {list?.pool && <PoolSummary clients={list.clients} pool={list.pool} />}

      {message && <p className="rounded-xl border border-red-500/30 bg-red-500/5 px-4 py-3 text-sm text-red-600 dark:text-red-400">{message}</p>}

      {list?.pool && (
        adding ? (
          <Section title={<><Plus size={16} className="text-violet-400" /> New client</>}>
            <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); create.mutate() }}>
              <label className="block text-xs text-zinc-500 space-y-1">
                <span>Client name</span>
                <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Blue Cafe" required maxLength={80} />
              </label>
              <p className="text-xs text-zinc-500">What this client gets from your plan. You can change it any time.</p>
              <CapsAndFeatures caps={caps} features={features} onCaps={setCaps} onFeatures={setFeatures} />
              <div className="flex gap-2">
                <Button type="submit" className="h-9 text-sm" disabled={create.isPending}>
                  {create.isPending && <Loader2 size={14} className="animate-spin mr-1.5" />} Add client
                </Button>
                <Button type="button" variant="ghost" className="h-9 text-sm" onClick={() => setAdding(false)}>Cancel</Button>
              </div>
            </form>
          </Section>
        ) : (
          <div className="flex items-center gap-3">
            <Button className="h-9 text-sm gap-1.5" onClick={() => setAdding(true)} disabled={full}>
              <Plus size={14} /> Add client
            </Button>
            {full && <span className="text-xs text-zinc-500">You&apos;ve added all {list.pool.clients} clients your plan includes.</span>}
          </div>
        )
      )}

      {list && list.clients.length > 0 && (
        <Card>
          <CardContent className="p-0">
            <ul>{list.clients.map((c) => <ClientRow key={c.id} c={c} onError={setMessage} />)}</ul>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
