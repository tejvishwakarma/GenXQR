import { Cookie, ShieldCheck, Settings2 } from "lucide-react"
import { SEOMeta } from "@/components/SEOMeta"
import { LegalPage, LegalHero, LegalStats, LegalBody, LegalCard, LegalSection } from "@/components/marketing/Legal"

const sections = [
  {
    title: "1. What are cookies",
    content: "Cookies are small text files stored on your device to help websites work efficiently, remember preferences, and improve user experience.",
  },
  {
    title: "2. How GenXQR uses cookies",
    content: "We use essential cookies for authentication, security, and session continuity. We may also use analytics cookies to understand aggregate platform usage and improve performance.",
  },
  {
    title: "3. Types of cookies we use",
    content: "Essential cookies support login and account security. Preference cookies remember UI settings. Analytics cookies help us measure feature adoption and reliability trends.",
  },
  {
    title: "4. Managing your cookie settings",
    content: "You can manage or block cookies from your browser settings at any time. Disabling essential cookies may affect sign-in and some platform functionality.",
  },
  {
    title: "5. Third-party cookies",
    content: "Some integrated services may set cookies to deliver core functionality. We only work with providers that follow strong security and privacy standards.",
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
        title="Cookie Policy"
        description="Learn how GenXQR uses cookies for security, preferences, and platform performance."
        url="/cookie-policy"
      />
      <LegalHero icon={Cookie} title={<>Cookie <span className="text-accent">Policy</span></>} subtitle="Last updated: March 16, 2026" />
      <LegalBody>
        <LegalStats
          items={[
            { icon: ShieldCheck, tint: "violet", label: "Security first", sub: "Essential cookies protect sessions" },
            { icon: Settings2, tint: "blue", label: "User control", sub: "Manage via browser settings" },
            { icon: Cookie, tint: "emerald", label: "Transparent usage", sub: "Only required categories used" },
          ]}
        />
        <LegalCard>
          {sections.map((section) => (
            <LegalSection key={section.title} title={section.title}>
              <p>{section.content}</p>
            </LegalSection>
          ))}
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
