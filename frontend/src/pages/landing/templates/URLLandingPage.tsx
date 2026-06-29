import type { PublicQRFile } from "@/lib/api"

interface Props {
  name: string
  content: Record<string, unknown>
  design: Record<string, unknown>
  files: PublicQRFile[]
}

function normalizeUrl(raw: unknown): string {
  if (typeof raw !== "string" || !raw.trim()) return ""
  const s = raw.trim()
  return /^https?:\/\//i.test(s) ? s : `https://${s}`
}

export default function URLLandingPage({ name, content, design }: Props) {
  const targetUrl = normalizeUrl(content.url)
  const accent    = (design.primaryColor as string) || "#7c3aed"

  // Derive a clean display label from the URL
  let displayDomain = targetUrl
  let fullDisplay   = targetUrl
  try {
    const parsed  = new URL(targetUrl)
    displayDomain = parsed.hostname.replace(/^www\./, "")
    fullDisplay   = parsed.hostname
  } catch {
    // keep raw as-is if URL is invalid
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-xs flex flex-col items-center gap-4 text-center">

        {/* Icon */}
        <div
          className="w-20 h-20 rounded-2xl flex items-center justify-center shadow-md"
          style={{ background: `${accent}18` }}
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="40" height="40"
            viewBox="0 0 24 24"
            fill="none"
            stroke={accent}
            strokeWidth="1.75"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="12" cy="12" r="10" />
            <path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
          </svg>
        </div>

        {/* Name / domain */}
        <div>
          <h1 className="text-xl font-bold text-gray-900 leading-tight">
            {name || displayDomain}
          </h1>
          {fullDisplay && (
            <p className="text-sm text-gray-400 mt-0.5 break-all">{fullDisplay}</p>
          )}
        </div>

        <p className="text-sm text-gray-500">Tap below to open this website</p>

        {/* CTA — navigate in the same tab so in-app browsers don't block it */}
        {targetUrl ? (
          <a
            href={targetUrl}
            className="w-full py-3 rounded-xl text-white font-semibold text-sm transition-opacity hover:opacity-90 active:scale-95"
            style={{ background: accent }}
          >
            Open Website →
          </a>
        ) : (
          <p className="text-sm text-red-400">No URL configured for this QR code.</p>
        )}

        <p className="text-xs text-gray-300 mt-2">Powered by GenXQR</p>
      </div>
    </div>
  )
}
