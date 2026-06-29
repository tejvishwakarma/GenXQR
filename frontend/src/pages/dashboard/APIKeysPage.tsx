import { useState } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import {
  Key, Plus, Copy, Trash2, Eye, EyeOff, Check, Terminal,
  AlertTriangle, Loader2, RotateCcw, BookOpen, X, ShieldCheck,
  Clock, Zap, Lock,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import {
  listApiKeys, createApiKey, revokeApiKey, deleteApiKey, ApiError, type ApiKeyRecord,
} from "@/lib/api"

// ─── API Keys Tutorial Modal ───────────────────────────────────────────────────

function APIKeyTutorialModal({ onClose }: { onClose: () => void }) {
  const [tab, setTab] = useState<"overview" | "auth" | "endpoints" | "security">("overview")

  const tabs = [
    { id: "overview",   label: "Overview" },
    { id: "auth",       label: "Authentication" },
    { id: "endpoints",  label: "Endpoints" },
    { id: "security",   label: "Security" },
  ] as const

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl w-full max-w-2xl shadow-2xl max-h-[90vh] flex flex-col">

        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-zinc-200 dark:border-zinc-800 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-violet-500/15 border border-violet-500/30 flex items-center justify-center">
              <BookOpen size={15} className="text-violet-400" />
            </div>
            <div>
              <h2 className="text-zinc-900 dark:text-white font-semibold text-sm">API Keys — Guide</h2>
              <p className="text-zinc-500 text-xs">Everything you need to integrate GenXQR into your app</p>
            </div>
          </div>
          <button onClick={onClose} className="text-zinc-500 hover:text-zinc-900 dark:hover:text-white transition-colors">
            <X size={18} />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 px-6 pt-4 pb-0 shrink-0 overflow-x-auto">
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={cn(
                "px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors",
                tab === t.id
                  ? "bg-violet-500/15 text-violet-400 border border-violet-500/30"
                  : "text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800"
              )}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="overflow-y-auto flex-1 px-6 py-5 space-y-5 text-sm">

          {tab === "overview" && (
            <>
              <p className="text-zinc-400 leading-relaxed">
                API keys let you access GenXQR programmatically — create QR codes, fetch analytics, and manage everything from your own server or application without using the dashboard.
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {[
                  { icon: <Zap size={16} />, title: "Instant access", desc: "No OAuth flow — just pass your key in a header and you're done." },
                  { icon: <Clock size={16} />, title: "Optional expiry", desc: "Set a TTL (e.g. 90 days) or leave blank for a permanent key." },
                  { icon: <Lock size={16} />, title: "One-time reveal", desc: "The full key is shown once at creation. Store it safely — we only keep a hash." },
                ].map((item) => (
                  <div key={item.title} className="bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl p-4">
                    <div className="text-violet-400 mb-2">{item.icon}</div>
                    <p className="text-zinc-900 dark:text-white font-medium text-xs mb-1">{item.title}</p>
                    <p className="text-zinc-500 text-xs leading-relaxed">{item.desc}</p>
                  </div>
                ))}
              </div>

              <div>
                <p className="text-zinc-900 dark:text-white font-semibold mb-3">Steps to get started</p>
                {[
                  { n: "1", text: 'Click "Create API Key", give it a name (e.g. "Production App"), set an optional expiry, and hit Generate.' },
                  { n: "2", text: "Copy the key immediately — it will not be shown again. Store it in your server's environment variables, not in code." },
                  { n: "3", text: 'Send it in the Authorization header of every API request as: Authorization: Bearer YOUR_API_KEY' },
                  { n: "4", text: "Revoke or delete a key any time from this page. Revoked keys stop working instantly." },
                ].map((s) => (
                  <div key={s.n} className="flex gap-3 mb-3 last:mb-0">
                    <span className="w-5 h-5 rounded-full bg-violet-500/20 text-violet-400 text-[11px] font-bold flex items-center justify-center shrink-0 mt-0.5">{s.n}</span>
                    <p className="text-zinc-400 text-xs leading-relaxed">{s.text}</p>
                  </div>
                ))}
              </div>
            </>
          )}

          {tab === "auth" && (
            <>
              <p className="text-zinc-400 leading-relaxed">All API requests must include your key in the <code className="text-violet-300 bg-violet-500/10 px-1 rounded">Authorization</code> header.</p>

              <div>
                <p className="text-zinc-500 text-xs font-medium mb-2">Basic authenticated request</p>
                <div className="bg-zinc-950 border border-zinc-800 rounded-xl p-4 font-mono text-xs space-y-1 overflow-x-auto">
                  <p><span className="text-zinc-500"># Replace YOUR_API_KEY with your actual key</span></p>
                  <p>
                    <span className="text-amber-300">curl</span>{" "}
                    <span className="text-violet-300">-H</span>{" "}
                    <span className="text-emerald-300">"Authorization: Bearer nxqr_••••••••"</span>{" "}
                    <span className="text-cyan-300">https://genxqr.streamsnatcher.com/v1/qr</span>
                  </p>
                </div>
              </div>

              <div>
                <p className="text-zinc-500 text-xs font-medium mb-2">Node.js — fetch</p>
                <div className="bg-zinc-950 border border-zinc-800 rounded-xl p-4 font-mono text-xs space-y-1 overflow-x-auto">
                  <p><span className="text-blue-400">const</span> <span className="text-white">res</span> = <span className="text-blue-400">await</span> <span className="text-yellow-300">fetch</span>(<span className="text-emerald-300">"https://genxqr.streamsnatcher.com/v1/qr"</span>, {"{"}</p>
                  <p className="pl-4"><span className="text-violet-300">headers</span>: {"{"}</p>
                  <p className="pl-8"><span className="text-emerald-300">"Authorization"</span>: <span className="text-emerald-300">`Bearer ${"{"}<span className="text-white">process.env.GenXQR_API_KEY</span>{"}"}`</span>,</p>
                  <p className="pl-4">{"}"}</p>
                  <p>{"}"});</p>
                  <p><span className="text-blue-400">const</span> <span className="text-white">data</span> = <span className="text-blue-400">await</span> <span className="text-white">res</span>.<span className="text-yellow-300">json</span>();</p>
                </div>
              </div>

              <div>
                <p className="text-zinc-500 text-xs font-medium mb-2">Python — requests</p>
                <div className="bg-zinc-950 border border-zinc-800 rounded-xl p-4 font-mono text-xs space-y-1 overflow-x-auto">
                  <p><span className="text-blue-400">import</span> <span className="text-white">requests</span>, <span className="text-white">os</span></p>
                  <p><span className="text-white">headers</span> = {"{"}<span className="text-emerald-300">"Authorization"</span>: <span className="text-emerald-300">f"Bearer {"{"}<span className="text-white">os.environ['GenXQR_API_KEY']</span>{"}"}"</span>{"}"}</p>
                  <p><span className="text-white">res</span> = <span className="text-white">requests</span>.<span className="text-yellow-300">get</span>(<span className="text-emerald-300">"https://genxqr.streamsnatcher.com/v1/qr"</span>, headers=<span className="text-white">headers</span>)</p>
                  <p><span className="text-white">data</span> = <span className="text-white">res</span>.<span className="text-yellow-300">json</span>()</p>
                </div>
              </div>

              <div className="p-4 bg-amber-500/8 border border-amber-500/20 rounded-xl">
                <p className="text-amber-300 font-medium text-xs mb-1">Never expose your key in frontend code</p>
                <p className="text-zinc-400 text-xs leading-relaxed">API keys should only be used server-side. If your key is exposed in a browser bundle or public repo, revoke it immediately and generate a new one.</p>
              </div>
            </>
          )}

          {tab === "endpoints" && (
            <>
              <p className="text-zinc-400 text-xs leading-relaxed">Base URL: <code className="text-violet-300 bg-violet-500/10 px-1 rounded">https://genxqr.streamsnatcher.com/v1</code></p>

              {[
                {
                  method: "GET", path: "/qr", desc: "List all your QR codes",
                  example: 'curl -H "Authorization: Bearer KEY" https://genxqr.streamsnatcher.com/v1/qr?page=1&limit=20',
                  response: '{ "success": true, "data": [...], "meta": { "total": 42, "page": 1 } }',
                },
                {
                  method: "POST", path: "/qr", desc: "Create a new QR code",
                  example: `curl -X POST -H "Authorization: Bearer KEY" -H "Content-Type: application/json" \\
  -d '{"name":"My QR","type":"URL","content":{"data":{"url":"https://example.com"}}}' \\
  https://genxqr.streamsnatcher.com/v1/qr`,
                  response: '{ "success": true, "data": { "id": "...", "slug": "abc123", ... } }',
                },
                {
                  method: "GET", path: "/qr/:id", desc: "Get a single QR code by ID",
                  example: 'curl -H "Authorization: Bearer KEY" https://genxqr.streamsnatcher.com/v1/qr/clxxx',
                  response: '{ "success": true, "data": { "id": "clxxx", "name": "My QR", ... } }',
                },
                {
                  method: "PATCH", path: "/qr/:id", desc: "Update a QR code's content or settings",
                  example: `curl -X PATCH -H "Authorization: Bearer KEY" -H "Content-Type: application/json" \\
  -d '{"content":{"data":{"url":"https://new-url.com"}}}' \\
  https://genxqr.streamsnatcher.com/v1/qr/clxxx`,
                  response: '{ "success": true, "data": { ... } }',
                },
                {
                  method: "DELETE", path: "/qr/:id", desc: "Permanently delete a QR code",
                  example: 'curl -X DELETE -H "Authorization: Bearer KEY" https://genxqr.streamsnatcher.com/v1/qr/clxxx',
                  response: '{ "success": true, "message": "QR code deleted" }',
                },
                {
                  method: "GET", path: "/qr/:id/analytics", desc: "Get scan analytics for a QR code",
                  example: 'curl -H "Authorization: Bearer KEY" https://genxqr.streamsnatcher.com/v1/qr/clxxx/analytics',
                  response: '{ "success": true, "data": { "totalScans": 120, "today": 8, ... } }',
                },
              ].map((ep) => {
                const color = ep.method === "GET" ? "text-emerald-400 bg-emerald-500/10 border-emerald-500/20"
                  : ep.method === "POST" ? "text-blue-400 bg-blue-500/10 border-blue-500/20"
                  : ep.method === "PATCH" ? "text-amber-400 bg-amber-500/10 border-amber-500/20"
                  : "text-red-400 bg-red-500/10 border-red-500/20"
                return (
                  <div key={ep.method + ep.path} className="border border-zinc-200 dark:border-zinc-800 rounded-xl overflow-hidden">
                    <div className="flex items-center gap-3 px-4 py-3 bg-zinc-50 dark:bg-zinc-950">
                      <span className={cn("text-xs font-bold px-2 py-0.5 rounded-md border font-mono", color)}>{ep.method}</span>
                      <code className="text-zinc-300 text-xs font-mono">{ep.path}</code>
                      <span className="text-zinc-500 text-xs ml-auto hidden sm:block">{ep.desc}</span>
                    </div>
                    <div className="p-4 space-y-2">
                      <p className="text-zinc-500 text-xs font-medium">Request</p>
                      <div className="bg-zinc-950 rounded-lg p-3 font-mono text-xs text-zinc-300 overflow-x-auto whitespace-pre">{ep.example}</div>
                      <p className="text-zinc-500 text-xs font-medium mt-2">Response</p>
                      <div className="bg-zinc-950 rounded-lg p-3 font-mono text-xs text-emerald-300 overflow-x-auto">{ep.response}</div>
                    </div>
                  </div>
                )
              })}
            </>
          )}

          {tab === "security" && (
            <>
              <div className="flex items-start gap-3 p-4 bg-emerald-500/8 border border-emerald-500/20 rounded-xl">
                <ShieldCheck size={18} className="text-emerald-400 shrink-0 mt-0.5" />
                <p className="text-zinc-400 text-xs leading-relaxed">Following these practices keeps your integration secure. A leaked API key can create, read, and delete all QR codes in your account.</p>
              </div>

              {[
                {
                  title: "Store keys in environment variables",
                  desc: "Never hardcode your API key in source files or commit it to git. Use environment variables: GenXQR_API_KEY=nxqr_...",
                  bad: "const key = 'nxqr_abc123'  // ❌ never do this",
                  good: "const key = process.env.GenXQR_API_KEY  // ✓ server-side only",
                },
                {
                  title: "Set an expiry for short-lived integrations",
                  desc: "For scripts, CI/CD pipelines, or temporary automations, create a key with a 30–90 day expiry so it auto-invalidates.",
                  bad: null,
                  good: null,
                },
                {
                  title: "Use one key per integration",
                  desc: "Create separate keys for each service (e.g. 'Zapier', 'Analytics Bot', 'CI Pipeline'). If one is compromised, revoke only that one.",
                  bad: null,
                  good: null,
                },
                {
                  title: "Revoke immediately if exposed",
                  desc: "If a key appears in a public repo, error log, or Slack message — revoke it instantly from this page and generate a replacement.",
                  bad: null,
                  good: null,
                },
              ].map((item) => (
                <div key={item.title} className="border border-zinc-200 dark:border-zinc-800 rounded-xl p-4">
                  <p className="text-zinc-900 dark:text-white font-semibold text-xs mb-1">{item.title}</p>
                  <p className="text-zinc-500 text-xs leading-relaxed mb-3">{item.desc}</p>
                  {item.bad && (
                    <div className="space-y-2">
                      <div className="bg-red-500/8 border border-red-500/20 rounded-lg px-3 py-2 font-mono text-xs text-red-400">{item.bad}</div>
                      <div className="bg-emerald-500/8 border border-emerald-500/20 rounded-lg px-3 py-2 font-mono text-xs text-emerald-400">{item.good}</div>
                    </div>
                  )}
                </div>
              ))}

              <div className="border border-zinc-200 dark:border-zinc-800 rounded-xl p-4">
                <p className="text-zinc-900 dark:text-white font-semibold text-xs mb-2">Rate limits</p>
                <div className="space-y-1.5">
                  {[
                    ["Global API limit", "200 requests / minute per key"],
                    ["Burst limit", "50 requests / 5 seconds"],
                    ["Response on limit exceeded", "HTTP 429 with Retry-After header"],
                  ].map(([label, val]) => (
                    <div key={label} className="flex justify-between text-xs">
                      <span className="text-zinc-500">{label}</span>
                      <span className="text-zinc-300 font-mono">{val}</span>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-zinc-200 dark:border-zinc-800 shrink-0 flex items-center justify-between">
          <a href="/api-docs" className="text-violet-400 hover:text-violet-300 text-xs transition-colors">
            Full API reference →
          </a>
          <Button variant="secondary" onClick={onClose} className="h-8 text-xs px-4">Close</Button>
        </div>
      </div>
    </div>
  )
}

// ─── MaskedKey ─────────────────────────────────────────────────────────────────

function MaskedKey({ prefix, rawKey }: { prefix: string; rawKey?: string }) {
  const [visible, setVisible] = useState(false)
  const [copied, setCopied] = useState(false)
  const displayValue = rawKey
    ? visible ? rawKey : rawKey.slice(0, 20) + "••••••••"
    : `${prefix}••••••••••••••••••••••••••••••••••••••••`

  const handleCopy = () => {
    navigator.clipboard.writeText(rawKey ?? prefix)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="flex items-center gap-2">
      <code className="text-xs font-mono text-zinc-600 dark:text-zinc-400 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-lg px-3 py-1.5 flex-1 truncate">
        {displayValue}
      </code>
      {rawKey && (
        <button
          onClick={() => setVisible(!visible)}
          className="w-7 h-7 rounded-lg flex items-center justify-center text-zinc-500 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
        >
          {visible ? <EyeOff size={13} /> : <Eye size={13} />}
        </button>
      )}
      <button
        onClick={handleCopy}
        className="w-7 h-7 rounded-lg flex items-center justify-center text-zinc-500 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
      >
        {copied ? <Check size={13} className="text-emerald-400" /> : <Copy size={13} />}
      </button>
    </div>
  )
}

// ─── APIKeysPage ────────────────────────────────────────────────────────────────

export default function APIKeysPage() {
  const qc = useQueryClient()
  const [showCreate, setShowCreate] = useState(false)
  const [showTutorial, setShowTutorial] = useState(false)
  const [keyName, setKeyName] = useState("")
  const [expiresInDays, setExpiresInDays] = useState("")
  const [newKeyData, setNewKeyData] = useState<ApiKeyRecord | null>(null)

  const { data, isLoading, error } = useQuery({
    queryKey: ["apikeys"],
    queryFn: listApiKeys,
  })

  const createMut = useMutation({
    mutationFn: () => createApiKey(keyName.trim(), expiresInDays ? parseInt(expiresInDays) : undefined),
    onSuccess: (res) => {
      void qc.invalidateQueries({ queryKey: ["apikeys"] })
      setNewKeyData(res.data)
      setShowCreate(false)
      setKeyName("")
      setExpiresInDays("")
    },
  })

  const revokeMut = useMutation({
    mutationFn: revokeApiKey,
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["apikeys"] }),
  })

  const deleteMut = useMutation({
    mutationFn: deleteApiKey,
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["apikeys"] }),
  })

  const keys = data?.data ?? []

  function formatDate(iso: string) {
    return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })
  }

  return (
    <div className="space-y-8 animate-fade-in max-w-4xl">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-zinc-900 dark:text-white">API Keys</h1>
          <p className="text-zinc-500 text-sm mt-1">Manage API keys to integrate GenXQR into your applications.</p>
        </div>
        <div className="flex gap-2 w-full sm:w-auto">
          <Button variant="outline" className="gap-2 h-10 px-4 w-full sm:w-auto" onClick={() => setShowTutorial(true)}>
            <BookOpen size={15} />
            How to use
          </Button>
          <Button className="shrink-0 w-full sm:w-auto" onClick={() => { setShowCreate(!showCreate); setNewKeyData(null) }} disabled={error instanceof ApiError && error.status === 403}>
            <Plus size={16} />
            Create API Key
          </Button>
        </div>
      </div>

      {/* New Key Banner */}
      {newKeyData?.rawKey && (
        <div className="p-5 bg-emerald-500/10 border border-emerald-500/30 rounded-xl">
          <div className="flex items-start gap-3">
            <Check size={18} className="text-emerald-400 mt-0.5 shrink-0" />
            <div className="flex-1">
              <p className="text-emerald-300 font-semibold text-sm mb-1">
                API Key Created — <span className="font-normal">{newKeyData.name}</span>
              </p>
              <p className="text-emerald-400/80 text-xs mb-3">Copy this key now. It won't be shown again.</p>
              <MaskedKey prefix={newKeyData.prefix} rawKey={newKeyData.rawKey} />
            </div>
            <button
              onClick={() => setNewKeyData(null)}
              className="text-zinc-500 hover:text-white transition-colors mt-0.5"
            >
              ✕
            </button>
          </div>
        </div>
      )}

      {/* Create Form */}
      {showCreate && (
        <Card>
          <CardHeader><CardTitle className="text-base">New API Key</CardTitle></CardHeader>
          <CardContent>
            <form
              onSubmit={(e) => { e.preventDefault(); if (keyName.trim()) createMut.mutate() }}
              className="space-y-4"
            >
              <div>
                <label className="text-zinc-600 dark:text-zinc-400 text-xs font-medium block mb-1.5">Key Name</label>
                <Input
                  placeholder="e.g. Production App, Analytics Bot"
                  value={keyName}
                  onChange={(e) => setKeyName(e.target.value)}
                  maxLength={64}
                />
              </div>
              <div>
                <label className="text-zinc-600 dark:text-zinc-400 text-xs font-medium block mb-1.5">Expires In (days, optional)</label>
                <Input
                  type="number"
                  placeholder="e.g. 90 (leave blank for no expiry)"
                  value={expiresInDays}
                  onChange={(e) => setExpiresInDays(e.target.value)}
                  min={1}
                  max={365}
                />
              </div>
              {createMut.error && (
                <p className="text-red-400 text-xs">
                  {createMut.error instanceof Error ? createMut.error.message : "Failed to create key"}
                </p>
              )}
              <div className="flex gap-3 pt-1">
                <Button type="submit" disabled={!keyName.trim() || createMut.isPending}>
                  {createMut.isPending ? <Loader2 size={14} className="animate-spin" /> : <Key size={14} />}
                  Generate Key
                </Button>
                <Button type="button" variant="secondary" onClick={() => setShowCreate(false)}>Cancel</Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {/* Keys List */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Key size={16} className="text-violet-400" />
            Your API Keys
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading && (
            <div className="flex items-center justify-center py-12 text-zinc-500">
              <Loader2 size={20} className="animate-spin mr-2" /> Loading…
            </div>
          )}
          {error && (
            error instanceof ApiError && error.status === 403 ? (
              <div className="px-6 py-12 text-center">
                <Key size={28} className="text-zinc-400 mx-auto mb-3" />
                <p className="text-zinc-900 dark:text-white font-semibold mb-1">API Access requires a PRO plan</p>
                <p className="text-zinc-500 text-sm mb-4">Upgrade to create and manage API keys for your integrations.</p>
                <a
                  href="/app/billing"
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-violet-600 hover:bg-violet-500 text-white text-sm font-semibold transition-colors"
                >
                  Upgrade Plan
                </a>
              </div>
            ) : (
              <div className="flex items-center gap-2 px-6 py-4 text-red-400 text-sm">
                <AlertTriangle size={16} /> Failed to load API keys.
              </div>
            )
          )}
          {!isLoading && !error && keys.length === 0 && (
            <div className="px-6 py-12 text-center text-zinc-500 text-sm">
              No API keys yet. Create one to get started.
            </div>
          )}
          {keys.map((k, i) => (
            <div key={k.id} className={cn("px-6 py-5", i < keys.length - 1 && "border-b border-zinc-200 dark:border-zinc-800")}>
              <div className="flex items-start justify-between gap-4 mb-3">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-zinc-900 dark:text-white font-semibold text-sm">{k.name}</span>
                    {!k.isActive && <Badge variant="destructive" className="text-xs">Revoked</Badge>}
                    {k.expiresAt && new Date(k.expiresAt) < new Date() && (
                      <Badge variant="destructive" className="text-xs">Expired</Badge>
                    )}
                  </div>
                  <div className="text-zinc-500 text-xs mt-0.5">
                    Created {formatDate(k.createdAt)}
                    {k.lastUsedAt ? ` · Last used ${formatDate(k.lastUsedAt)}` : " · Never used"}
                    {" · "}{k.callCount.toLocaleString()} calls
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {k.isActive && (
                    <button
                      onClick={() => revokeMut.mutate(k.id)}
                      disabled={revokeMut.isPending}
                      title="Revoke key"
                      className="w-7 h-7 rounded-lg flex items-center justify-center text-zinc-500 hover:text-amber-400 hover:bg-amber-500/10 transition-colors"
                    >
                      <RotateCcw size={13} />
                    </button>
                  )}
                  <button
                    onClick={() => {
                      if (window.confirm("Permanently delete this API key?")) deleteMut.mutate(k.id)
                    }}
                    title="Delete key"
                    className="w-7 h-7 rounded-lg flex items-center justify-center text-zinc-500 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
              <MaskedKey prefix={k.prefix} />
            </div>
          ))}
        </CardContent>
      </Card>

      {showTutorial && <APIKeyTutorialModal onClose={() => setShowTutorial(false)} />}

      {/* Quick Start Snippet */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Terminal size={16} className="text-violet-400" />
            Quick Start
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-zinc-600 dark:text-zinc-400 text-sm mb-4">Authenticate all API requests with your key in the Authorization header:</p>
          <div className="overflow-x-auto bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl p-4 font-mono text-xs space-y-3 min-w-0">
            <div>
              <p className="text-zinc-500 mb-1"># List QR codes</p>
              <p className="text-zinc-700 dark:text-zinc-300 whitespace-nowrap">
                curl -H <span className="text-violet-300">"Authorization: Bearer YOUR_API_KEY"</span>{" "}
                <span className="text-emerald-400">https://genxqr.com/v1/qr</span>
              </p>
            </div>
            <div>
              <p className="text-zinc-500 mb-1"># Create a new QR</p>
              <p className="text-zinc-700 dark:text-zinc-300 whitespace-nowrap">
                curl -X POST -H <span className="text-violet-300">"Authorization: Bearer YOUR_API_KEY"</span>{" "}
                -d <span className="text-amber-300">&#39;&#123;&quot;name&quot;:&quot;My QR&quot;,&quot;type&quot;:&quot;URL&quot;,&quot;content&quot;:&#123;&quot;data&quot;:&#123;&quot;url&quot;:&quot;https://example.com&quot;&#125;&#125;&#125;&#39;</span>{" "}
                <span className="text-emerald-400">https://genxqr.com/v1/qr</span>
              </p>
            </div>
          </div>
          <div className="mt-4 grid grid-cols-2 sm:grid-cols-3 gap-2">
            {[
              { method: "GET", path: "/v1/qr", desc: "List QRs" },
              { method: "POST", path: "/v1/qr", desc: "Create QR" },
              { method: "GET", path: "/v1/qr/:id", desc: "Get QR" },
              { method: "PATCH", path: "/v1/qr/:id", desc: "Update QR" },
              { method: "DELETE", path: "/v1/qr/:id", desc: "Delete QR" },
              { method: "GET", path: "/v1/qr/:id/analytics", desc: "QR Analytics" },
            ].map((ep) => (
              <div key={ep.path + ep.method} className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg px-3 py-2">
                <span className={cn(
                  "text-xs font-bold mr-2",
                  ep.method === "GET" ? "text-emerald-400"
                    : ep.method === "POST" ? "text-blue-400"
                    : ep.method === "PATCH" ? "text-amber-400"
                    : "text-red-400"
                )}>
                  {ep.method}
                </span>
                <span className="text-zinc-600 dark:text-zinc-400 text-xs font-mono">{ep.path}</span>
                <p className="text-zinc-500 text-xs mt-0.5">{ep.desc}</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
