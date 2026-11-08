import { useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Bookmark, Check, Loader2, Plus, X } from "lucide-react"
import { ApiError, createDesignTemplate, deleteDesignTemplate, getDesignTemplates, type DesignTemplate } from "@/lib/api"
import { useWorkspace } from "@/hooks/useWorkspace"
import { cn } from "@/lib/utils"

/**
 * "Brand templates" at the top of the editor's design step: apply a saved
 * design in one click, or save the current one (backend design-template.service).
 */
export function DesignTemplates({
  current,
  onApply,
}: {
  current: () => DesignTemplate["design"]
  onApply: (design: DesignTemplate["design"]) => void
}) {
  const qc = useQueryClient()
  const { can } = useWorkspace()
  const { data } = useQuery({ queryKey: ["design-templates"], queryFn: getDesignTemplates, staleTime: 60_000 })
  const templates = data?.data ?? []
  const [applied, setApplied] = useState<string | null>(null)
  const [naming, setNaming] = useState(false)
  const [name, setName] = useState("")
  const [error, setError] = useState<string | null>(null)

  const save = useMutation({
    mutationFn: () => createDesignTemplate(name.trim(), current()),
    onSuccess: async (res) => {
      await qc.invalidateQueries({ queryKey: ["design-templates"] })
      setApplied(res.data.id)
      setNaming(false)
      setName("")
      setError(null)
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : "Could not save the template."),
  })
  const remove = useMutation({
    mutationFn: (id: string) => deleteDesignTemplate(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["design-templates"] }),
  })

  return (
    <div>
      <h3 className="text-zinc-700 dark:text-zinc-300 font-medium text-sm mb-1 flex items-center gap-2">
        <Bookmark size={14} className="text-violet-400" /> Brand templates
      </h3>
      <p className="text-zinc-600 text-[11px] mb-3">
        {templates.length ? "Apply a saved look in one click — colours, dots, frame and logo." : "Save this design to reuse it on your other codes."}
      </p>

      <div className="flex flex-wrap gap-2">
        {templates.map((t) => (
          <span key={t.id} className={cn(
            "inline-flex items-center rounded-lg border text-sm transition-colors",
            applied === t.id ? "border-violet-500 bg-violet-500/10" : "border-zinc-200 dark:border-zinc-700",
          )}>
            <button type="button" onClick={() => { onApply(t.design); setApplied(t.id) }}
              className="inline-flex items-center gap-1.5 pl-2.5 pr-2 h-8 text-zinc-700 dark:text-zinc-200">
              <span className="w-3.5 h-3.5 rounded-sm border border-black/10" style={{ background: t.design.primaryColor ?? "#000" }} aria-hidden />
              {t.name}
              {applied === t.id && <Check size={13} className="text-violet-500" />}
            </button>
            {can("qr:delete") && (
              <button type="button" aria-label={`Delete template ${t.name}`} title="Delete template"
                onClick={() => { if (window.confirm(`Delete the template "${t.name}"? Codes already made with it keep their design.`)) remove.mutate(t.id) }}
                className="pr-2 h-8 text-zinc-400 hover:text-red-500">
                <X size={13} />
              </button>
            )}
          </span>
        ))}

        {can("qr:create") && !naming && (
          <button type="button" onClick={() => { setNaming(true); setError(null) }}
            className="inline-flex items-center gap-1 h-8 px-2.5 rounded-lg border border-dashed border-zinc-300 dark:border-zinc-700 text-sm text-zinc-500 hover:text-violet-500 hover:border-violet-500/60">
            <Plus size={13} /> Save current design
          </button>
        )}
      </div>

      {naming && (
        <div className="mt-2 flex gap-2">
          <input
            autoFocus
            value={name}
            maxLength={60}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") { e.preventDefault(); if (name.trim()) save.mutate() }
              if (e.key === "Escape") setNaming(false)
            }}
            placeholder="Template name, e.g. Blue Cafe brand"
            aria-label="Template name"
            className="flex-1 h-9 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 text-sm text-zinc-900 dark:text-white focus:outline-none focus:border-violet-500"
          />
          <button type="button" onClick={() => save.mutate()} disabled={save.isPending || !name.trim()}
            className="h-9 px-3 rounded-lg bg-violet-600 text-white text-sm font-medium disabled:opacity-50 inline-flex items-center gap-1.5">
            {save.isPending && <Loader2 size={13} className="animate-spin" />} Save
          </button>
          <button type="button" onClick={() => { setNaming(false); setError(null) }}
            className="h-9 px-3 rounded-lg border border-zinc-300 dark:border-zinc-700 text-sm text-zinc-600 dark:text-zinc-300">
            Cancel
          </button>
        </div>
      )}
      {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
    </div>
  )
}
