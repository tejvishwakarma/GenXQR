import type { PublicQRFile } from "@/lib/api"

interface Props {
  name: string
  content: Record<string, unknown>
  design: Record<string, unknown>
  files: PublicQRFile[]
}

export default function PDFLandingPage({ name, content, files }: Props) {
  const title = (content.title as string) || name
  const description = content.description as string | undefined
  const pdfFile = files.find((f) => f.fileType === "PDF")
  const accent = "#4f46e5"

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center py-12 px-4">
      {/* Card */}
      <div className="w-full max-w-md bg-white rounded-2xl shadow-lg overflow-hidden">
        {/* Header */}
        <div className="px-6 py-8 text-center" style={{ background: accent }}>
          <div className="w-16 h-16 bg-white/20 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
            </svg>
          </div>
          <h1 className="text-white text-xl font-bold">{title}</h1>
          {description && <p className="text-white/80 text-sm mt-2">{description}</p>}
        </div>

        {/* Body */}
        <div className="p-6 space-y-4">
          {pdfFile ? (
            <>
              <div className="bg-gray-50 rounded-xl p-4 flex items-center gap-3">
                <div className="w-10 h-10 bg-red-100 rounded-lg flex items-center justify-center flex-shrink-0">
                  <svg className="w-5 h-5 text-red-600" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z"/>
                  </svg>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">{pdfFile.fileName}</p>
                  <p className="text-xs text-gray-500">PDF Document</p>
                </div>
              </div>

              <a
                href={pdfFile.fileUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="block w-full text-center py-3 px-6 rounded-xl font-semibold text-white transition-opacity hover:opacity-90"
                style={{ background: accent }}
              >
                View PDF
              </a>

              <a
                href={pdfFile.fileUrl}
                download={pdfFile.fileName}
                className="block w-full text-center py-3 px-6 rounded-xl font-semibold border-2 transition-colors hover:bg-gray-50"
                style={{ borderColor: accent, color: accent }}
              >
                Download PDF
              </a>
            </>
          ) : (
            <p className="text-center text-gray-500 py-8">Document not available</p>
          )}
        </div>
      </div>

      <p className="mt-6 text-xs text-gray-400">Powered by GenXQR</p>
    </div>
  )
}
