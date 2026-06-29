import type { PublicQRFile } from "@/lib/api"

interface Props {
  name: string
  content: Record<string, unknown>
  design: Record<string, unknown>
  files: PublicQRFile[]
}

/** Generates a decorative barcode-like SVG from an arbitrary string. */
function VisualBarcode({ code }: { code: string }) {
  const bars: number[] = []
  // Guard bar pattern
  bars.push(2, 1, 2)
  for (const ch of code.toUpperCase()) {
    const n = ch.charCodeAt(0) % 64
    // Encode each character as a sequence of thin/wide bars
    bars.push(
      n & 1 ? 3 : 1, 1,
      n & 2 ? 3 : 1, 1,
      n & 4 ? 2 : 1, 1,
      n & 8 ? 3 : 1, 1,
    )
  }
  bars.push(2, 1, 2)

  const total = bars.reduce((a, b) => a + b, 0)
  const svgW = 220
  const scale = svgW / total
  let x = 0
  const rects: React.ReactNode[] = []
  bars.forEach((w, i) => {
    const isBar = i % 2 === 0
    if (isBar) {
      rects.push(<rect key={i} x={x * scale} y={0} width={w * scale - 0.3} height={44} fill="#1f2937" rx={0.5} />)
    }
    x += w
  })

  return (
    <svg viewBox={`0 0 ${svgW} 44`} className="w-full h-10" role="img" aria-label="Barcode">
      {rects}
    </svg>
  )
}

export default function CouponLandingPage({ name, content }: Props) {
  const title = (content.title as string) || name
  const discount = content.discount as string | undefined
  const description = content.description as string | undefined
  const code = content.code as string | undefined
  // Accept both field names for backwards compatibility
  const expiresAt = (content.expiresAt ?? content.validUntil) as string | undefined
  const terms = content.terms as string | undefined
  const logoFile = content.logoUrl as string | undefined
  const accent = "#f97316"

  const expired = expiresAt ? new Date(expiresAt) < new Date() : false
  const expiryStr = expiresAt
    ? new Date(expiresAt).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })
    : null

  return (
    <div className="min-h-screen bg-gradient-to-br from-orange-50 to-amber-50 flex flex-col items-center py-12 px-4">
      <div className="w-full max-w-sm">
        {/* Coupon card */}
        <div className="bg-white rounded-3xl shadow-xl overflow-hidden">
          {/* Top strip */}
          <div className="py-6 px-6 text-center" style={{ background: accent }}>
            {logoFile ? (
              <img src={logoFile} alt={title} className="h-12 object-contain mx-auto mb-3" />
            ) : (
              <p className="text-white/90 text-xs font-semibold uppercase tracking-widest mb-1">Special Offer</p>
            )}
            {discount && (
              <p className="text-4xl font-black text-white">{discount}</p>
            )}
            <h1 className="text-white font-bold text-lg mt-1">{title}</h1>
          </div>

          {/* Dotted separator */}
          <div className="flex items-center px-4 py-3">
            <div className="w-5 h-5 rounded-full bg-orange-50 flex-shrink-0 -ml-7 border-2 border-orange-100" />
            <div className="flex-1 border-t-2 border-dashed border-orange-200 mx-1" style={{ borderColor: "#fed7aa" }} />
            <div className="w-5 h-5 rounded-full bg-orange-50 flex-shrink-0 -mr-7 border-2 border-orange-100" />
          </div>

          {/* Body */}
          <div className="px-6 pb-6 space-y-4">
            {description && (
              <p className="text-gray-600 text-sm text-center">{description}</p>
            )}

            {/* Code box + visual barcode */}
            {code && (
              <div
                className="border-2 border-dashed rounded-xl p-3 text-center cursor-pointer select-none"
                style={{ borderColor: accent }}
                onClick={() => void navigator.clipboard.writeText(code)}
              >
                <p className="text-xs text-gray-500 mb-1">Coupon Code</p>
                <p className="font-mono text-2xl font-black tracking-widest" style={{ color: accent }}>{code}</p>
                <div className="mt-3 px-2">
                  <VisualBarcode code={code} />
                </div>
                <p className="text-xs text-gray-400 mt-2">Tap to copy</p>
              </div>
            )}

            {/* Expiry */}
            {expiryStr && (
              <div className={`flex items-center gap-2 text-sm justify-center ${expired ? "text-red-500" : "text-gray-500"}`}>
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                {expired ? `Expired on ${expiryStr}` : `Valid until ${expiryStr}`}
              </div>
            )}

            {/* Terms */}
            {terms && (
              <p className="text-xs text-gray-400 text-center border-t pt-3">{terms}</p>
            )}
          </div>
        </div>

        <p className="mt-6 text-center text-xs text-gray-400">Powered by GenXQR</p>
      </div>
    </div>
  )
}
