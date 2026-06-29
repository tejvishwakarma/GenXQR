import { useState } from "react"
import { Link, useParams } from "react-router-dom"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import {
  ArrowLeft, Plus, Trash2, Edit2, Check, X, Globe, Smartphone, Clock, Loader2,
} from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
  getQR, getSmartRoutes, createSmartRoute, updateSmartRoute, deleteSmartRoute,
  type SmartRoutingRule, type SmartRoutePayload,
} from "@/lib/api"

// ─── Constants ────────────────────────────────────────────────────────────────

const ISO_COUNTRIES = [
  { code: "US", name: "United States" }, { code: "IN", name: "India" },
  { code: "GB", name: "United Kingdom" }, { code: "CA", name: "Canada" },
  { code: "AU", name: "Australia" }, { code: "DE", name: "Germany" },
  { code: "FR", name: "France" }, { code: "JP", name: "Japan" },
  { code: "BR", name: "Brazil" }, { code: "MX", name: "Mexico" },
  { code: "SG", name: "Singapore" }, { code: "AE", name: "United Arab Emirates" },
  { code: "ZA", name: "South Africa" }, { code: "NG", name: "Nigeria" },
  { code: "PK", name: "Pakistan" }, { code: "ID", name: "Indonesia" },
  { code: "PH", name: "Philippines" }, { code: "SA", name: "Saudi Arabia" },
  { code: "TR", name: "Turkey" }, { code: "IT", name: "Italy" },
  { code: "ES", name: "Spain" }, { code: "NL", name: "Netherlands" },
  { code: "SE", name: "Sweden" }, { code: "NO", name: "Norway" },
  { code: "DK", name: "Denmark" }, { code: "PL", name: "Poland" },
  { code: "RU", name: "Russia" }, { code: "UA", name: "Ukraine" },
  { code: "EG", name: "Egypt" }, { code: "KE", name: "Kenya" },
]

type ConditionType = "device" | "time" | "geo"

interface RuleForm {
  conditionType: ConditionType
  device: string
  timeFrom: string
  timeTo: string
  countries: string[]
  targetUrl: string
  priority: string
  isActive: boolean
}

function emptyForm(): RuleForm {
  return {
    conditionType: "device",
    device: "mobile",
    timeFrom: "9",
    timeTo: "18",
    countries: [],
    targetUrl: "",
    priority: "1",
    isActive: true,
  }
}

function buildPayload(form: RuleForm): SmartRoutePayload {
  let conditionValue: Record<string, unknown> = {}
  if (form.conditionType === "device") conditionValue = { device: form.device }
  if (form.conditionType === "time") conditionValue = { from: Number(form.timeFrom), to: Number(form.timeTo) }
  if (form.conditionType === "geo") conditionValue = { countries: form.countries }
  return {
    conditionType: form.conditionType,
    conditionValue,
    targetUrl: form.targetUrl,
    priority: Number(form.priority),
    isActive: form.isActive,
  }
}

function formFromRule(rule: SmartRoutingRule): RuleForm {
  const cv = rule.conditionValue
  return {
    conditionType: rule.conditionType,
    device: (cv.device as string) ?? "mobile",
    timeFrom: String((cv.from as number) ?? 9),
    timeTo: String((cv.to as number) ?? 18),
    countries: (cv.countries as string[]) ?? [],
    targetUrl: rule.targetUrl,
    priority: String(rule.priority),
    isActive: rule.isActive,
  }
}

