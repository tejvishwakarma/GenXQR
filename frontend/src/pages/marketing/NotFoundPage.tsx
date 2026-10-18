import { ArrowRight } from "lucide-react"
import { SEOMeta } from "@/components/SEOMeta"
import { MktContainer, MktButton } from "@/components/marketing/ui"

/**
 * Unknown URLs. Prerendered to dist/404.html (scripts/prerender.mjs), which
 * nginx serves with a real 404 status — the old catch-all redirected to the
 * homepage client-side while the server answered 200, a "soft 404" that search
 * engines treat as junk content.
 */
export default function NotFoundPage() {
  return (
    <div>
      <SEOMeta title="Page not found" description="This page doesn't exist on GenXQR." noIndex />
      <MktContainer className="max-w-2xl py-24 md:py-32 text-center">
        <p className="font-mono text-sm text-accent">404</p>
        <h1 className="mt-3 text-3xl md:text-4xl font-bold font-display tracking-tightest text-ink">
          This page doesn't exist
        </h1>
        <p className="mt-4 text-ink-soft">
          The link may be mistyped, or the page may have moved. If you scanned a GenXQR code and landed here,
          the code's owner may have changed or removed it.
        </p>
        <div className="mt-8 flex flex-col sm:flex-row gap-3 justify-center">
          <MktButton href="/" variant="accent">
            Go to the homepage
            <ArrowRight size={16} />
          </MktButton>
          <MktButton href="/generate" variant="outline">
            Free QR code generator
          </MktButton>
          <MktButton href="/pricing" variant="outline">
            Pricing
          </MktButton>
        </div>
      </MktContainer>
    </div>
  )
}
