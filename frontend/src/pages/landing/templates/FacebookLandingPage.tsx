import type { PublicQRFile } from "@/lib/api"

interface Props {
  name: string
  content: Record<string, unknown>
  design: Record<string, unknown>
  files: PublicQRFile[]
}

export default function FacebookLandingPage({ name, content }: Props) {
  const pageUrl = (content.url as string) || "#"
  const pageName = (content.pageName as string) || name
  const description = content.description as string | undefined
  const category = content.category as string | undefined
  const phone = content.phone as string | undefined

  // Extract page handle / identifier from URL for display purposes
  function pageHandle(url: string): string {
    try {
      const path = new URL(url).pathname.replace(/\//g, "")
      return path || "yourpage"
    } catch {
      return "yourpage"
    }
  }

  return (
    <div className="min-h-screen bg-[#f0f2f5] flex flex-col items-center py-12 px-4">
      <div className="w-full max-w-sm">
        {/* Facebook-style card */}
        <div className="bg-white rounded-2xl shadow-lg overflow-hidden">
          {/* Cover photo area */}
          <div
            className="h-28 w-full"
            style={{ background: "linear-gradient(135deg, #1877F2 0%, #42a5f5 100%)" }}
          />

          {/* Avatar + Meta */}
          <div className="-mt-10 px-5 pb-5">
            <div className="w-20 h-20 rounded-full border-4 border-white bg-[#1877F2] flex items-center justify-center text-white text-3xl font-bold shadow-md mx-auto mb-3">
              {pageName.charAt(0).toUpperCase()}
            </div>

            <div className="text-center">
              <h1 className="text-xl font-bold text-gray-900 leading-tight">{pageName}</h1>
              {category && (
                <span className="inline-block mt-1 px-2 py-0.5 bg-blue-50 text-blue-700 text-xs font-medium rounded-full">
                  {category}
                </span>
              )}
              {description && (
                <p className="text-gray-600 text-sm mt-2 leading-relaxed">{description}</p>
              )}

              <div className="flex justify-center gap-6 mt-3 mb-4">
                <div className="text-center">
                  <p className="text-sm font-bold text-gray-800">—</p>
                  <p className="text-[10px] text-gray-400">Followers</p>
                </div>
                <div className="text-center">
                  <p className="text-sm font-bold text-gray-800">—</p>
                  <p className="text-[10px] text-gray-400">Likes</p>
                </div>
              </div>

              <a
                href={pageUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center gap-2 w-full py-2.5 rounded-lg text-white font-semibold text-sm transition-opacity hover:opacity-90"
                style={{ background: "#1877F2" }}
              >
                <span>📘</span> Visit Page on Facebook
              </a>

              {phone && (
                <a
                  href={`tel:${phone}`}
                  className="mt-2 flex items-center justify-center gap-2 w-full py-2.5 rounded-lg bg-gray-100 text-gray-700 font-medium text-sm"
                >
                  📞 Call Now
                </a>
              )}

              <p className="mt-3 text-xs text-gray-400 truncate">
                facebook.com/{pageHandle(pageUrl)}
              </p>
            </div>
          </div>
        </div>

        <p className="mt-6 text-center text-xs text-gray-400">Powered by GenXQR</p>
      </div>
    </div>
  )
}
