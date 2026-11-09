import { Cookie, ShieldCheck, Settings2 } from "lucide-react"
import { SEOMeta } from "@/components/SEOMeta"
import { openConsentSettings } from "@/lib/consent"
import { LegalPage, LegalHero, LegalStats, LegalBody, LegalCard, LegalSection } from "@/components/marketing/Legal"

const sections = [
  {
    title: "1. What are cookies",
    content: "Cookies are small text files stored on your device to help websites work efficiently, remember preferences, and improve user experience.",
  },
  {
    title: "2. How GenXQR uses cookies",
    content: "We use cookies for two things: keeping you signed in securely (essential cookies, always on), and, only if you allow it, understanding how the site is used so we can improve it (analytics cookies, set by Google Analytics and Microsoft Clarity). Until you choose, no analytics cookies are set and neither service is loaded.",
  },
  {
    title: "3. Types of cookies we use",
    content: "Essential: a secure, HttpOnly cookie that keeps you signed in, and short-lived ones used while you sign in with Google or single sign-on. Cloudflare, which protects the site, may also set its own security cookies. Usage statistics (only with your consent): Google Analytics (cookies named _ga…) counts visits and which pages are used, on genxqr.com pages including the dashboard, but not the admin panel or the pages people see after scanning a code. Session recordings (only with your consent): Microsoft Clarity (cookies such as _clck and _clsk, plus Microsoft's own) records clicks, scrolling and the pages viewed, on our public pages only: never the dashboard, sign-in pages or scan pages. Neither runs on customers' custom domains or agencies' shared reports. Preferences such as your theme, and your cookie choice itself, are kept in your browser's local storage, not in cookies.",
  },
  {
    title: "4. Managing your cookie settings",
    content: "When you first visit, we ask whether to allow usage statistics and session recordings; you can accept, reject, or choose each one. Rejecting does not affect how GenXQR works. You can change your choice at any time with the button below or the \"Cookie settings\" link at the bottom of every page; withdrawing consent deletes those analytics cookies and reloads the page. You can also block or delete cookies in your browser settings, but blocking essential cookies will sign you out.",
  },
  {
    title: "5. Third-party cookies",
    content: "The analytics cookies above are set by Google and Microsoft, only with your consent, and they handle the data under their own privacy policies. If you pay, Cashfree's payment page may set its own cookies. See our Privacy Policy for what each company receives.",
  },
  {
    title: "6. Updates to this policy",
    content: "We may revise this Cookie Policy when product functionality or legal requirements change. Material updates will be reflected by changing the effective date below.",
  },
]

export default function CookiePolicyPage() {
  return (
    <LegalPage>
      <SEOMeta
        title="Cookie Policy — Which Cookies We Use and Why"
        description="Which cookies GenXQR uses: essential cookies that keep you signed in, and analytics cookies from Google Analytics and Microsoft Clarity. How to manage them."
        url="/cookie-policy"
      />
      <LegalHero icon={Cookie} title={<>Cookie <span className="text-accent">Policy</span></>} subtitle="Last updated: November 9, 2026" />
      <LegalBody>
        <LegalStats
          items={[
            { icon: ShieldCheck, tint: "violet", label: "Security first", sub: "Essential cookies protect sessions" },
            { icon: Settings2, tint: "blue", label: "Your choice", sub: "Analytics only if you allow it" },
            { icon: Cookie, tint: "emerald", label: "Two kinds", sub: "Essential and analytics" },
          ]}
        />
        <LegalCard>
          {sections.map((section) => (
            <LegalSection key={section.title} title={section.title}>
              <p>{section.content}</p>
            </LegalSection>
          ))}
          <div className="pt-6">
            <button
              type="button"
              onClick={openConsentSettings}
              className="rounded-xl border border-line bg-paper px-4 py-2 text-sm font-semibold text-ink transition hover:border-accent hover:text-accent-ink"
            >
              Change cookie settings
            </button>
          </div>
          <div className="pt-8 border-t border-line">
            <h2 className="text-xl font-bold font-display text-ink mb-3">Contact</h2>
            <p className="text-sm md:text-base">
              For cookie-related questions, contact us at{" "}
              <a href="mailto:support@genxqr.com" className="text-accent hover:text-accent-ink">
                support@genxqr.com
              </a>
              .
            </p>
          </div>
        </LegalCard>
      </LegalBody>
    </LegalPage>
  )
}
