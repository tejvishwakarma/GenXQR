import { useQuery, useMutation } from "@tanstack/react-query"
import {
  Loader2, Trash2, HardDrive, Database,
  FileImage, FileVideo, FileText, File,
  CheckCircle2, AlertTriangle,
} from "lucide-react"
import { fetchAdminStorage, cleanupOrphans, getTokenRole } from "@/lib/api"

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatBytes(bytes: number, decimals = 1): string {
  if (bytes === 0) return "0 B"
  if (bytes < 1024)         return `${bytes} B`
  if (bytes < 1_048_576)    return `${(bytes / 1024).toFixed(decimals)} KB`
  if (bytes < 1_073_741_824) return `${(bytes / 1_048_576).toFixed(decimals)} MB`
  return `${(bytes / 1_073_741_824).toFixed(2)} GB`
}

// Palette for breakdown bars — cycles if more types than colors
const BAR_GRADIENTS = [
  "from-violet-500 to-purple-600",
  "from-sky-500 to-blue-600",
  "from-emerald-500 to-teal-600",
  "from-amber-500 to-orange-600",
  "from-rose-500 to-pink-600",
  "from-indigo-500 to-blue-700",
]

const BAR_BG = [
  "bg-violet-500/15 text-violet-300",
  "bg-sky-500/15 text-sky-300",
  "bg-emerald-500/15 text-emerald-300",
  "bg-amber-500/15 text-amber-300",
  "bg-rose-500/15 text-rose-300",
  "bg-indigo-500/15 text-indigo-300",
]

function typeIcon(type: string) {
  const t = type.toLowerCase()
  if (t.includes("image") || t.includes("png") || t.includes("jpg") || t.includes("webp"))
    return <FileImage size={14} />
  if (t.includes("video") || t.includes("mp4"))
    return <FileVideo size={14} />
  if (t.includes("pdf") || t.includes("text") || t.includes("doc"))
    return <FileText size={14} />
  return <File size={14} />
}

// ─── Radial ring (pure CSS / SVG) ────────────────────────────────────────────

