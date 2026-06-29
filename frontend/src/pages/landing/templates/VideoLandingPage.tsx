import type { PublicQRFile } from "@/lib/api"

interface Props {
  name: string
  content: Record<string, unknown>
  design: Record<string, unknown>
  files: PublicQRFile[]
}

export default function VideoLandingPage({ name, content, files }: Props) {
  const title = (content.title as string) || name
  const description = content.description as string | undefined
  const videoFile = files.find((f) => f.fileType === "VIDEO")
  const accent = "#4f46e5"

  return (
    <div className="min-h-screen bg-black flex flex-col items-center justify-center py-8 px-4">
      <div className="w-full max-w-lg">
        {/* Title */}
        <h1 className="text-white text-xl font-bold text-center mb-2">{title}</h1>
        {description && <p className="text-gray-400 text-sm text-center mb-6">{description}</p>}

        {/* Video Player */}
        {videoFile ? (
          <div className="relative bg-black rounded-2xl overflow-hidden shadow-2xl">
            <video
              className="w-full aspect-video"
              controls
              preload="metadata"
              src={videoFile.fileUrl}
            >
              Your browser does not support the video tag.
            </video>
          </div>
        ) : (
          <div className="aspect-video bg-gray-900 rounded-2xl flex items-center justify-center">
            <p className="text-gray-500">Video not available</p>
          </div>
        )}

        {videoFile && (
          <a
            href={videoFile.fileUrl}
            download={videoFile.fileName}
            className="mt-4 flex items-center justify-center gap-2 py-3 px-6 rounded-xl font-semibold text-white transition-opacity hover:opacity-90"
            style={{ background: accent }}
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            Download Video
          </a>
        )}

        <p className="mt-6 text-center text-xs text-gray-600">Powered by GenXQR</p>
      </div>
    </div>
  )
}
