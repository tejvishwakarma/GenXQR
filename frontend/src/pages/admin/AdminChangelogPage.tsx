import { useState } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { AlertTriangle, Loader2, Save } from "lucide-react"
import { fetchPlatformSettings, getTokenRole, updatePlatformSettings } from "@/lib/api"

type ChangelogEntry = {
  version: string
  date: string
  title: string
  items: string[]
  icon?: string
}

type Settings = Record<string, string>

const KEY = "changelog_sections"

const DEFAULT_CHANGELOG: ChangelogEntry[] = [
  {
    version: "v1.9.0",
    date: "March 2026",
    title: "Marketing page refresh",
    items: [
      "Redesigned Features, About, and Use Cases pages",
      "Added Cookie Policy, GDPR, Careers, and Changelog routes",
      "Improved route scroll-to-top behavior",
    ],
    icon: "sparkles",
  },
]

export default function AdminChangelogPage() {
  const role = getTokenRole()
  const isSuperAdmin = role === "SUPER_ADMIN"
  const qc = useQueryClient()

  const { data, isLoading } = useQuery({
    queryKey: ["admin", "settings"],
    queryFn: fetchPlatformSettings,
  })

  const settings: Settings = data?.data ?? {}
  const [dirty, setDirty] = useState<Settings>({})
  const merged: Settings = { ...settings, ...dirty }

  const mutation = useMutation({
    mutationFn: () => updatePlatformSettings(dirty),
    onSuccess: (res) => {
      qc.setQueryData(["admin", "settings"], res)
      setDirty({})
    },
  })

  function set(key: string, value: string) {
    setDirty((d) => ({ ...d, [key]: value }))
  }

  function parseJsonArray<T>(raw: string | undefined, fallback: T[]): T[] {
    if (!raw) return fallback
    try {
      const parsed = JSON.parse(raw) as unknown
      return Array.isArray(parsed) ? (parsed as T[]) : fallback
    } catch {
      return fallback
    }
  }

  const changelogEntries = parseJsonArray<ChangelogEntry>(merged[KEY], DEFAULT_CHANGELOG)
  const hasDirty = Object.keys(dirty).length > 0

  function setChangelog(entries: ChangelogEntry[]) {
    set(KEY, JSON.stringify(entries))
  }

  if (!isSuperAdmin) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-4">
        <AlertTriangle className="text-amber-400" size={40} />
        <p className="text-zinc-400 text-lg">SUPER_ADMIN role required to manage changelog content.</p>
      </div>
    )
  }

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-2xl font-bold text-white mb-1">Changelog Content</h1>
        <p className="text-zinc-500 text-sm">Manage entries shown on the public changelog page.</p>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16"><Loader2 className="w-7 h-7 text-red-400 animate-spin" /></div>
      ) : (
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 space-y-4">
          <div className="space-y-4">
            {changelogEntries.map((entry, index) => (
              <div key={`${entry.version}-${index}`} className="border border-zinc-800 rounded-xl p-4 space-y-3">
                <div className="grid md:grid-cols-2 gap-3">
                  <input
                    value={entry.version}
                    onChange={(e) => {
                      const next = [...changelogEntries]
                      next[index] = { ...entry, version: e.target.value }
                      setChangelog(next)
                    }}
                    placeholder="Version (e.g., v1.9.1)"
                    className="bg-zinc-800 border border-zinc-700 text-white text-sm rounded-lg px-3 py-2"
                  />
                  <input
                    value={entry.date}
                    onChange={(e) => {
                      const next = [...changelogEntries]
                      next[index] = { ...entry, date: e.target.value }
                      setChangelog(next)
                    }}
                    placeholder="Date (e.g., March 2026)"
                    className="bg-zinc-800 border border-zinc-700 text-white text-sm rounded-lg px-3 py-2"
                  />
                </div>

                <input
                  value={entry.title}
                  onChange={(e) => {
                    const next = [...changelogEntries]
                    next[index] = { ...entry, title: e.target.value }
                    setChangelog(next)
                  }}
                  placeholder="Release title"
                  className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm rounded-lg px-3 py-2"
                />

                <textarea
                  value={entry.items.join("\n")}
                  onChange={(e) => {
                    const next = [...changelogEntries]
                    next[index] = {
                      ...entry,
                      items: e.target.value
                        .split("\n")
                        .map((line) => line.trim())
                        .filter(Boolean),
                    }
                    setChangelog(next)
                  }}
                  rows={4}
                  placeholder="One bullet point per line"
                  className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm rounded-lg px-3 py-2"
                />

                <div className="flex justify-end">
                  <button
                    onClick={() => setChangelog(changelogEntries.filter((_, i) => i !== index))}
                    className="text-xs text-red-400 hover:text-red-300"
                  >
                    Remove entry
                  </button>
                </div>
              </div>
            ))}
          </div>

          <button
            onClick={() => setChangelog([...changelogEntries, { version: "", date: "", title: "", items: [] }])}
            className="text-sm text-red-400 hover:text-red-300"
          >
            + Add changelog entry
          </button>
        </div>
      )}

      {hasDirty && (
        <div className="flex items-center justify-between p-4 bg-zinc-900 border border-amber-500/30 rounded-xl">
          <p className="text-amber-300 text-sm">You have unsaved changes.</p>
          <div className="flex gap-3">
            <button onClick={() => setDirty({})} className="px-4 py-2 text-sm text-zinc-400 hover:text-zinc-200 transition">
              Discard
            </button>
            <button onClick={() => mutation.mutate()} disabled={mutation.isPending}
              className="flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-500 text-white text-sm rounded-xl transition disabled:opacity-50">
              {mutation.isPending ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
              Save Changes
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