function UsageRing({ usedGB, totalCapacityGB = 100 }: { usedGB: number; totalCapacityGB?: number }) {
  const pct     = Math.min((usedGB / totalCapacityGB) * 100, 100)
  const r       = 54
  const circ    = 2 * Math.PI * r
  const dash    = circ * (pct / 100)
  const color   = pct > 85 ? "#f87171" : pct > 65 ? "#fb923c" : "#34d399"

  return (
    <div className="relative w-36 h-36 flex-shrink-0">
      <svg viewBox="0 0 120 120" className="w-full h-full -rotate-90">
        <circle cx="60" cy="60" r={r} fill="none" stroke="#27272a" strokeWidth="10" />
        <circle
          cx="60" cy="60" r={r}
          fill="none"
          stroke={color}
          strokeWidth="10"
          strokeDasharray={`${dash} ${circ}`}
          strokeLinecap="round"
          style={{ transition: "stroke-dasharray 0.6s ease" }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-2xl font-bold text-white tabular-nums">{usedGB}</span>
        <span className="text-xs text-zinc-500">GB used</span>
      </div>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function AdminStoragePage() {
  const isSuperAdmin = getTokenRole() === "SUPER_ADMIN"

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["admin", "storage"],
    queryFn: fetchAdminStorage,
  })

  const cleanMut = useMutation({
    mutationFn: cleanupOrphans,
    onSuccess: () => refetch(),
  })

  const storage = data?.data

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-8 h-8 text-red-400 animate-spin" />
          <p className="text-zinc-500 text-sm">Loading storage metrics…</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6 max-w-4xl">

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div>
        <h1 className="text-2xl font-bold text-white tracking-tight">Storage</h1>
        <p className="text-zinc-500 text-sm mt-0.5">Platform-wide file storage overview</p>
      </div>

      {/* ── Cleanup success banner ─────────────────────────────────────────── */}
      {cleanMut.data && (
        <div className="flex items-center gap-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl px-4 py-3">
          <CheckCircle2 size={16} className="text-emerald-400 shrink-0" />
          <p className="text-emerald-300 text-sm">
            Cleanup complete — <strong>{cleanMut.data.data.deleted}</strong> orphaned records removed.
          </p>
        </div>
      )}

      {storage ? (
        <>
          {/* ── Hero: usage ring + quick stats ─────────────────────────────── */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6">
            <div className="flex items-center gap-8 flex-wrap">
              <UsageRing usedGB={Number(storage.totalGB)} />

              <div className="flex-1 min-w-0 space-y-4">
                <div>
                  <p className="text-[11px] font-semibold text-zinc-500 uppercase tracking-widest mb-1">Total Storage Used</p>
                  <p className="text-3xl font-bold text-white">{storage.totalGB} <span className="text-xl text-zinc-400">GB</span></p>
                  <p className="text-zinc-500 text-sm mt-0.5">{formatBytes(storage.totalBytes)}</p>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-zinc-800/60 rounded-xl px-4 py-3">
                    <p className="text-xs text-zinc-500 mb-1">File Types</p>
                    <p className="text-lg font-semibold text-white">{storage.byType.length}</p>
                  </div>
                  <div className="bg-zinc-800/60 rounded-xl px-4 py-3">
                    <p className="text-xs text-zinc-500 mb-1">Total Files</p>
                    <p className="text-lg font-semibold text-white">
                      {storage.byType.reduce((s, t) => s + t.count, 0).toLocaleString()}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* ── Breakdown by type ──────────────────────────────────────────── */}
          {storage.byType.length > 0 && (
            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 space-y-5">
              <div className="flex items-center gap-2">
                <Database size={15} className="text-zinc-500" />
                <h2 className="text-sm font-semibold text-zinc-200">Breakdown by File Type</h2>
              </div>

              <div className="space-y-4">
                {storage.byType
                  .slice()
                  .sort((a, b) => b.bytes - a.bytes)
                  .map((row, idx) => {
                    const pct     = storage.totalBytes ? (row.bytes / storage.totalBytes) * 100 : 0
                    const grad    = BAR_GRADIENTS[idx % BAR_GRADIENTS.length]
                    const chipCls = BAR_BG[idx % BAR_BG.length]

                    return (
                      <div key={row.type} className="space-y-1.5">
                        <div className="flex items-center justify-between gap-3">
                          <div className="flex items-center gap-2 min-w-0">
                            <span className={`flex-shrink-0 w-6 h-6 rounded-md flex items-center justify-center ${chipCls}`}>
                              {typeIcon(row.type)}
                            </span>
                            <span className="text-sm font-medium text-zinc-200 truncate">{row.type}</span>
                            <span className="text-xs text-zinc-600 flex-shrink-0">{row.count} files</span>
                          </div>
                          <div className="flex items-center gap-3 flex-shrink-0">
                            <span className="text-xs text-zinc-400">{formatBytes(row.bytes)}</span>
                            <span className="text-xs font-semibold text-white w-10 text-right tabular-nums">
                              {pct.toFixed(1)}%
                            </span>
                          </div>
                        </div>

                        <div className="h-2 bg-zinc-800 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full bg-gradient-to-r ${grad} transition-all duration-700`}
                            style={{ width: `${Math.max(pct, 0.5)}%` }}
                          />
                        </div>
                      </div>
                    )
                  })}
              </div>
            </div>
          )}

          {/* ── Top QRs by storage (if present) ───────────────────────────── */}
          {storage.topQRsByStorage && storage.topQRsByStorage.length > 0 && (
            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 space-y-4">
              <div className="flex items-center gap-2">
                <HardDrive size={15} className="text-zinc-500" />
                <h2 className="text-sm font-semibold text-zinc-200">Top QR Codes by Storage</h2>
              </div>
              <div className="space-y-2">
                {storage.topQRsByStorage.map((item, idx) => (
                  <div
                    key={item.qrId}
                    className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-zinc-800/40 hover:bg-zinc-800/70 transition"
                  >
                    <span className="text-xs text-zinc-600 w-4 text-center tabular-nums font-medium">{idx + 1}</span>
                    <code className="text-xs text-zinc-400 font-mono flex-1 truncate">{item.qrId}</code>
                    <span className="text-xs font-semibold text-white flex-shrink-0">{formatBytes(item.bytes)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── Cleanup card (SUPER_ADMIN only) ────────────────────────────── */}
          {isSuperAdmin && (
            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6">
              <div className="flex items-start gap-4">
                <div className="w-10 h-10 rounded-xl bg-red-500/10 flex items-center justify-center flex-shrink-0">
                  <AlertTriangle size={18} className="text-red-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="text-sm font-semibold text-zinc-200 mb-1">Orphan File Cleanup</h3>
                  <p className="text-zinc-500 text-xs leading-relaxed">
                    Removes file records that are no longer linked to any QR code. This action is irreversible —
                    the actual files will be deleted from storage.
                  </p>
                </div>
                <button
                  onClick={() => {
                    if (window.confirm("Run orphan cleanup? This deletes file records with no parent QR code.")) {
                      cleanMut.mutate()
                    }
                  }}
                  disabled={cleanMut.isPending}
                  className="flex items-center gap-2 px-4 py-2 bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 text-red-400 text-sm rounded-xl transition disabled:opacity-50 flex-shrink-0"
                >
                  {cleanMut.isPending ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                  {cleanMut.isPending ? "Cleaning…" : "Run Cleanup"}
                </button>
              </div>
            </div>
          )}
        </>
      ) : (
        <div className="flex flex-col items-center gap-3 py-24">
          <div className="w-14 h-14 rounded-2xl bg-zinc-800 flex items-center justify-center">
            <HardDrive size={26} className="text-zinc-600" />
          </div>
          <p className="text-zinc-400 font-medium">No storage data available</p>
        </div>
      )}
    </div>
  )
}
