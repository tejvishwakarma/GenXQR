import { useParams, useSearchParams, Link } from "react-router-dom"
import { QrCode, Clock, ArrowRight, Ban, AlertTriangle } from "lucide-react"

type Reason = "deactivated" | "expired" | "limit"

const CONTENT: Record<Reason, { icon: React.ReactNode; badge: string; heading: string; description: string }> = {
  deactivated: {
    icon: <Ban size={40} className="text-zinc-600" />,
    badge: "Deactivated",
    heading: "This QR code has been deactivated",
    description:
      "The owner has turned off this QR code. It is no longer active. If you believe this is a mistake, please contact the creator.",
  },
  expired: {
    icon: <Clock size={40} className="text-amber-500/70" />,
    badge: "Expired",
    heading: "This QR code has expired",
    description:
      "This QR code has passed its expiry date and is no longer valid. If you believe this is a mistake, please contact the creator.",
  },
  limit: {
    icon: <AlertTriangle size={40} className="text-orange-500/70" />,
    badge: "Limit reached",
    heading: "Scan limit reached",
    description:
      "This QR code has reached its maximum number of allowed scans and is no longer accepting new visitors. Please contact the creator for assistance.",
  },
}

export default function ExpiredPage() {
  const { slug } = useParams<{ slug: string }>()
  const [searchParams] = useSearchParams()

  const rawReason = searchParams.get("reason") ?? "expired"
  const reason: Reason = rawReason === "deactivated" || rawReason === "limit" ? rawReason : "expired"
  const content = CONTENT[reason]

  return (
    <div className="min-h-screen bg-[#09090b] flex flex-col items-center justify-center px-4">

      {/* Ambient glow */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute left-1/2 top-1/3 -translate-x-1/2 -translate-y-1/2 w-[480px] h-[480px] rounded-full bg-violet-600/10 blur-[120px]" />
      </div>

      <div className="relative w-full max-w-sm text-center">

        {/* Logo */}
        <div className="flex items-center justify-center gap-2.5 mb-12">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-violet-600 to-indigo-500 flex items-center justify-center">
            <QrCode size={15} className="text-white" />
          </div>
          <span className="text-white font-bold text-lg tracking-tight">GenXQR</span>
        </div>

        {/* Icon */}
        <div className="relative mx-auto mb-8 w-fit">
          <div className="w-24 h-24 rounded-2xl bg-zinc-900 border border-zinc-800 flex items-center justify-center">
            {content.icon}
          </div>
        </div>

        {/* Heading */}
        <h1 className="text-2xl font-bold text-white mb-3 tracking-tight">
          {content.heading}
        </h1>

        {/* Description */}
        <p className="text-zinc-400 text-sm leading-relaxed mb-8">
          {content.description}
        </p>

        {/* Info pill */}
        {slug && (
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-zinc-900 border border-zinc-800 mb-8">
            <span className="text-zinc-500 text-xs font-mono">/{slug}</span>
            <span className="w-1.5 h-1.5 rounded-full bg-zinc-700" />
            <span className="text-zinc-500 text-xs">{content.badge}</span>
          </div>
        )}

        {/* Divider */}
        <div className="border-t border-zinc-800 mb-8" />

        {/* CTA */}
        <p className="text-zinc-500 text-sm mb-4">Want to create your own QR codes?</p>
        <Link
          to="/"
          className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-violet-600 hover:bg-violet-500 text-white text-sm font-semibold transition-colors"
        >
          Get started free
          <ArrowRight size={15} />
        </Link>
      </div>

      {/* Footer */}
      <p className="relative mt-16 text-xs text-zinc-700">
        Powered by GenXQR
      </p>
    </div>
  )
}
