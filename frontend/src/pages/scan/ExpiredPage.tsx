import { useParams, useSearchParams, Link } from "react-router-dom"
import { useQuery } from "@tanstack/react-query"
import { getPublicBranding, GENXQR_BRANDING } from "@/lib/api"
import { ScanBrandHeader, ScanBrandFooter } from "@/components/ScanBranding"
import { Clock, ArrowRight, Ban, AlertTriangle, ShieldAlert } from "lucide-react"

type Reason = "deactivated" | "expired" | "limit" | "blocked"

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
  // Moderation, not the owner's own scheduling. Worded so a visitor who scanned
  // a code in the wild understands they were protected from its destination, and
  // is NOT invited to contact the creator — that is the person who was blocked.
  blocked: {
    icon: <ShieldAlert size={40} className="text-red-500/70" />,
    badge: "Blocked",
    heading: "This QR code has been blocked",
    description:
      "We blocked this QR code because its destination was reported as unsafe or breached our acceptable use policy. You have not been taken there. Nothing further is needed from you.",
  },
}

export default function ExpiredPage() {
  const { slug } = useParams<{ slug: string }>()
  const [searchParams] = useSearchParams()

  // Validated against the known set rather than cast: the value arrives in a
  // query string a visitor can edit, and an unknown reason must fall back rather
  // than index CONTENT with undefined and blank the page.
  const REASONS: Reason[] = ["deactivated", "expired", "limit", "blocked"]
  /** Whose name this page carries — GenXQR, or the customer on a white-label plan. */
  const { data: branding = GENXQR_BRANDING } = useQuery({
    queryKey: ["scan-branding", slug],
    queryFn: () => getPublicBranding(slug!),
    enabled: !!slug,
    staleTime: 5 * 60_000,
    placeholderData: GENXQR_BRANDING,
  })

  const rawReason = searchParams.get("reason") ?? "expired"
  const reason: Reason = (REASONS as string[]).includes(rawReason) ? (rawReason as Reason) : "expired"
  const content = CONTENT[reason]

  return (
    <div className="min-h-screen bg-[#09090b] flex flex-col items-center justify-center px-4">

      {/* Ambient glow */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute left-1/2 top-1/3 -translate-x-1/2 -translate-y-1/2 w-[480px] h-[480px] rounded-full bg-violet-600/10 blur-[120px]" />
      </div>

      <div className="relative w-full max-w-sm text-center">

        <ScanBrandHeader branding={branding} className="mb-12" />

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

        {/* Our signup pitch, shown only on our own branding. On a white-label
            customer's page this is an advert for their supplier placed in front
            of their audience — the clearest thing the paid feature should buy. */}
        {branding.mode === "genxqr" && (
          <>
            <div className="border-t border-zinc-800 mb-8" />
            <p className="text-zinc-500 text-sm mb-4">Want to create your own QR codes?</p>
            <Link
              to="/"
              className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-violet-600 hover:bg-violet-500 text-white text-sm font-semibold transition-colors"
            >
              Get started free
              <ArrowRight size={15} />
            </Link>
          </>
        )}
      </div>

      <ScanBrandFooter branding={branding} className="relative mt-16 border-zinc-800 bg-transparent" />
    </div>
  )
}
