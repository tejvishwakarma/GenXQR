import { useState } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { Folder, Plus } from "lucide-react"
import { ApiError, createFolder, getFolders } from "@/lib/api"

/**
 * "Which folder?" on the QR editor: one of the account's folders, or a new one
 * named on the spot. "" = no folder.
 */
export function FolderPicker({ value, onChange }: { value: string; onChange: (folderId: string) => void }) {
  const qc = useQueryClient()
  const { data } = useQuery({ queryKey: ["folders"], queryFn: getFolders, staleTime: 60_000 })
  const folders = data?.data ?? []
  const [naming, setNaming] = useState(false)
  const [name, setName] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const add = async () => {
    if (!name.trim()) return
    setSaving(true)
    setError(null)
    try {
      const res = await createFolder(name.trim())
      await qc.invalidateQueries({ queryKey: ["folders"] })
      onChange(res.data.id)
      setNaming(false)
      setName("")
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not add the folder.")
    } finally {
      setSaving(false)
    }
  }

  return (
    <div>
      <label className="label-text" htmlFor="qr-folder">Folder <span className="text-zinc-500 font-normal">(optional)</span></label>
      {naming ? (
        <div className="flex gap-2">
          <input
            autoFocus
            value={name}
            maxLength={80}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") { e.preventDefault(); void add() }
              if (e.key === "Escape") setNaming(false)
            }}
            placeholder="Folder name, e.g. Diwali 2026"
            className="flex-1 h-10 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 text-sm text-zinc-900 dark:text-white focus:outline-none focus:border-violet-500"
          />
          <button type="button" onClick={() => void add()} disabled={saving || !name.trim()}
            className="h-10 px-3 rounded-xl bg-violet-600 text-white text-sm font-medium disabled:opacity-50 shrink-0">
            Add
          </button>
          <button type="button" onClick={() => { setNaming(false); setError(null) }}
            className="h-10 px-3 rounded-xl border border-zinc-200 dark:border-zinc-700 text-sm text-zinc-600 dark:text-zinc-300 shrink-0">
            Cancel
          </button>
        </div>
      ) : (
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Folder size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
            <select
              id="qr-folder"
              value={value}
              onChange={(e) => onChange(e.target.value)}
              className="w-full h-10 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 pl-9 pr-3 text-sm text-zinc-900 dark:text-white"
            >
              <option value="">No folder</option>
              {folders.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
            </select>
          </div>
          <button
            type="button"
            onClick={() => setNaming(true)}
            className="h-10 px-3 rounded-xl border border-zinc-200 dark:border-zinc-700 text-sm text-zinc-700 dark:text-zinc-300 hover:border-violet-500 hover:text-violet-500 inline-flex items-center gap-1.5 shrink-0"
          >
            <Plus size={14} /> New folder
          </button>
        </div>
      )}
      {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
    </div>
  )
}
