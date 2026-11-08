import { useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { ChevronLeft, ChevronRight, ClipboardList, Download, Loader2, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { deleteFormResponse, downloadFormResponsesCsv, getFormResponses } from "@/lib/api"
import { useWorkspace } from "@/hooks/useWorkspace"

/** A FORM code's responses on its detail page: newest first, CSV, delete (backend form-response.service). */
export function FormResponses({ qrId, name }: { qrId: string; name: string }) {
  const qc = useQueryClient()
  const { can } = useWorkspace()
  const [page, setPage] = useState(1)
  const [downloading, setDownloading] = useState(false)
  const { data, isLoading } = useQuery({ queryKey: ["form-responses", qrId, page], queryFn: () => getFormResponses(qrId, page) })
  const rows = data?.data ?? []
  const pagination = data?.pagination
  const remove = useMutation({
    mutationFn: (id: string) => deleteFormResponse(qrId, id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["form-responses", qrId] }),
  })

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-3 space-y-0">
        <CardTitle className="text-base flex items-center gap-2">
          <ClipboardList size={16} className="text-violet-500" /> Responses
          {pagination && <span className="text-sm font-normal text-zinc-500">{pagination.total.toLocaleString("en-IN")}</span>}
        </CardTitle>
        <Button variant="outline" size="sm" className="gap-1.5" disabled={!pagination?.total || downloading}
          onClick={() => { setDownloading(true); void downloadFormResponsesCsv(qrId, name).finally(() => setDownloading(false)) }}>
          {downloading ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />} CSV
        </Button>
      </CardHeader>
      <CardContent className="p-0">
        {isLoading ? (
          <div className="py-10 flex justify-center"><Loader2 size={18} className="animate-spin text-zinc-400" /></div>
        ) : rows.length === 0 ? (
          <p className="px-6 pb-6 text-sm text-zinc-500">No responses yet. They appear here as soon as someone sends the form.</p>
        ) : (
          <ul className="divide-y divide-zinc-200 dark:divide-zinc-800">
            {rows.map((r) => (
              <li key={r.id} className="px-6 py-4 flex gap-4">
                <dl className="flex-1 min-w-0 grid grid-cols-1 sm:grid-cols-[minmax(0,10rem)_1fr] gap-x-4 gap-y-1 text-sm">
                  {r.data.map((a) => (
                    <div key={a.id} className="contents">
                      <dt className="text-zinc-500 truncate">{a.label}</dt>
                      <dd className="text-zinc-900 dark:text-white whitespace-pre-wrap break-words mb-1 sm:mb-0">
                        {a.value || <span className="text-zinc-400">—</span>}
                      </dd>
                    </div>
                  ))}
                </dl>
                <div className="flex flex-col items-end gap-2 shrink-0">
                  <time className="text-xs text-zinc-500" dateTime={r.createdAt}>
                    {new Date(r.createdAt).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}
                  </time>
                  {can("qr:delete") && (
                    <button type="button" aria-label="Delete response" title="Delete response"
                      onClick={() => { if (window.confirm("Delete this response?")) remove.mutate(r.id) }}
                      className="text-zinc-400 hover:text-red-500"><Trash2 size={14} /></button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
        {pagination && pagination.totalPages > 1 && (
          <div className="flex items-center justify-between px-6 py-3 border-t border-zinc-200 dark:border-zinc-800 text-sm text-zinc-500">
            <span>Page {page} of {pagination.totalPages}</span>
            <div className="flex gap-1">
              <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)} aria-label="Previous page"><ChevronLeft size={14} /></Button>
              <Button variant="outline" size="sm" disabled={page >= pagination.totalPages} onClick={() => setPage((p) => p + 1)} aria-label="Next page"><ChevronRight size={14} /></Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
