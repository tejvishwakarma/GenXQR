import { useState, useEffect, useCallback, useMemo } from "react"
import { Link, useSearchParams } from "react-router-dom"
import { createPortal } from "react-dom"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import {
  QrCode, Plus, Search, X, Edit, BarChart3, Trash2, Loader2,
  Power, PowerOff, Copy, CheckSquare, Square, ChevronLeft, ChevronRight,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { DownloadMenu } from "@/components/QRDownloadMenu"
import { QRTypeIcon } from "@/lib/qrTypeIcon"
import { listQRs, deleteQR, toggleQR, duplicateQR, getQrBaseUrl, type QRCode } from "@/lib/api"

const TYPE_LABEL: Record<string, string> = {
  URL: "URL", PDF: "PDF", VIDEO: "Video", LINKS: "Multi-Link", SOCIAL_MEDIA: "Social",
  VCARD: "vCard", IMAGE_GALLERY: "Gallery", BUSINESS: "Business", APP: "App", MP3: "Audio",
  MENU: "Menu", WIFI: "WiFi", WHATSAPP: "WhatsApp", INSTAGRAM: "Instagram", FACEBOOK: "Facebook", COUPON: "Coupon",
}
const PAGE_SIZE = 20

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
}

export default function MyQRCodesPage() {
  const queryClient = useQueryClient()
  const [searchParams, setSearchParams] = useSearchParams()

  // Search is seeded from ?q= (set by the global header search box) and kept in the URL.
  const urlQuery = searchParams.get("q") ?? ""
  const [searchInput, setSearchInput] = useState(urlQuery)
  const [search, setSearch] = useState(urlQuery)
  const [typeFilter, setTypeFilter] = useState("all")
  const [statusFilter, setStatusFilter] = useState("all")
  const [page, setPage] = useState(1)

  // Keep the input in sync if the URL query changes (e.g. header search navigates here again).
  useEffect(() => { setSearchInput(urlQuery); setSearch(urlQuery) }, [urlQuery])

  // Debounce the text input → committed search term; reset to page 1 on change.
  useEffect(() => {
    const t = setTimeout(() => {
      setSearch(searchInput.trim())
      setPage(1)
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev)
        if (searchInput.trim()) next.set("q", searchInput.trim())
        else next.delete("q")
        return next
      }, { replace: true })
    }, 350)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchInput])

  const { data, isLoading, isError } = useQuery({
    queryKey: ["qr-codes", "list", page, search],
    queryFn: () => listQRs({ page, limit: PAGE_SIZE, search: search || undefined }),
  })

  const qrs: QRCode[] = data?.data ?? []
  const pagination = data?.pagination

  const invalidate = useCallback(
    () => queryClient.invalidateQueries({ queryKey: ["qr-codes"] }),
    [queryClient],
  )

  const { mutate: remove, isPending: isDeleting } = useMutation({ mutationFn: deleteQR, onSuccess: invalidate })
  const { mutate: toggle, isPending: isToggling } = useMutation({ mutationFn: toggleQR, onSuccess: invalidate })
  const { mutate: duplicate, isPending: isDuplicating } = useMutation({ mutationFn: duplicateQR, onSuccess: invalidate })

  // Client-side type/status filter — narrows the current page.
  const visibleQRs = useMemo(() => qrs.filter((qr) => {
    if (typeFilter !== "all" && qr.type !== typeFilter) return false
    if (statusFilter === "active" && !qr.isActive) return false
    if (statusFilter === "inactive" && qr.isActive) return false
    return true
  }), [qrs, typeFilter, statusFilter])

  const uniqueTypes = useMemo(() => [...new Set(qrs.map((q) => q.type))], [qrs])

  // ─── Bulk selection ─────────────────────────────────────────────────────────
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [bulkOp, setBulkOp] = useState<"delete" | "download" | "activate" | "deactivate" | null>(null)

  useEffect(() => { setSelectedIds(new Set()) }, [page, search, typeFilter, statusFilter])

  const toggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }, [])

  const toggleSelectAll = useCallback(() => {
    setSelectedIds((prev) => prev.size === visibleQRs.length ? new Set() : new Set(visibleQRs.map((q) => q.id)))
  }, [visibleQRs])

  const handleDelete = (qr: QRCode) => {
    if (!window.confirm(`Delete "${qr.name}"? This cannot be undone.`)) return
    remove(qr.id)
  }

  const handleBulkDelete = useCallback(async () => {
    const ids = [...selectedIds]
    if (!ids.length) return
    if (!window.confirm(`Delete ${ids.length} QR code${ids.length > 1 ? "s" : ""}? This cannot be undone.`)) return
    setBulkOp("delete")
    for (const id of ids) { try { await deleteQR(id) } catch { /* skip */ } }
    setSelectedIds(new Set())
    setBulkOp(null)
    void invalidate()
  }, [selectedIds, invalidate])

  const handleBulkToggle = useCallback(async (activate: boolean) => {
    const targets = visibleQRs.filter((q) => selectedIds.has(q.id) && q.isActive !== activate)
    if (!targets.length) { setSelectedIds(new Set()); return }
    setBulkOp(activate ? "activate" : "deactivate")
    for (const qr of targets) { try { await toggleQR(qr.id) } catch { /* skip */ } }
    setSelectedIds(new Set())
    setBulkOp(null)
    void invalidate()
  }, [selectedIds, visibleQRs, invalidate])

  const handleBulkDownload = useCallback(async () => {
    const targets = visibleQRs.filter((q) => selectedIds.has(q.id))
    if (!targets.length) return
    setBulkOp("download")
    try {
      const [{ default: QRCodeStyling }, { default: JSZip }] = await Promise.all([
        import("qr-code-styling"),
        import("jszip"),
      ])
      const zip = new JSZip()
      await Promise.all(targets.map(async (qr) => {
        try {
          const d = qr.design
          const instance = new QRCodeStyling({
            data: `${getQrBaseUrl()}/r/${qr.slug}`,
            width: 1024, height: 1024, type: "canvas", margin: 40,
            dotsOptions: { color: d?.primaryColor ?? "#7c3aed", type: (d?.dotStyle ?? "rounded") as import("qr-code-styling").DotType },
            cornersSquareOptions: { color: d?.primaryColor ?? "#7c3aed", type: (d?.cornerSquareStyle ?? "square") as import("qr-code-styling").CornerSquareType },
            cornersDotOptions: { color: d?.primaryColor ?? "#7c3aed" },
            backgroundOptions: { color: d?.backgroundColor ?? "#ffffff" },
            qrOptions: { errorCorrectionLevel: "H" as const },
          })
          const blob = await instance.getRawData("png")
          if (blob) zip.file(`${qr.name.replace(/[^a-z0-9_-]/gi, "_")}.png`, blob)
        } catch { /* skip */ }
      }))
      const zipBlob = await zip.generateAsync({ type: "blob" })
      const url = URL.createObjectURL(zipBlob)
      const a = document.createElement("a")
      a.href = url
      a.download = `GenXQR-codes-${Date.now()}.zip`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      setTimeout(() => URL.revokeObjectURL(url), 1000)
    } finally {
      setBulkOp(null)
    }
  }, [selectedIds, visibleQRs])

  return (
    <>
      <div className="space-y-6 animate-fade-in">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-zinc-900 dark:text-white">My QR Codes</h1>
            <p className="text-zinc-500 text-sm mt-1">
              {pagination ? `${pagination.total} QR code${pagination.total === 1 ? "" : "s"} total` : "All your generated QR codes"}
            </p>
          </div>
          <Link to="/app/create" className="shrink-0">
            <Button className="w-full sm:w-auto"><Plus size={16} /> Create QR Code</Button>
          </Link>
        </div>

        {/* Toolbar: search + filters */}
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400 pointer-events-none" />
            <input
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search by name, slug, or tag…"
              className="w-full bg-white dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-800 text-zinc-900 dark:text-white placeholder:text-zinc-400 dark:placeholder:text-zinc-600 rounded-xl pl-9 pr-9 py-2.5 text-sm focus:outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500/50 transition-colors"
            />
            {searchInput && (
              <button
                onClick={() => setSearchInput("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200"
                title="Clear search"
              >
                <X size={15} />
              </button>
            )}
          </div>
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="w-full sm:w-[150px] h-[42px] text-sm"><SelectValue placeholder="All types" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All types</SelectItem>
              {uniqueTypes.map((t) => <SelectItem key={t} value={t}>{TYPE_LABEL[t] ?? t}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-full sm:w-[140px] h-[42px] text-sm"><SelectValue placeholder="All status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All status</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="inactive">Inactive</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* List */}
        <Card>
          <CardContent className="p-0">
            {isLoading && (
              <div className="flex items-center justify-center py-16 text-zinc-500">
                <Loader2 size={20} className="animate-spin mr-2" /> Loading QR codes…
              </div>
            )}

            {isError && (
              <div className="text-center py-16 text-zinc-500">
                <p className="text-red-400 mb-2">Failed to load QR codes</p>
                <Button variant="secondary" size="sm" onClick={() => void invalidate()}>Retry</Button>
              </div>
            )}

            {!isLoading && !isError && visibleQRs.length === 0 && (
              <div className="text-center py-16 text-zinc-500">
                <QrCode size={32} className="mx-auto mb-3 opacity-30" />
                <p className="text-sm mb-4">
                  {search || typeFilter !== "all" || statusFilter !== "all"
                    ? "No QR codes match your filters."
                    : "No QR codes yet."}
                </p>
                <Link to="/app/create"><Button size="sm"><Plus size={14} /> Create your first</Button></Link>
              </div>
            )}

            {!isLoading && !isError && visibleQRs.length > 0 && (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-zinc-200 dark:border-zinc-800">
                      <th className="px-4 py-3 w-8">
                        <button onClick={toggleSelectAll} className="text-zinc-400 hover:text-violet-400 transition-colors"
                          title={selectedIds.size === visibleQRs.length ? "Deselect all" : "Select all"}>
                          {selectedIds.size > 0 && selectedIds.size === visibleQRs.length
                            ? <CheckSquare size={15} className="text-violet-400" />
                            : selectedIds.size > 0 ? <CheckSquare size={15} className="text-violet-300 opacity-60" /> : <Square size={15} />}
                        </button>
                      </th>
                      <th className="text-left text-xs text-zinc-500 font-medium px-6 py-3">Name</th>
                      <th className="text-left text-xs text-zinc-500 font-medium px-6 py-3 hidden sm:table-cell">Type</th>
                      <th className="text-left text-xs text-zinc-500 font-medium px-6 py-3">Status</th>
                      <th className="text-left text-xs text-zinc-500 font-medium px-4 py-3">Scans</th>
                      <th className="text-left text-xs text-zinc-500 font-medium px-6 py-3 hidden md:table-cell">Created</th>
                      <th className="text-right text-xs text-zinc-500 font-medium px-4 py-3">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleQRs.map((qr) => (
                      <tr key={qr.id} className={`border-b border-zinc-200 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-900/50 transition-colors ${selectedIds.has(qr.id) ? "bg-violet-500/5" : ""}`}>
                        <td className="px-4 py-4 w-8">
                          <button onClick={() => toggleSelect(qr.id)} className="text-zinc-400 hover:text-violet-400 transition-colors">
                            {selectedIds.has(qr.id) ? <CheckSquare size={15} className="text-violet-400" /> : <Square size={15} />}
                          </button>
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-3">
                            <div className="w-9 h-9 rounded-xl bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center text-violet-500 dark:text-violet-400"><QRTypeIcon type={qr.type} size={18} /></div>
                            <div className="min-w-0">
                              <div className="text-zinc-900 dark:text-white text-sm font-medium truncate max-w-[240px]">{qr.name}</div>
                              <div className="text-zinc-500 text-xs truncate">/{qr.slug}</div>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4 hidden sm:table-cell"><Badge variant="secondary">{TYPE_LABEL[qr.type] ?? qr.type}</Badge></td>
                        <td className="px-6 py-4"><Badge variant={qr.isActive ? "success" : "secondary"}>{qr.isActive ? "active" : "inactive"}</Badge></td>
                        <td className="px-4 py-4"><span className="text-zinc-900 dark:text-white text-sm">{qr.scanCount.toLocaleString()}</span></td>
                        <td className="px-6 py-4 hidden md:table-cell"><span className="text-zinc-500 text-sm">{formatDate(qr.createdAt)}</span></td>
                        <td className="px-4 py-4">
                          <div className="flex items-center justify-end gap-1 sm:gap-2">
                            <Link to={`/app/qr/${qr.id}`}>
                              <button className="w-8 h-8 rounded-lg flex items-center justify-center text-zinc-500 hover:text-violet-400 hover:bg-violet-500/10 transition-colors" title="View details"><QrCode size={14} /></button>
                            </Link>
                            <Link to={`/app/qr/${qr.id}/analytics`} className="hidden sm:block">
                              <button className="w-8 h-8 rounded-lg flex items-center justify-center text-zinc-500 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors" title="Analytics"><BarChart3 size={14} /></button>
                            </Link>
                            <Link to={`/app/qr/${qr.id}/edit`}>
                              <button className="w-8 h-8 rounded-lg flex items-center justify-center text-zinc-500 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors" title="Edit"><Edit size={14} /></button>
                            </Link>
                            <div className="hidden sm:block"><DownloadMenu qr={qr} /></div>
                            <button onClick={() => duplicate(qr.id)} disabled={isDuplicating}
                              className="hidden sm:flex w-8 h-8 rounded-lg items-center justify-center text-zinc-500 hover:text-blue-400 hover:bg-blue-500/10 transition-colors disabled:opacity-40" title="Duplicate"><Copy size={14} /></button>
                            <button onClick={() => toggle(qr.id)} disabled={isToggling}
                              className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors disabled:opacity-40 ${qr.isActive ? "text-emerald-400 hover:text-red-400 hover:bg-red-500/10" : "text-zinc-500 hover:text-emerald-400 hover:bg-emerald-500/10"}`}
                              title={qr.isActive ? "Deactivate" : "Activate"}><Power size={14} /></button>
                            <button onClick={() => handleDelete(qr)} disabled={isDeleting}
                              className="w-8 h-8 rounded-lg flex items-center justify-center text-zinc-500 hover:text-red-400 hover:bg-red-500/10 transition-colors disabled:opacity-40" title="Delete"><Trash2 size={14} /></button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Pagination */}
        {pagination && pagination.totalPages > 1 && (
          <div className="flex items-center justify-between">
            <p className="text-zinc-500 text-xs">Page {pagination.page} of {pagination.totalPages}</p>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" disabled={!pagination.hasPrev} onClick={() => setPage((p) => Math.max(1, p - 1))}>
                <ChevronLeft size={14} /> Prev
              </Button>
              <Button variant="outline" size="sm" disabled={!pagination.hasNext} onClick={() => setPage((p) => p + 1)}>
                Next <ChevronRight size={14} />
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Bulk action floating toolbar */}
      {selectedIds.size > 0 && createPortal(
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[9999] animate-fade-in w-[calc(100vw-2rem)] sm:w-auto max-w-[calc(100vw-2rem)]">
          <div className="flex items-center gap-1 sm:gap-2 bg-white dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 rounded-2xl shadow-2xl px-3 sm:px-4 py-2.5 overflow-x-auto">
            <span className="text-zinc-900 dark:text-white text-sm font-medium pr-2 sm:pr-3 border-r border-zinc-300 dark:border-zinc-700 shrink-0">{selectedIds.size} selected</span>
            <button onClick={() => void handleBulkDownload()} disabled={!!bulkOp} className="flex items-center gap-1 sm:gap-1.5 px-2 sm:px-3 py-1.5 rounded-lg text-xs font-medium text-zinc-700 dark:text-zinc-300 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors disabled:opacity-50 shrink-0" title="Download selected as PNG">
              {bulkOp === "download" ? <Loader2 size={13} className="animate-spin" /> : <QrCode size={13} />}<span className="hidden sm:inline">Download</span>
            </button>
            <button onClick={() => void handleBulkToggle(true)} disabled={!!bulkOp} className="flex items-center gap-1 sm:gap-1.5 px-2 sm:px-3 py-1.5 rounded-lg text-xs font-medium text-zinc-700 dark:text-zinc-300 hover:text-emerald-400 hover:bg-emerald-500/10 transition-colors disabled:opacity-50 shrink-0" title="Activate selected">
              {bulkOp === "activate" ? <Loader2 size={13} className="animate-spin" /> : <Power size={13} />}<span className="hidden sm:inline">Activate</span>
            </button>
            <button onClick={() => void handleBulkToggle(false)} disabled={!!bulkOp} className="flex items-center gap-1 sm:gap-1.5 px-2 sm:px-3 py-1.5 rounded-lg text-xs font-medium text-zinc-700 dark:text-zinc-300 hover:text-amber-400 hover:bg-amber-500/10 transition-colors disabled:opacity-50 shrink-0" title="Deactivate selected">
              {bulkOp === "deactivate" ? <Loader2 size={13} className="animate-spin" /> : <PowerOff size={13} />}<span className="hidden sm:inline">Deactivate</span>
            </button>
            <div className="w-px h-5 bg-zinc-300 dark:bg-zinc-700 mx-0.5 sm:mx-1 shrink-0" />
            <button onClick={() => void handleBulkDelete()} disabled={!!bulkOp} className="flex items-center gap-1 sm:gap-1.5 px-2 sm:px-3 py-1.5 rounded-lg text-xs font-medium text-red-400 hover:text-white hover:bg-red-500/20 transition-colors disabled:opacity-50 shrink-0" title="Delete selected">
              {bulkOp === "delete" ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}<span className="hidden sm:inline">Delete</span>
            </button>
            <button onClick={() => setSelectedIds(new Set())} className="ml-0.5 sm:ml-1 w-6 h-6 rounded-full flex items-center justify-center text-zinc-500 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors text-xs shrink-0" title="Clear selection">✕</button>
          </div>
        </div>,
        document.body,
      )}
    </>
  )
}