function conditionLabel(rule: SmartRoutingRule) {
  const cv = rule.conditionValue
  switch (rule.conditionType) {
    case "device": return `Device = ${String(cv.device ?? "")}`
    case "time":   return `Time ${String(cv.from ?? "")}:00 → ${String(cv.to ?? "")}:00 UTC`
    case "geo":    return `Countries: ${(cv.countries as string[] | undefined)?.join(", ") ?? ""}`
    default: return rule.conditionType
  }
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function SmartRoutingPage() {
  const { id } = useParams<{ id: string }>()
  const qc = useQueryClient()

  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<RuleForm>(emptyForm())
  const [countryInput, setCountryInput] = useState("")
  const [error, setError] = useState("")

  const { data: qrData } = useQuery({ queryKey: ["qr", id], queryFn: () => getQR(id!), enabled: !!id })
  const { data: rulesData, isLoading } = useQuery({
    queryKey: ["smart-routes", id],
    queryFn: () => getSmartRoutes(id!),
    enabled: !!id,
  })

  const qr = qrData?.data
  const rules = rulesData?.data ?? []

  const invalidate = () => { void qc.invalidateQueries({ queryKey: ["smart-routes", id] }) }

  const createMut = useMutation({ mutationFn: (p: SmartRoutePayload) => createSmartRoute(id!, p), onSuccess: () => { invalidate(); setShowForm(false); setForm(emptyForm()) } })
  const updateMut = useMutation({ mutationFn: ({ ruleId, p }: { ruleId: string; p: SmartRoutePayload }) => updateSmartRoute(id!, ruleId, p), onSuccess: () => { invalidate(); setEditingId(null) } })
  const deleteMut = useMutation({ mutationFn: (ruleId: string) => deleteSmartRoute(id!, ruleId), onSuccess: invalidate })

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError("")
    if (!form.targetUrl.startsWith("http")) { setError("Please enter a valid https:// URL"); return }
    if (form.conditionType === "geo" && form.countries.length === 0) { setError("Add at least one country"); return }
    const payload = buildPayload(form)
    if (editingId) {
      updateMut.mutate({ ruleId: editingId, p: payload })
    } else {
      createMut.mutate(payload)
    }
  }

  function startEdit(rule: SmartRoutingRule) {
    setEditingId(rule.id)
    setForm(formFromRule(rule))
    setShowForm(true)
    setError("")
  }

  function cancelForm() {
    setShowForm(false)
    setEditingId(null)
    setForm(emptyForm())
    setError("")
  }

  function addCountry(code: string) {
    if (!code || form.countries.includes(code)) return
    setForm(f => ({ ...f, countries: [...f.countries, code] }))
    setCountryInput("")
  }

  const isSaving = createMut.isPending || updateMut.isPending

  return (
    <div className="space-y-6 animate-fade-in max-w-3xl">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link to={`/app/qr/${id}`}>
          <button className="w-9 h-9 rounded-xl bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white transition-colors">
            <ArrowLeft size={16} />
          </button>
        </Link>
        <div>
          <h1 className="text-xl font-bold text-zinc-900 dark:text-white">Smart Routing</h1>
          <p className="text-zinc-500 text-sm">{qr?.name ?? "..."} — redirect by device, time, or location</p>
        </div>
      </div>

      {/* Info card */}
      <Card className="border-violet-500/20 bg-violet-500/5">
        <CardContent className="pt-4 pb-4 text-sm text-zinc-600 dark:text-zinc-400 space-y-1">
          <p>Rules are evaluated in <strong className="text-zinc-800 dark:text-zinc-200">priority order</strong> (lowest number first). The first matching rule wins.</p>
          <p>Geo routing uses IP-based lookup. Device detection uses the User-Agent header.</p>
        </CardContent>
      </Card>

      {/* Rules list */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-3">
          <CardTitle className="text-base">Routing Rules ({rules.length})</CardTitle>
          {!showForm && (
            <Button size="sm" onClick={() => { setShowForm(true); setEditingId(null); setForm(emptyForm()) }}>
              <Plus size={14} className="mr-1" />Add Rule
            </Button>
          )}
        </CardHeader>
        <CardContent className="p-0">
          {isLoading && (
            <div className="flex justify-center py-10"><Loader2 size={20} className="animate-spin text-zinc-500" /></div>
          )}
          {!isLoading && rules.length === 0 && !showForm && (
            <p className="text-zinc-500 text-sm text-center py-10">No rules yet. Add a rule to get started.</p>
          )}

          {rules.map((rule, i) => (
            <div key={rule.id} className={`px-6 py-4 flex items-center gap-4 ${i < rules.length - 1 ? "border-b border-zinc-200 dark:border-zinc-800" : ""}`}>
              <div className="w-7 h-7 rounded-full bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center text-xs text-zinc-600 dark:text-zinc-400 font-mono shrink-0">
                {rule.priority}
              </div>
              <div className="text-sm mr-2 shrink-0">
                {rule.conditionType === "device" && <Smartphone size={14} className="text-violet-400" />}
                {rule.conditionType === "time"   && <Clock size={14} className="text-amber-400" />}
                {rule.conditionType === "geo"    && <Globe size={14} className="text-blue-400" />}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-zinc-700 dark:text-zinc-200 text-sm font-medium">{conditionLabel(rule)}</div>
                <div className="text-zinc-500 text-xs truncate">{rule.targetUrl}</div>
              </div>
              <Badge variant={rule.isActive ? "success" : "secondary"} className="text-[10px] shrink-0">
                {rule.isActive ? "on" : "off"}
              </Badge>
              <div className="flex items-center gap-1 shrink-0">
                <button onClick={() => startEdit(rule)} className="w-7 h-7 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 flex items-center justify-center text-zinc-500 hover:text-zinc-900 dark:hover:text-white transition-colors">
                  <Edit2 size={13} />
                </button>
                <button
                  onClick={() => deleteMut.mutate(rule.id)}
                  disabled={deleteMut.isPending}
                  className="w-7 h-7 rounded-lg hover:bg-red-500/10 flex items-center justify-center text-zinc-500 hover:text-red-400 transition-colors"
                >
                  <Trash2 size={13} />
                </button>
              </div>
            </div>
          ))}

          {/* Add / Edit form */}
          {showForm && (
            <form onSubmit={handleSubmit} className="p-6 border-t border-zinc-200 dark:border-zinc-800 space-y-4">
              <div className="text-sm font-semibold text-zinc-800 dark:text-zinc-200 mb-2">{editingId ? "Edit Rule" : "New Rule"}</div>

              {/* Condition type */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-zinc-500 mb-1 block">Condition Type</label>
                  <Select value={form.conditionType} onValueChange={(v) => setForm(f => ({ ...f, conditionType: v as ConditionType }))}>
                    <SelectTrigger className="h-9 text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="device">Device type</SelectItem>
                      <SelectItem value="time">Time of day (UTC)</SelectItem>
                      <SelectItem value="geo">Country</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-xs text-zinc-500 mb-1 block">Priority (1 = first)</label>
                  <Input
                    type="number" min={1} max={100}
                    value={form.priority}
                    onChange={e => setForm(f => ({ ...f, priority: e.target.value }))}
                    className="h-9 text-sm"
                  />
                </div>
              </div>

              {/* Condition value */}
              {form.conditionType === "device" && (
                <div>
                  <label className="text-xs text-zinc-500 mb-1 block">Device</label>
                  <Select value={form.device} onValueChange={(v) => setForm(f => ({ ...f, device: v }))}>
                    <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="mobile">Mobile</SelectItem>
                      <SelectItem value="tablet">Tablet</SelectItem>
                      <SelectItem value="desktop">Desktop</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}

              {form.conditionType === "time" && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-zinc-500 mb-1 block">From (UTC hour 0–23)</label>
                    <Input type="number" min={0} max={23} value={form.timeFrom} onChange={e => setForm(f => ({ ...f, timeFrom: e.target.value }))} className="h-9 text-sm" />
                  </div>
                  <div>
                    <label className="text-xs text-zinc-500 mb-1 block">To (UTC hour 0–23)</label>
                    <Input type="number" min={0} max={23} value={form.timeTo} onChange={e => setForm(f => ({ ...f, timeTo: e.target.value }))} className="h-9 text-sm" />
                  </div>
                </div>
              )}

              {form.conditionType === "geo" && (
                <div>
                  <label className="text-xs text-zinc-500 mb-1 block">Countries</label>
                  <div className="flex gap-2 mb-2">
                    <Select value={countryInput} onValueChange={setCountryInput}>
                      <SelectTrigger className="h-9 text-sm flex-1"><SelectValue placeholder="Select country" /></SelectTrigger>
                      <SelectContent>
                        {ISO_COUNTRIES.filter(c => !form.countries.includes(c.code)).map(c => (
                          <SelectItem key={c.code} value={c.code}>{c.name} ({c.code})</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button type="button" size="sm" variant="outline" onClick={() => addCountry(countryInput)} disabled={!countryInput}>
                      Add
                    </Button>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {form.countries.map(c => (
                      <span key={c} className="inline-flex items-center gap-1 bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 text-xs px-2 py-0.5 rounded">
                        {c}
                        <button type="button" onClick={() => setForm(f => ({ ...f, countries: f.countries.filter(x => x !== c) }))} className="text-zinc-500 hover:text-red-400">
                          <X size={10} />
                        </button>
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Target URL */}
              <div>
                <label className="text-xs text-zinc-500 mb-1 block">Redirect To (URL)</label>
                <Input
                  placeholder="https://example.com/en"
                  value={form.targetUrl}
                  onChange={e => setForm(f => ({ ...f, targetUrl: e.target.value }))}
                  className="h-9 text-sm"
                />
              </div>

              {/* Active toggle */}
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setForm(f => ({ ...f, isActive: !f.isActive }))}
                  className={`w-9 h-5 rounded-full transition-colors ${form.isActive ? "bg-violet-600" : "bg-zinc-700"}`}
                >
                  <div className={`w-3.5 h-3.5 rounded-full bg-white mx-0.5 transition-transform ${form.isActive ? "translate-x-4" : "translate-x-0"}`} />
                </button>
                <span className="text-xs text-zinc-400">{form.isActive ? "Active" : "Inactive"}</span>
              </div>

              {error && <p className="text-red-400 text-xs">{error}</p>}

              <div className="flex gap-2 pt-1">
                <Button type="submit" size="sm" disabled={isSaving}>
                  {isSaving ? <Loader2 size={14} className="animate-spin mr-1" /> : <Check size={14} className="mr-1" />}
                  {editingId ? "Update" : "Add Rule"}
                </Button>
                <Button type="button" variant="ghost" size="sm" onClick={cancelForm}>Cancel</Button>
              </div>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
