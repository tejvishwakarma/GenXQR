import { useState } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import {
  Webhook, Plus, Trash2, Play, ChevronDown, ChevronUp,
  AlertTriangle, Loader2, Check, X, Globe, BookOpen, ShieldCheck,
  Zap, Radio, Code2,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import {
  listWebhooks, getWebhookEvents, createWebhook, deleteWebhook, testWebhook,
  getWebhookDeliveries, ApiError,
  type WebhookRecord, type WebhookDelivery,
} from "@/lib/api"

// ─── Webhooks Tutorial Modal ───────────────────────────────────────────────────

function WebhookTutorialModal({ onClose }: { onClose: () => void }) {
  const [tab, setTab] = useState<"overview" | "events" | "verify" | "debug">("overview")

  const tabs = [
    { id: "overview", label: "Overview" },
    { id: "events",   label: "Events & Payload" },
    { id: "verify",   label: "Signature Verification" },
    { id: "debug",    label: "Debugging" },
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
              <h2 className="text-zinc-900 dark:text-white font-semibold text-sm">Webhooks — Guide</h2>
              <p className="text-zinc-500 text-xs">Real-time HTTP notifications for account events</p>
            </div>
          </div>
          <button onClick={onClose} className="text-zinc-500 hover:text-zinc-900 dark:hover:text-white transition-colors">
            <X size={18} />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 px-6 pt-4 shrink-0 overflow-x-auto">
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
                Webhooks let GenXQR push real-time notifications to your server whenever something happens — a QR scan, a new QR code created, an update, or a deletion. No polling needed.
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {[
                  { icon: <Radio size={16} />, title: "Real-time", desc: "Your endpoint receives a POST request within milliseconds of the triggering event." },
                  { icon: <ShieldCheck size={16} />, title: "HMAC secured", desc: "Every request is signed with a secret. Verify it server-side to reject spoofed requests." },
                  { icon: <Zap size={16} />, title: "Retries", desc: "Failed deliveries are retried automatically. Check delivery history per webhook." },
                ].map((item) => (
                  <div key={item.title} className="bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl p-4">
                    <div className="text-violet-400 mb-2">{item.icon}</div>
                    <p className="text-zinc-900 dark:text-white font-medium text-xs mb-1">{item.title}</p>
                    <p className="text-zinc-500 text-xs leading-relaxed">{item.desc}</p>
                  </div>
                ))}
              </div>

              <div>
                <p className="text-zinc-900 dark:text-white font-semibold mb-3">Setup in 4 steps</p>
                {[
                  { n: "1", text: 'Click "Add Webhook". Give it a name, paste your HTTPS endpoint URL, and choose which events to subscribe to.' },
                  { n: "2", text: "After creation, copy the webhook secret (shown once). You'll use it server-side to verify incoming requests." },
                  { n: "3", text: 'Use the "Test" button (▶) to send a sample payload to your endpoint and verify it receives the request.' },
                  { n: "4", text: "Expand a webhook row to see the delivery history — status codes, timestamps, and success/failure per event." },
                ].map((s) => (
                  <div key={s.n} className="flex gap-3 mb-3 last:mb-0">
                    <span className="w-5 h-5 rounded-full bg-violet-500/20 text-violet-400 text-[11px] font-bold flex items-center justify-center shrink-0 mt-0.5">{s.n}</span>
                    <p className="text-zinc-400 text-xs leading-relaxed">{s.text}</p>
                  </div>
                ))}
              </div>

              <div className="p-4 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl">
                <p className="text-zinc-900 dark:text-white font-semibold text-xs mb-2">How a webhook request looks</p>
                <div className="font-mono text-xs space-y-1 overflow-x-auto">
                  <p><span className="text-violet-300">POST</span> <span className="text-zinc-300">https://your-server.com/webhook</span></p>
                  <p><span className="text-zinc-500">Content-Type: application/json</span></p>
                  <p><span className="text-zinc-500">X-GenXQR-Signature: sha256=&lt;HMAC&gt;</span></p>
                  <p><span className="text-zinc-500">X-GenXQR-Event: qr.scanned</span></p>
                </div>
              </div>
            </>
          )}

          {tab === "events" && (
            <>
              <p className="text-zinc-400 text-xs leading-relaxed">Subscribe to one or more events per webhook. You can always edit subscriptions by deleting and recreating the webhook.</p>

              {[
                {
                  event: "qr.scanned",
                  desc: "Fired every time a QR code is scanned (after deduplication — one per device per 4 hours).",
                  payload: `{
  "event": "qr.scanned",
  "qrId": "clxxx",
  "slug": "abc123",
  "scannedAt": "2025-04-14T10:30:00.000Z",
  "country": "IN",
  "city": "Mumbai",
  "device": "mobile",
  "browser": "Chrome"
}`,
                },
                {
                  event: "qr.created",
                  desc: "Fired when a QR code is created — via the dashboard or the REST API.",
                  payload: `{
  "event": "qr.created",
  "qrId": "clxxx",
  "name": "My QR Code",
  "type": "URL",
  "slug": "abc123",
  "createdAt": "2025-04-14T10:00:00.000Z"
}`,
                },
                {
                  event: "qr.updated",
                  desc: "Fired when a QR code's content or settings are changed.",
                  payload: `{
  "event": "qr.updated",
  "qrId": "clxxx",
  "updatedAt": "2025-04-14T11:00:00.000Z"
}`,
                },
                {
                  event: "qr.deleted",
                  desc: "Fired when a QR code is permanently deleted.",
                  payload: `{
  "event": "qr.deleted",
  "qrId": "clxxx",
  "deletedAt": "2025-04-14T12:00:00.000Z"
}`,
                },
              ].map((ev) => (
                <div key={ev.event} className="border border-zinc-200 dark:border-zinc-800 rounded-xl overflow-hidden">
                  <div className="flex items-center gap-3 px-4 py-3 bg-zinc-50 dark:bg-zinc-950">
                    <code className="text-violet-300 text-xs font-mono font-semibold">{ev.event}</code>
                  </div>
                  <div className="p-4 space-y-2">
                    <p className="text-zinc-500 text-xs leading-relaxed">{ev.desc}</p>
                    <p className="text-zinc-500 text-xs font-medium">Payload</p>
                    <div className="bg-zinc-950 rounded-lg p-3 font-mono text-xs text-emerald-300 overflow-x-auto whitespace-pre">{ev.payload}</div>
                  </div>
                </div>
              ))}
            </>
          )}

          {tab === "verify" && (
            <>
              <p className="text-zinc-400 text-xs leading-relaxed">
                Every request includes an <code className="text-violet-300 bg-violet-500/10 px-1 rounded">X-GenXQR-Signature</code> header with an HMAC-SHA256 of the raw request body, signed with your webhook secret. Always verify this before processing the payload.
              </p>

              <div>
                <p className="text-zinc-500 text-xs font-medium mb-2 flex items-center gap-2"><Code2 size={12} /> Node.js — Express</p>
                <div className="bg-zinc-950 border border-zinc-800 rounded-xl p-4 font-mono text-xs overflow-x-auto whitespace-pre text-zinc-300">{`const crypto = require('crypto')

app.post('/webhook', express.raw({ type: 'application/json' }), (req, res) => {
  const sig  = req.headers['x-GenXQR-signature']
  const body = req.body  // raw Buffer — do NOT parse before verifying

  const expected = 'sha256=' + crypto
    .createHmac('sha256', process.env.GenXQR_WEBHOOK_SECRET)
    .update(body)
    .digest('hex')

  if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) {
    return res.status(401).send('Invalid signature')
  }

  const event = JSON.parse(body)
  console.log('Received event:', event.event)
  res.sendStatus(200)
})`}</div>
              </div>

              <div>
                <p className="text-zinc-500 text-xs font-medium mb-2 flex items-center gap-2"><Code2 size={12} /> Python — FastAPI</p>
                <div className="bg-zinc-950 border border-zinc-800 rounded-xl p-4 font-mono text-xs overflow-x-auto whitespace-pre text-zinc-300">{`import hmac, hashlib, os
from fastapi import Request, HTTPException

@app.post("/webhook")
async def handle_webhook(request: Request):
    body = await request.body()
    sig  = request.headers.get("x-GenXQR-signature", "")

    expected = "sha256=" + hmac.new(
        os.environ["GenXQR_WEBHOOK_SECRET"].encode(),
        body,
        hashlib.sha256
    ).hexdigest()

    if not hmac.compare_digest(sig, expected):
        raise HTTPException(status_code=401, detail="Invalid signature")

    event = json.loads(body)
    print("Received:", event["event"])
    return {"ok": True}`}</div>
              </div>

              <div className="p-4 bg-amber-500/8 border border-amber-500/20 rounded-xl">
                <p className="text-amber-300 font-medium text-xs mb-1">Use timing-safe comparison</p>
                <p className="text-zinc-400 text-xs leading-relaxed">Always use <code className="text-amber-300">crypto.timingSafeEqual</code> (Node.js) or <code className="text-amber-300">hmac.compare_digest</code> (Python) — not <code className="text-red-400">===</code>. Standard string comparison is vulnerable to timing attacks.</p>
              </div>
            </>
          )}

          {tab === "debug" && (
            <>
              <p className="text-zinc-400 text-xs leading-relaxed">Use these techniques to diagnose webhook delivery issues.</p>

              <div className="space-y-4">
                <div className="border border-zinc-200 dark:border-zinc-800 rounded-xl p-4">
                  <p className="text-zinc-900 dark:text-white font-semibold text-xs mb-2">1. Use the Test button first</p>
                  <p className="text-zinc-500 text-xs leading-relaxed">Click the ▶ icon next to any webhook to send a sample <code className="text-violet-300">test</code> payload. Your server should respond with HTTP 200. Check the delivery history (expand the row) to see the response code.</p>
                </div>

                <div className="border border-zinc-200 dark:border-zinc-800 rounded-xl p-4">
                  <p className="text-zinc-900 dark:text-white font-semibold text-xs mb-2">2. Inspect delivery history</p>
                  <p className="text-zinc-500 text-xs leading-relaxed">Expand any webhook row to see recent deliveries with status codes and timestamps. A <code className="text-red-400">5xx</code> response means your server received the request but errored. A network failure means the endpoint was unreachable.</p>
                </div>

                <div className="border border-zinc-200 dark:border-zinc-800 rounded-xl p-4">
                  <p className="text-zinc-900 dark:text-white font-semibold text-xs mb-2">3. Use a tunnel for local testing</p>
                  <p className="text-zinc-500 text-xs leading-relaxed">To test against a local server, expose it publicly with a tunneling tool:</p>
                  <div className="mt-2 space-y-2">
                    <div className="bg-zinc-950 rounded-lg px-3 py-2 font-mono text-xs text-zinc-300">
                      <span className="text-zinc-500"># ngrok (popular)</span><br />
                      npx ngrok http 3000
                    </div>
                    <div className="bg-zinc-950 rounded-lg px-3 py-2 font-mono text-xs text-zinc-300">
                      <span className="text-zinc-500"># localtunnel (alternative)</span><br />
                      npx localtunnel --port 3000
                    </div>
                  </div>
                  <p className="text-zinc-500 text-xs mt-2">Copy the generated HTTPS URL and paste it as your webhook endpoint URL.</p>
                </div>

                <div className="border border-zinc-200 dark:border-zinc-800 rounded-xl p-4">
                  <p className="text-zinc-900 dark:text-white font-semibold text-xs mb-2">4. Common errors</p>
                  <div className="space-y-2">
                    {[
                      ["HTTP 401", "Signature mismatch — check you're using the raw request body before JSON parsing."],
                      ["HTTP 404", "Endpoint URL not found — check the route exists on your server."],
                      ["Timeout / no response", "Your server took > 10 seconds to respond. Move heavy work to a background job and return 200 immediately."],
                      ["HTTP 200 but event not processed", "You're returning 200 before processing. Add logging inside the handler to confirm execution."],
                    ].map(([code, msg]) => (
                      <div key={code} className="flex gap-3 text-xs">
                        <code className="text-red-400 w-28 shrink-0 font-mono">{code}</code>
                        <span className="text-zinc-500 leading-relaxed">{msg}</span>
                      </div>
                    ))}
                  </div>
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

// ─── Create / Edit Modal ────────────────────────────────────────────────────────

function CreateWebhookModal({
  onClose,
  onCreated,
  eventOptions,
}: {
  onClose: () => void
  onCreated: () => void
  eventOptions: string[]
}) {
  const [name, setName] = useState("")
  const [url, setUrl] = useState("")
  const [selectedEvents, setSelectedEvents] = useState<string[]>([])

  const createMut = useMutation({
    mutationFn: () => createWebhook(name.trim(), url.trim(), selectedEvents),
    onSuccess: () => { onCreated(); onClose() },
  })

  const toggleEvent = (ev: string) =>
    setSelectedEvents((prev) => prev.includes(ev) ? prev.filter((e) => e !== ev) : [...prev, ev])

  const valid = name.trim() && url.startsWith("https://") && selectedEvents.length > 0

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl w-full max-w-lg shadow-2xl">
        <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-zinc-200 dark:border-zinc-800">
          <h2 className="text-zinc-900 dark:text-white font-semibold">New Webhook</h2>
          <button onClick={onClose} className="text-zinc-500 hover:text-zinc-900 dark:hover:text-white transition-colors"><X size={18} /></button>
        </div>
        <div className="p-6 space-y-4">
          <div>
            <label className="text-zinc-600 dark:text-zinc-400 text-xs font-medium block mb-1.5">Name</label>
            <Input placeholder="e.g. Slack Notifications" value={name} onChange={(e) => setName(e.target.value)} maxLength={64} />
          </div>
          <div>
            <label className="text-zinc-600 dark:text-zinc-400 text-xs font-medium block mb-1.5">Endpoint URL (HTTPS required)</label>
            <Input placeholder="https://your-server.com/webhook" value={url} onChange={(e) => setUrl(e.target.value)} />
          </div>
          <div>
            <label className="text-zinc-600 dark:text-zinc-400 text-xs font-medium block mb-2">Events</label>
            <div className="flex flex-wrap gap-2">
              {eventOptions.map((ev) => (
                <button
                  key={ev}
                  type="button"
                  onClick={() => toggleEvent(ev)}
                  className={cn(
                    "text-xs px-3 py-1.5 rounded-lg border font-mono transition-all",
                    selectedEvents.includes(ev)
                      ? "bg-violet-500/20 border-violet-500/60 text-violet-300"
                      : "border-zinc-300 dark:border-zinc-700 text-zinc-500 hover:border-zinc-500"
                  )}
                >
                  {ev}
                </button>
              ))}
            </div>
          </div>
          {createMut.error && (
            <p className="text-red-400 text-xs">
              {createMut.error instanceof Error ? createMut.error.message : "Failed to create webhook"}
            </p>
          )}
        </div>
        <div className="flex gap-3 px-6 pb-6">
          <Button onClick={() => createMut.mutate()} disabled={!valid || createMut.isPending}>
            {createMut.isPending ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
            Create Webhook
          </Button>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
        </div>
      </div>
    </div>
  )
}

// ─── Delivery History Row ──────────────────────────────────────────────────────

function DeliveryRow({ d }: { d: WebhookDelivery }) {
  return (
    <div className="flex items-center gap-3 py-2.5 border-b border-zinc-200/60 dark:border-zinc-800/60 last:border-0 text-xs">
      {d.success
        ? <Check size={12} className="text-emerald-400 shrink-0" />
        : <X size={12} className="text-red-400 shrink-0" />
      }
      <span className="font-mono text-zinc-600 dark:text-zinc-400 w-36 shrink-0">{d.event}</span>
      <span className={cn("w-12 shrink-0 font-medium", d.statusCode && d.statusCode >= 200 && d.statusCode < 300 ? "text-emerald-400" : "text-red-400")}>
        {d.statusCode ?? "—"}
      </span>
      <span className="text-zinc-600 flex-1 truncate">
        {new Date(d.attemptedAt).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}
      </span>
    </div>
  )
}

// ─── Webhook Row ───────────────────────────────────────────────────────────────

function WebhookRow({ hook }: { hook: WebhookRecord }) {
  const qc = useQueryClient()
  const [expanded, setExpanded] = useState(false)
  const [testResult, setTestResult] = useState<boolean | null>(null)

  const { data: deliveriesData, isLoading: loadingDeliveries } = useQuery({
    queryKey: ["webhook-deliveries", hook.id],
    queryFn: () => getWebhookDeliveries(hook.id),
    enabled: expanded,
  })

  const deleteMut = useMutation({
    mutationFn: () => deleteWebhook(hook.id),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["webhooks"] }),
  })

  const testMut = useMutation({
    mutationFn: () => testWebhook(hook.id),
    onSuccess: (res) => { setTestResult(res.data.success); setTimeout(() => setTestResult(null), 4000) },
    onError: () => { setTestResult(false); setTimeout(() => setTestResult(null), 4000) },
  })

  const deliveries: WebhookDelivery[] = deliveriesData?.data ?? []

  return (
    <div className="border-b border-zinc-200 dark:border-zinc-800 last:border-0">
      <div className="px-6 py-4">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-zinc-900 dark:text-white font-semibold text-sm">{hook.name}</span>
              {hook.isActive
                ? <Badge className="bg-emerald-500/15 text-emerald-400 border-emerald-500/20 text-xs">Active</Badge>
                : <Badge variant="destructive" className="text-xs">Disabled</Badge>
              }
            </div>
            <div className="flex items-center gap-1.5 text-zinc-500 text-xs mb-2">
              <Globe size={11} />
              <span className="truncate max-w-[200px] sm:max-w-xs font-mono">{hook.url}</span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {hook.events.map((ev) => (
                <span key={ev} className="text-xs font-mono px-2 py-0.5 rounded-md bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400">{ev}</span>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {testResult !== null && (
              testResult
                ? <span className="text-emerald-400 text-xs">Sent ✓</span>
                : <span className="text-red-400 text-xs">Failed</span>
            )}
            <button
              onClick={() => testMut.mutate()}
              disabled={testMut.isPending}
              title="Test webhook"
              className="w-7 h-7 rounded-lg flex items-center justify-center text-zinc-500 hover:text-violet-400 hover:bg-violet-500/10 transition-colors"
            >
              {testMut.isPending ? <Loader2 size={13} className="animate-spin" /> : <Play size={13} />}
            </button>
            <button
              onClick={() => {
                if (window.confirm("Delete this webhook?")) deleteMut.mutate()
              }}
              title="Delete webhook"
              className="w-7 h-7 rounded-lg flex items-center justify-center text-zinc-500 hover:text-red-400 hover:bg-red-500/10 transition-colors"
            >
              <Trash2 size={13} />
            </button>
            <button
              onClick={() => setExpanded(!expanded)}
              className="w-7 h-7 rounded-lg flex items-center justify-center text-zinc-500 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
            >
              {expanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
            </button>
          </div>
        </div>
      </div>

      {expanded && (
        <div className="px-6 pb-4">
          <div className="bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl p-4">
            <div className="flex items-center justify-between mb-3">
              <span className="text-zinc-600 dark:text-zinc-400 text-xs font-medium">Recent Deliveries</span>
              <span className="text-zinc-600 text-xs">{hook.deliveryCount} total</span>
            </div>
            {loadingDeliveries && (
              <div className="flex items-center gap-2 text-zinc-500 text-xs py-2">
                <Loader2 size={12} className="animate-spin" /> Loading…
              </div>
            )}
            {!loadingDeliveries && deliveries.length === 0 && (
              <p className="text-zinc-600 text-xs py-2">No deliveries yet. Send a test above.</p>
            )}
            {deliveries.map((d) => <DeliveryRow key={d.id} d={d} />)}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── WebhooksPage ──────────────────────────────────────────────────────────────

export default function WebhooksPage() {
  const [showCreate, setShowCreate] = useState(false)
  const [showTutorial, setShowTutorial] = useState(false)
  const qc = useQueryClient()

  const { data, isLoading, error } = useQuery({
    queryKey: ["webhooks"],
    queryFn: listWebhooks,
  })

  const { data: eventsData } = useQuery({
    queryKey: ["webhook-events"],
    queryFn: getWebhookEvents,
  })

  const hooks: WebhookRecord[] = data?.data ?? []
  const eventOptions: string[] = eventsData?.data ?? []

  return (
    <div className="space-y-8 animate-fade-in max-w-4xl">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-zinc-900 dark:text-white">Webhooks</h1>
          <p className="text-zinc-500 text-sm mt-1">Receive real-time HTTP notifications when events occur in your account.</p>
        </div>
        <div className="flex gap-2 w-full sm:w-auto">
          <Button variant="outline" className="gap-2 h-10 px-4 w-full sm:w-auto" onClick={() => setShowTutorial(true)}>
            <BookOpen size={15} />
            How to use
          </Button>
          <Button className="shrink-0 w-full sm:w-auto" onClick={() => setShowCreate(true)} disabled={error instanceof ApiError && error.status === 403}>
            <Plus size={16} />
            Add Webhook
          </Button>
        </div>
      </div>

      {/* Info box */}
      <div className="p-4 bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl text-xs text-zinc-600 dark:text-zinc-400">
        <p className="font-medium text-zinc-900 dark:text-white mb-1">HMAC Signature Verification</p>
        <p>Every webhook request includes an <code className="text-violet-300">X-GenXQR-Signature</code> header with <code className="text-violet-300">sha256=&#60;HMAC&#62;</code> computed using your webhook secret. Validate this in your server to ensure authenticity.</p>
      </div>

      {/* Webhooks list */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Webhook size={16} className="text-violet-400" />
            Configured Webhooks
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
                <Webhook size={28} className="text-zinc-400 mx-auto mb-3" />
                <p className="text-zinc-900 dark:text-white font-semibold mb-1">Webhooks require a PRO plan</p>
                <p className="text-zinc-500 text-sm mb-4">Upgrade to receive real-time HTTP notifications for account events.</p>
                <a
                  href="/app/billing"
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-violet-600 hover:bg-violet-500 text-white text-sm font-semibold transition-colors"
                >
                  Upgrade Plan
                </a>
              </div>
            ) : (
              <div className="flex items-center gap-2 px-6 py-4 text-red-400 text-sm">
                <AlertTriangle size={16} /> Failed to load webhooks.
              </div>
            )
          )}
          {!isLoading && !error && hooks.length === 0 && (
            <div className="px-6 py-12 text-center text-zinc-500 text-sm">
              No webhooks configured yet.
            </div>
          )}
          {hooks.map((h) => <WebhookRow key={h.id} hook={h} />)}
        </CardContent>
      </Card>

      {showTutorial && <WebhookTutorialModal onClose={() => setShowTutorial(false)} />}

      {showCreate && (
        <CreateWebhookModal
          onClose={() => setShowCreate(false)}
          onCreated={() => void qc.invalidateQueries({ queryKey: ["webhooks"] })}
          eventOptions={eventOptions}
        />
      )}
    </div>
  )
}
