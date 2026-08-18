import { useState } from "react"
import { Link, useParams } from "react-router-dom"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { ArrowLeft, Plus, Trash2, Edit2, Check, Loader2, BarChart3 } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  getQR, getABVariants, createABVariant, updateABVariant, deleteABVariant, patchABTestSettings,
  type ABVariant, type ABVariantPayload,
} from "@/lib/api"
import { usePlanFeature, FeatureLocked } from "@/components/PlanFeatureGate"

interface VariantForm { name: string; targetUrl: string; splitPct: string }
const emptyVariantForm = (): VariantForm => ({ name: "", targetUrl: "", splitPct: "50" })

export default function ABTestPage() {
  const { id } = useParams<{ id: string }>()
  const qc = useQueryClient()

  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<VariantForm>(emptyVariantForm())
  const [splitPctEdit, setSplitPctEdit] = useState("50")
  const [error, setError] = useState("")

  const { data: qrData, refetch: refetchQR } = useQuery({ queryKey: ["qr", id], queryFn: () => getQR(id!), enabled: !!id })
  const { data: variantsData, isLoading } = useQuery({
    queryKey: ["ab-variants", id],
    queryFn: () => getABVariants(id!),
    enabled: !!id,
  })

  const qr = qrData?.data
  const variants = variantsData?.data ?? []
  const abTesting = usePlanFeature("abTesting")

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ["ab-variants", id] })
    void qc.invalidateQueries({ queryKey: ["qr", id] })
  }

  const createMut = useMutation({
    mutationFn: (p: ABVariantPayload) => createABVariant(id!, p),
    onSuccess: () => { invalidate(); setShowForm(false); setForm(emptyVariantForm()) },
  })
  const updateMut = useMutation({
    mutationFn: ({ vid, p }: { vid: string; p: ABVariantPayload }) => updateABVariant(id!, vid, p),
    onSuccess: () => { invalidate(); setEditingId(null); setShowForm(false) },
  })
  const deleteMut = useMutation({ mutationFn: (vid: string) => deleteABVariant(id!, vid), onSuccess: invalidate })
  const toggleMut = useMutation({
    mutationFn: ({ enabled, splitPct }: { enabled: boolean; splitPct: number }) =>
      patchABTestSettings(id!, enabled, splitPct),
    onSuccess: () => { void refetchQR() },
  })

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError("")
    if (!form.name.trim()) { setError("Name is required"); return }
    if (!form.targetUrl.startsWith("http")) { setError("Please enter a valid https:// URL"); return }
    const pct = Number(form.splitPct)
    if (!Number.isFinite(pct) || pct < 1 || pct > 99) { setError("Split % must be 1–99"); return }
    const payload: ABVariantPayload = { name: form.name.trim(), targetUrl: form.targetUrl, splitPct: pct }
    if (editingId) {
      updateMut.mutate({ vid: editingId, p: payload })
    } else {
      createMut.mutate(payload)
    }
  }

  function startEdit(v: ABVariant) {
    setEditingId(v.id)
    setForm({ name: v.name, targetUrl: v.targetUrl, splitPct: String(v.splitPct) })
    setShowForm(true)
    setError("")
  }

  function cancelForm() { setShowForm(false); setEditingId(null); setForm(emptyVariantForm()); setError("") }

  const totalScans = variants.reduce((s, v) => s + v.scanCount, 0)
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
          <h1 className="text-xl font-bold text-zinc-900 dark:text-white">A/B Testing</h1>
          <p className="text-zinc-500 text-sm">{qr?.name ?? "..."} — split traffic between two destinations</p>
        </div>
      </div>

      {/* Reachable directly by URL, and a plan can change under an open tab, so
          the page states the plan requirement itself rather than letting every
          mutation fail with a 403. */}
      {!abTesting.isLoading && !abTesting.allowed && (
        <FeatureLocked
          feature="abTesting"
          title="A/B testing is a Pro feature"
          description="Send a share of your scans to one destination and the rest to another, then compare which converts better."
        />
      )}

      {abTesting.allowed && (
        <>

      {/* Enable / disable toggle + split % */}
      <Card>
        <CardContent className="pt-5 pb-5">
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div>
              <div className="text-sm font-semibold text-zinc-800 dark:text-zinc-200 mb-1">A/B Test Status</div>
              <p className="text-zinc-500 text-xs">When enabled, traffic is split between the variants below.</p>
            </div>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <span className="text-xs text-zinc-500">Variant A split %</span>
                <Input
                  type="number" min={1} max={99}
                  value={splitPctEdit}
                  onChange={e => setSplitPctEdit(e.target.value)}
                  className="w-20 h-8 text-xs"
                  placeholder={String(qr?.abTestSplitPct ?? 50)}
                />
              </div>
              <Button
                size="sm"
                variant={qr?.abTestEnabled ? "destructive" : "default"}
                disabled={toggleMut.isPending || variants.length < 2}
                onClick={() => toggleMut.mutate({ enabled: !qr?.abTestEnabled, splitPct: Number(splitPctEdit) || (qr?.abTestSplitPct ?? 50) })}
              >
                {toggleMut.isPending && <Loader2 size={13} className="animate-spin mr-1.5" />}
                {qr?.abTestEnabled ? "Disable A/B Test" : "Enable A/B Test"}
              </Button>
            </div>
          </div>
          {variants.length < 2 && (
            <p className="text-amber-400/80 text-xs mt-3">⚠ Add 2 variants before enabling the test.</p>
          )}
        </CardContent>
      </Card>

      {/* Variants */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-3">
          <CardTitle className="text-base">Variants ({variants.length} / 2)</CardTitle>
          {!showForm && variants.length < 2 && (
            <Button size="sm" onClick={() => { setShowForm(true); setEditingId(null); setForm(emptyVariantForm()) }}>
              <Plus size={14} className="mr-1" />Add Variant
            </Button>
          )}
        </CardHeader>
        <CardContent className="p-0">
          {isLoading && (
            <div className="flex justify-center py-10"><Loader2 size={20} className="animate-spin text-zinc-500" /></div>
          )}
          {!isLoading && variants.length === 0 && !showForm && (
            <p className="text-zinc-500 text-sm text-center py-10">No variants yet. Add Variant A and Variant B.</p>
          )}

          {variants.map((v, i) => {
            const pct = totalScans > 0 ? Math.round((v.scanCount / totalScans) * 100) : null
            return (
              <div key={v.id} className={`px-6 py-4 ${i < variants.length - 1 ? "border-b border-zinc-200 dark:border-zinc-800" : ""}`}>
                <div className="flex flex-wrap items-center gap-3 mb-2">
                  <div className="w-7 h-7 rounded-full bg-violet-600/20 border border-violet-500/30 flex items-center justify-center text-xs text-violet-300 font-semibold shrink-0">
                    {String.fromCharCode(65 + i)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-zinc-800 dark:text-zinc-200 text-sm font-medium">{v.name}</div>
                    <div className="text-zinc-500 text-xs truncate">{v.targetUrl}</div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <div className="flex items-center gap-1 text-zinc-400 text-xs">
                      <BarChart3 size={12} />
                      <span>{v.scanCount.toLocaleString()} scans{pct !== null ? ` (${pct}%)` : ""}</span>
                    </div>
                    <Badge variant="secondary" className="text-[10px]">{v.splitPct}%</Badge>
                    <button onClick={() => startEdit(v)} className="w-7 h-7 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 flex items-center justify-center text-zinc-500 hover:text-zinc-900 dark:hover:text-white transition-colors">
                      <Edit2 size={13} />
                    </button>
                    <button
                      onClick={() => deleteMut.mutate(v.id)}
                      disabled={deleteMut.isPending}
                      className="w-7 h-7 rounded-lg hover:bg-red-500/10 flex items-center justify-center text-zinc-500 hover:text-red-400 transition-colors"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>
                {totalScans > 0 && (
                  <div className="ml-10 h-1.5 bg-zinc-200 dark:bg-zinc-800 rounded-full overflow-hidden">
                    <div className="h-full bg-violet-600/70 rounded-full" style={{ width: `${pct ?? 0}%` }} />
                  </div>
                )}
              </div>
            )
          })}

          {/* Add / Edit form */}
          {showForm && (
            <form onSubmit={handleSubmit} className="p-6 border-t border-zinc-200 dark:border-zinc-800 space-y-4">
              <div className="text-sm font-semibold text-zinc-800 dark:text-zinc-200 mb-2">
                {editingId ? "Edit Variant" : `Variant ${String.fromCharCode(65 + variants.length)}`}
              </div>
              <div>
                <label className="text-xs text-zinc-500 mb-1 block">Variant Name</label>
                <Input placeholder="e.g. Homepage v2" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} className="h-9 text-sm" />
              </div>
              <div>
                <label className="text-xs text-zinc-500 mb-1 block">Redirect URL</label>
                <Input placeholder="https://example.com/variant-b" value={form.targetUrl} onChange={e => setForm(f => ({ ...f, targetUrl: e.target.value }))} className="h-9 text-sm" />
              </div>
              <div>
                <label className="text-xs text-zinc-500 mb-1 block">Traffic Split % (percent sent to this variant)</label>
                <Input type="number" min={1} max={99} value={form.splitPct} onChange={e => setForm(f => ({ ...f, splitPct: e.target.value }))} className="h-9 text-sm w-28" />
              </div>
              {error && <p className="text-red-400 text-xs">{error}</p>}
              <div className="flex gap-2 pt-1">
                <Button type="submit" size="sm" disabled={isSaving}>
                  {isSaving ? <Loader2 size={14} className="animate-spin mr-1" /> : <Check size={14} className="mr-1" />}
                  {editingId ? "Update" : "Add Variant"}
                </Button>
                <Button type="button" variant="ghost" size="sm" onClick={cancelForm}>Cancel</Button>
              </div>
            </form>
          )}
        </CardContent>
      </Card>
      </>
      )}
    </div>
  )
}
