import { QrCode } from "lucide-react"
import type { ResolvedBranding } from "@/lib/api"

/**
 * Whose name a scanner-facing page carries.
 *
 * Three pages are seen by people who scanned a customer's QR code and have no
 * relationship with GenXQR: the landing page, the password gate, and the expired
 * notice. White-label decides whether those say "GenXQR" or the customer's own
 * name.
 *
 * It never says neither. The password gate asks a stranger for a secret, and an
 * unattributed page doing that is precisely what Search Console reported as a
 * deceptive page — a padlock, a password field, and nothing saying who was
 * asking. The server enforces the same rule: an account with whiteLabel but no
 * brand name resolves to "genxqr" rather than to nothing.
 *
 * Both components live here so that rule is visible in one file instead of
 * reimplemented per page, which is how the landing pages ended up with no
 * attribution at all.
 */

/**
 * The identifying mark at the TOP of a page, above whatever it is asking for.
 * Used where the question needs a visible asker — the password gate especially.
 */
export function ScanBrandHeader({
  branding,
  className = "",
}: {
  branding: ResolvedBranding
  className?: string
}) {
  if (branding.mode === "custom") {
    return (
      <div className={`text-center ${className}`}>
        {branding.logoUrl ? (
          <img
            src={branding.logoUrl}
            alt={branding.name ?? "Brand"}
            className="mx-auto max-h-10 w-auto select-none object-contain"
            // A broken logo must not leave the page anonymous, so the name below
            // is always rendered too rather than being an alternative to it.
            loading="eager"
          />
        ) : null}
        <p className="mt-2 text-sm font-semibold text-white">{branding.name}</p>
      </div>
    )
  }

  return (
    <div className={`text-center ${className}`}>
      <a href="https://genxqr.com" className="inline-block" aria-label="GenXQR home">
        {/* The page behind this is always dark, so the dark-background asset is
            used directly rather than via BrandLogo, whose light/dark swap keys
            off the theme class and would show the light art half the time. */}
        <img
          src="/logo_full_dark.png"
          alt="GenXQR"
          width={164}
          height={32}
          className="mx-auto h-8 w-auto select-none"
        />
      </a>
    </div>
  )
}

/**
 * The quiet attribution at the BOTTOM of a page.
 *
 * On a non-white-label account this is the "Powered by GenXQR" badge — the thing
 * the paid feature actually removes, and the reason every scan of a free
 * customer's page is also an impression.
 */
export function ScanBrandFooter({
  branding,
  className = "",
}: {
  branding: ResolvedBranding
  className?: string
}) {
  if (branding.mode === "custom") {
    // The customer's own name, quietly. Not a link: we have no URL for them, and
    // inventing one from the QR destination would send scanners somewhere the
    // customer did not choose.
    return (
      <div
        className={`w-full border-t border-black/5 bg-white/60 py-4 text-center backdrop-blur-sm dark:border-white/10 dark:bg-black/30 ${className}`}
      >
        <span className="text-xs text-zinc-500 dark:text-zinc-400">{branding.name}</span>
      </div>
    )
  }

  return (
    <div
      className={`w-full border-t border-black/5 bg-white/60 py-4 text-center backdrop-blur-sm dark:border-white/10 dark:bg-black/30 ${className}`}
    >
      <a
        href="https://genxqr.com/?utm_source=landing&utm_medium=badge&utm_campaign=powered_by"
        target="_blank"
        rel="noopener"
        className="inline-flex items-center gap-1.5 text-xs text-zinc-500 transition-colors hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-100"
      >
        <QrCode size={13} aria-hidden="true" />
        <span>
          Powered by <span className="font-semibold">GenXQR</span>
        </span>
      </a>
    </div>
  )
}
