import { useState } from "react"
import { useMutation } from "@tanstack/react-query"
import { Upload, FileText, Download, Layers, X, CheckCircle2, AlertCircle, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import {
  getBulkTemplate, uploadBulkCSV, downloadBulkZip,
  type BulkResult, type BulkUploadResponse,
} from "@/lib/api"

export default function BulkGeneratePage() {
  const [file, setFile] = useState<File | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [results, setResults] = useState<BulkUploadResponse | null>(null)

  const uploadMut = useMutation({
    mutationFn: () => uploadBulkCSV(file!),
    onSuccess: (res) => setResults(res.data),
  })

  const downloadMut = useMutation({
    mutationFn: () => downloadBulkZip(results!.results),
  })

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    const dropped = e.dataTransfer.files[0]
    if (dropped?.name.endsWith(".csv")) { setFile(dropped); setResults(null) }
  }

  const removeFile = (e: React.MouseEvent) => {
    e.stopPropagation()
    setFile(null)
    setResults(null)
    uploadMut.reset()
  }

  const createdRows = results?.results.filter((r) => r.status === "created") ?? []

  return (
    <div className="space-y-6 animate-fade-in max-w-5xl">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold text-zinc-900 dark:text-white">Bulk Generate</h1>
        <p className="text-zinc-500 text-sm mt-1">Upload a CSV to generate hundreds of QR codes at once.</p>
      </div>

      <div className="grid lg:grid-cols-[1fr_300px] gap-6">
        {/* Left */}
        <div className="space-y-5">
          {/* Upload Zone */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Upload size={16} className="text-violet-400" />
                Upload CSV File
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div
                onDrop={handleDrop}
                onDragOver={(e) => { e.preventDefault(); setIsDragging(true) }}
                onDragLeave={() => setIsDragging(false)}
                onClick={() => document.getElementById("csv-input")?.click()}
                className={cn(
                  "border-2 border-dashed rounded-2xl p-10 text-center cursor-pointer transition-all",
                  isDragging ? "border-violet-500 bg-violet-500/10" : "border-zinc-300 dark:border-zinc-700 hover:border-violet-500/50 hover:bg-zinc-50 dark:hover:bg-zinc-900/50",
                  file && "border-violet-500/60 bg-violet-500/5"
                )}
              >
                <input
                  id="csv-input"
                  type="file"
                  accept=".csv"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0]
                    if (f) { setFile(f); setResults(null); uploadMut.reset() }
                  }}
                />
                {file ? (
                  <div>
                    <CheckCircle2 size={32} className="text-violet-400 mx-auto mb-3" />
                    <p className="text-zinc-900 dark:text-white font-medium">{file.name}</p>
                    <p className="text-zinc-500 text-sm mt-1">{(file.size / 1024).toFixed(1)} KB · CSV</p>
                    <button onClick={removeFile} className="mt-3 text-red-400 hover:text-red-300 text-xs flex items-center gap-1 mx-auto">
                      <X size={12} /> Remove
                    </button>
                  </div>
                ) : (
                  <div>
                    <FileText size={32} className="text-zinc-500 mx-auto mb-3" />
                    <p className="text-zinc-700 dark:text-zinc-300 font-medium">Drop your CSV here, or click to browse</p>
                    <p className="text-zinc-500 text-sm mt-1">Max 5 MB · UTF-8 encoded</p>
                  </div>
                )}
              </div>

              <div className="mt-4 p-4 bg-zinc-50 dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-zinc-400 text-xs font-medium">Expected CSV format:</p>
                  <a
                    href={getBulkTemplate()}
                    download="GenXQR_template.csv"
                    className="text-xs text-violet-400 hover:text-violet-300 transition-colors"
                    onClick={(e) => e.stopPropagation()}
                  >
                    Download template →
                  </a>
                </div>
                <code className="text-violet-300 text-xs font-mono block">name,url,tag,description<br />My QR,https://example.com,marketing,Optional description</code>
              </div>

              {uploadMut.error && (
                <div className="mt-3 flex items-center gap-2 p-3 bg-red-500/10 border border-red-500/20 rounded-xl">
                  <AlertCircle size={14} className="text-red-400 shrink-0" />
                  <span className="text-red-400 text-xs">
                    {uploadMut.error instanceof Error ? uploadMut.error.message : "Upload failed"}
                  </span>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Results Table */}
          {results && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-3">
                  Results
                  <span className="text-emerald-400 text-sm font-normal">{results.summary.created} created</span>
                  {results.summary.failed > 0 && (
                    <span className="text-red-400 text-sm font-normal">{results.summary.failed} failed</span>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-zinc-200 dark:border-zinc-800">
                        <th className="text-left text-xs text-zinc-500 font-medium px-6 py-3">#</th>
                        <th className="text-left text-xs text-zinc-500 font-medium px-6 py-3">Name</th>
                        <th className="text-left text-xs text-zinc-500 font-medium px-6 py-3">URL</th>
                        <th className="text-left text-xs text-zinc-500 font-medium px-6 py-3">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {results.results.map((row: BulkResult) => (
                        <tr key={row.row} className="border-b border-zinc-200 dark:border-zinc-800 last:border-0 hover:bg-zinc-50 dark:hover:bg-zinc-900/40">
                          <td className="px-6 py-3 text-zinc-500 text-xs">{row.row}</td>
                          <td className="px-6 py-3 text-zinc-800 dark:text-zinc-200 font-medium text-xs">{row.name}</td>
                          <td className="px-6 py-3 text-zinc-500 text-xs truncate max-w-[180px]">{row.url}</td>
                          <td className="px-6 py-3">
                            {row.status === "created" ? (
                              <Badge className="bg-emerald-500/15 text-emerald-400 border-emerald-500/20 text-xs">Created</Badge>
                            ) : (
                              <span title={row.error}>
                                <Badge variant="destructive" className="text-xs">Error</Badge>
                              </span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Right Panel */}
        <div className="sticky top-24 self-start space-y-4">
          <Card className="p-6">
            <div className="space-y-4">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-xl bg-violet-500/15 border border-violet-500/20 flex items-center justify-center shrink-0">
                  <Layers size={18} className="text-violet-400" />
                </div>
                <div>
                  <div className="text-zinc-900 dark:text-white font-semibold">Bulk QR Generator</div>
                  <div className="text-zinc-500 text-xs mt-0.5">CSV → QR codes at scale</div>
                </div>
              </div>

              {results && (
                <div className="space-y-2 text-xs">
                  <div className="flex justify-between text-zinc-500">
                    <span>Total rows</span>
                    <span className="text-zinc-700 dark:text-zinc-300">{results.summary.total}</span>
                  </div>
                  <div className="flex justify-between text-zinc-500">
                    <span>Created</span>
                    <span className="text-emerald-400">{results.summary.created}</span>
                  </div>
                  {results.summary.failed > 0 && (
                    <div className="flex justify-between text-zinc-500">
                      <span>Failed</span>
                      <span className="text-red-400">{results.summary.failed}</span>
                    </div>
                  )}
                </div>
              )}

              {!file && !results && (
                <div className="flex items-start gap-2 p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl">
                  <AlertCircle size={14} className="text-amber-400 mt-0.5 shrink-0" />
                  <span className="text-amber-400 text-xs">Upload a CSV file to get started</span>
                </div>
              )}

              {results && results.summary.created > 0 && (
                <div className="flex items-center gap-2 p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl">
                  <CheckCircle2 size={16} className="text-emerald-400" />
                  <span className="text-emerald-400 text-sm font-medium">{results.summary.created} QRs ready!</span>
                </div>
              )}

              <Button
                className="w-full"
                disabled={!file || uploadMut.isPending}
                onClick={() => uploadMut.mutate()}
              >
                {uploadMut.isPending ? <Loader2 size={16} className="animate-spin" /> : <Layers size={16} />}
                {uploadMut.isPending ? "Processing…" : "Generate QR Codes"}
              </Button>

              <Button
                variant="secondary"
                className="w-full"
                disabled={!results || createdRows.length === 0 || downloadMut.isPending}
                onClick={() => downloadMut.mutate()}
              >
                {downloadMut.isPending ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}
                Download ZIP
              </Button>
            </div>
          </Card>

          <Card className="p-5">
            <h4 className="text-zinc-900 dark:text-white text-sm font-semibold mb-3">Tips</h4>
            <ul className="space-y-2 text-xs text-zinc-500">
              <li className="flex items-start gap-2"><span className="text-violet-400 mt-0.5">•</span>First row must be a header row</li>
              <li className="flex items-start gap-2"><span className="text-violet-400 mt-0.5">•</span>URLs must include https://</li>
              <li className="flex items-start gap-2"><span className="text-violet-400 mt-0.5">•</span><code>name</code> and <code>url</code> columns are required</li>
              <li className="flex items-start gap-2"><span className="text-violet-400 mt-0.5">•</span><code>tag</code> and <code>description</code> are optional</li>
            </ul>
          </Card>
        </div>
      </div>
    </div>
  )
}

