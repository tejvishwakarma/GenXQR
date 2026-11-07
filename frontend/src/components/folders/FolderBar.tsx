import { useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Folder, FolderOpen, Pencil, Plus, Trash2 } from "lucide-react"
import { ApiError, createFolder, deleteFolder, getFolders, renameFolder } from "@/lib/api"
import { useWorkspace } from "@/hooks/useWorkspace"
import { cn } from "@/lib/utils"

/**
 * The folder strip above My QR Codes: All / No folder / each folder, plus adding,
 * renaming and deleting folders. `value` is "all", "none" or a folder id.
 */
export function FolderBar({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const qc = useQueryClient()
  const { can } = useWorkspace()
  const { data } = useQuery({ queryKey: ["folders"], queryFn: getFolders, staleTime: 30_000 })
  const folders = data?.data ?? []
  const active = folders.find((f) => f.id === value)
  // "new" = naming a new folder; a folder id = renaming that folder.
  const [editing, setEditing] = useState<string | null>(null)
  const [name, setName] = useState("")
  const [error, setError] = useState<string | null>(null)

  const refresh = () => Promise.all([
    qc.invalidateQueries({ queryKey: ["folders"] }),
    qc.invalidateQueries({ queryKey: ["qr-codes"] }),
  ])

  const save = useMutation({
    mutationFn: () => (editing === "new" ? createFolder(name.trim()) : renameFolder(editing!, name.trim())),
    onSuccess: async (res) => {
      await refresh()
      if (editing === "new") onChange(res.data.id)
      setEditing(null)
      setError(null)
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : "Could not save the folder."),
  })

  const remove = useMutation({
    mutationFn: (id: string) => deleteFolder(id),
    onSuccess: async () => {
      onChange("all")
      await refresh()
    },
  })

  const chip = (key: string, label: React.ReactNode, count?: number) => (
    <button
      key={key}
      type="button"
      onClick={() => onChange(key)}
      aria-pressed={value === key}
      className={cn(
        "shrink-0 inline-flex items-center gap-1.5 h-8 px-3 rounded-lg text-sm border transition-colors",
        value === key
          ? "bg-violet-600 border-violet-600 text-white"
          : "bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 text-zinc-700 dark:text-zinc-300 hover:border-violet-500/60",
      )}
    >
      {label}
      {count !== undefined && <span className={cn("text-xs tabular-nums", value === key ? "text-white/80" : "text-zinc-400")}>{count}</span>}
    </button>
  )

  if (editing) {
    return (
      <div>
        <div className="flex gap-2">
          <input
            autoFocus
            value={name}
            maxLength={80}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && name.trim()) save.mutate()
              if (e.key === "Escape") { setEditing(null); setError(null) }
            }}
            placeholder="Folder name, e.g. Diwali 2026"
            aria-label="Folder name"
            className="flex-1 max-w-sm h-9 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 text-sm text-zinc-900 dark:text-white focus:outline-none focus:border-violet-500"
          />
          <button type="button" onClick={() => save.mutate()} disabled={save.isPending || !name.trim()}
            className="h-9 px-3 rounded-lg bg-violet-600 text-white text-sm font-medium disabled:opacity-50">
            {editing === "new" ? "Add folder" : "Rename"}
          </button>
          <button type="button" onClick={() => { setEditing(null); setError(null) }}
            className="h-9 px-3 rounded-lg border border-zinc-300 dark:border-zinc-700 text-sm text-zinc-600 dark:text-zinc-300">
            Cancel
          </button>
        </div>
        {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
      </div>
    )
  }

  if (folders.length === 0 && value === "all") {
    return can("qr:create") ? (
      <button type="button" onClick={() => { setName(""); setEditing("new") }}
        className="inline-flex items-center gap-1.5 text-sm text-zinc-500 hover:text-violet-500">
        <Folder size={15} /> Organise codes into folders <Plus size={13} />
      </button>
    ) : null
  }

  return (
    <div className="flex items-center gap-2">
      <div className="flex items-center gap-2 overflow-x-auto pb-1 -mb-1 min-w-0" role="group" aria-label="Folders">
        {chip("all", "All codes")}
        {chip("none", "No folder")}
        {folders.map((f) => chip(f.id, <><FolderOpen size={14} className={value === f.id ? "" : "text-violet-500"} />{f.name}</>, f.codeCount))}
        {can("qr:create") && (
          <button type="button" onClick={() => { setName(""); setEditing("new") }}
            className="shrink-0 inline-flex items-center gap-1 h-8 px-2.5 rounded-lg text-sm text-zinc-500 hover:text-violet-500 border border-dashed border-zinc-300 dark:border-zinc-700">
            <Plus size={14} /> New folder
          </button>
        )}
      </div>
      {active && (
        <div className="flex items-center gap-1 shrink-0 border-l border-zinc-200 dark:border-zinc-800 pl-2">
          {can("qr:edit") && (
            <button type="button" title="Rename folder" aria-label="Rename folder"
              onClick={() => { setName(active.name); setEditing(active.id) }}
              className="w-8 h-8 rounded-lg flex items-center justify-center text-zinc-500 hover:text-violet-500 hover:bg-violet-500/10">
              <Pencil size={14} />
            </button>
          )}
          {can("qr:delete") && (
            <button type="button" title="Delete folder" aria-label="Delete folder" disabled={remove.isPending}
              onClick={() => {
                if (window.confirm(`Delete the folder "${active.name}"? Its ${active.codeCount} code${active.codeCount === 1 ? "" : "s"} stay, in no folder.`)) remove.mutate(active.id)
              }}
              className="w-8 h-8 rounded-lg flex items-center justify-center text-zinc-500 hover:text-red-500 hover:bg-red-500/10 disabled:opacity-50">
              <Trash2 size={14} />
            </button>
          )}
        </div>
      )}
    </div>
  )
}
