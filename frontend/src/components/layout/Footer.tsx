import { Link } from "react-router-dom"
import { BrandLogo } from "@/components/BrandLogo"
import { SocialIcon } from "@/components/ui/social-icon"
import { SOCIAL_PROFILES } from "@/lib/site"

const footerLinks = {
  Product: [
    { label: "Features", href: "/features" },
    { label: "Pricing", href: "/pricing" },
    { label: "Use Cases", href: "/use-cases" },
    { label: "API Docs", href: "/api-docs" },
    { label: "Changelog", href: "/changelog" },
  ],
  Company: [
    { label: "About", href: "/about" },
    { label: "FAQ", href: "/faq" },
    { label: "Blog", href: "/blog" },
    { label: "Careers", href: "/careers" },
    { label: "Contact", href: "/contact" },
  ],
  Legal: [
    { label: "Privacy Policy", href: "/privacy" },
    { label: "Terms of Service", href: "/terms" },
    // Payment-gateway onboarding requires these two to be reachable from the
    // site, not merely to exist — reviewers look for the footer links.
    { label: "Refund & Cancellation", href: "/refund-policy" },
    { label: "Service Delivery", href: "/delivery-policy" },
    { label: "Cookie Policy", href: "/cookie-policy" },
    { label: "GDPR", href: "/gdpr" },
  ],
  Tools: [
    { label: "Free QR Generator", href: "/generate" },
    { label: "URL QR Code", href: "/generate/url" },
    { label: "WiFi QR Code", href: "/generate/wifi" },
    { label: "WhatsApp QR Code", href: "/generate/whatsapp" },
    { label: "Instagram QR Code", href: "/generate/instagram" },
  ],
}

export function Footer() {
  return (
    <footer className="bg-paper-pure border-t border-line">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <div className="grid grid-cols-2 gap-x-6 gap-y-10 lg:grid-cols-[1.4fr_repeat(4,1fr)] lg:gap-10">
          <div className="col-span-2 max-w-xs lg:col-span-1">
            <Link to="/" className="flex items-center gap-2.5">
              <BrandLogo height={32} />
            </Link>
            <p className="mt-4 text-sm leading-relaxed text-ink-soft">
              The QR platform for business — branded, dynamic, and fully tracked. Made in India, used worldwide.
            </p>
            <ul className="mt-5 flex items-center gap-2.5" aria-label="GenXQR on social media">
              {SOCIAL_PROFILES.map((p) => (
                <li key={p.platform}>
                  <a
                    href={p.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={`GenXQR on ${p.label}`}
                    className="block rounded-lg transition-opacity hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
                  >
                    <SocialIcon platform={p.platform} size={32} />
                  </a>
                </li>
              ))}
            </ul>
          </div>

          {Object.entries(footerLinks).map(([section, links]) => (
            <div key={section}>
              <div className="text-sm font-semibold text-ink">{section}</div>
              <ul className="mt-4 space-y-2.5">
                {links.map((l) => (
                  <li key={l.label}>
                    <Link to={l.href} className="text-sm text-ink-soft hover:text-ink transition-colors">{l.label}</Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-14 flex flex-col sm:flex-row items-center justify-between gap-4 border-t border-line pt-8">
          <p className="text-sm text-ink-faint">© {new Date().getFullYear()} GenXQR. All rights reserved.</p>
          <div className="flex items-center gap-2">
            <span className="inline-block w-2 h-2 rounded-full bg-live animate-pulse" />
            <span className="text-ink-faint text-xs">All systems operational</span>
          </div>
        </div>
      </div>
    </footer>
  )
}
