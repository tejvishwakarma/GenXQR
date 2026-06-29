import { useState } from "react"
import type { PublicQRFile } from "@/lib/api"

interface Props {
  name: string
  content: Record<string, unknown>
  design: Record<string, unknown>
  files: PublicQRFile[]
}

export default function ImageGalleryLandingPage({ name, content, files }: Props) {
  const title = (content.title as string) || name
  const description = content.description as string | undefined
  const imageFiles = files.filter((f) => f.fileType === "IMAGE")
  const [lightbox, setLightbox] = useState<string | null>(null)
  const accent = "#4f46e5"

  return (
    <div className="min-h-screen bg-gray-900 py-8 px-4">
      {/* Lightbox */}
      {lightbox && (
        <div
          className="fixed inset-0 bg-black/90 z-50 flex items-center justify-center p-4"
          onClick={() => setLightbox(null)}
        >
          <img src={lightbox} alt="" className="max-w-full max-h-[90vh] object-contain rounded-lg shadow-2xl" />
          <button
            className="absolute top-4 right-4 text-white/80 hover:text-white text-3xl font-light"
            onClick={() => setLightbox(null)}
          >×</button>
        </div>
      )}

      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-white">{title}</h1>
          {description && <p className="text-gray-400 text-sm mt-2">{description}</p>}
        </div>

        {/* Gallery grid */}
        {imageFiles.length > 0 ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {imageFiles.map((img) => (
              <button
                key={img.id}
                className="aspect-square overflow-hidden rounded-xl bg-gray-800 cursor-zoom-in hover:ring-2 transition-all"
                style={{ ringColor: accent } as React.CSSProperties}
                onClick={() => setLightbox(img.fileUrl)}
              >
                <img
                  src={img.fileUrl}
                  alt={img.fileName}
                  className="w-full h-full object-cover hover:scale-105 transition-transform duration-300"
                />
              </button>
            ))}
          </div>
        ) : (
          <div className="text-center py-16">
            <p className="text-gray-500">No images in this gallery</p>
          </div>
        )}

        <p className="mt-8 text-center text-xs text-gray-600">Powered by GenXQR</p>
      </div>
    </div>
  )
}
