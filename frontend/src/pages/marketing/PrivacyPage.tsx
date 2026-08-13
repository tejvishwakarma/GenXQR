import { Shield, Lock, Eye, Database } from "lucide-react"
import { SEOMeta } from "@/components/SEOMeta"
import { LegalPage, LegalHero, LegalStats, LegalBody, LegalCard, LegalSection } from "@/components/marketing/Legal"

const sections = [
  {
    title: "1. Information We Collect",
    content: "When you use GenXQR, we collect specific information to provide our services. This includes account information (name, email), billing details, and analytics data collected from users who scan your QR codes (IP address, approximate location, device type, browser, and scan timestamp).",
  },
  {
    title: "2. How We Use Your Information",
    content: "We use the collected information to operate and maintain our platform, process transactions, send service updates, and provide analytics features to our customers. We do not sell your personal information or the scanning data of your end-users to third parties.",
  },
  {
    title: "3. Data Security",
    content: "Security is our top priority. We implement industry-standard security measures including AES-256-GCM encryption for data at rest and TLS 1.3 for data in transit. Passwords are cryptographically hashed using Argon2id. We regularly audit our systems for vulnerabilities.",
  },
  {
    title: "4. Third-Party Services",
    content: "We use trusted third-party service providers (such as Stripe for payments, Oracle Cloud for hosting, and Resend for emails). These providers only have access to the information necessary to perform their specific functions and are prohibited from using it for any other purpose.",
  },
  {
    title: "5. Your Rights (GDPR & CCPA)",
    content: "Depending on your location, you may have the right to access, correct, delete, or restrict the processing of your personal data. You can exercise these rights directly through your Account Settings or by contacting our Data Protection Officer.",
  },
  {
    title: "6. Data Retention",
    content: "We retain your account data for as long as your account is active. Analytics data is retained according to your subscription tier (e.g., 30 days for Free, 1 year for Pro). You can export your data at any time before account deletion.",
  },
]

export default function PrivacyPage() {
  return (
    <LegalPage>
      <SEOMeta
        title="Privacy Policy"
        description="Learn how GenXQR collects, uses, and protects your data — encryption, retention, third-party services, and your GDPR/CCPA rights."
        url="/privacy"
      />
      <LegalHero icon={Shield} title={<>Privacy <span className="text-accent">Policy</span></>} subtitle="Last updated: March 12, 2026" />
      <LegalBody>
        <LegalStats
          items={[
            { icon: Lock, tint: "violet", label: "Encrypted", sub: "AES-256 at rest" },
            { icon: Database, tint: "blue", label: "Secure storage", sub: "Oracle Cloud Infrastructure" },
            { icon: Eye, tint: "emerald", label: "No selling", sub: "Your data is yours" },
          ]}
        />
        <LegalCard>
          <p className="text-ink-soft leading-relaxed text-sm md:text-base">
            This Privacy Policy describes how GenXQR ("we", "us", or "our") collects, uses, and shares your personal information when you use our website, developer API, and related services (collectively, the "Services").
          </p>
          {sections.map((section) => (
            <LegalSection key={section.title} title={section.title}>
              <p>{section.content}</p>
            </LegalSection>
          ))}
          <div className="pt-8 border-t border-line">
            <h2 className="text-xl font-bold font-display text-ink mb-4">Contact Us</h2>
            <p className="text-ink-soft leading-relaxed text-sm md:text-base mb-4">
              If you have any questions or concerns about this Privacy Policy, please contact our Data Protection Officer at:
            </p>
            <a href="mailto:support@genxqr.com" className="text-accent hover:text-accent-ink font-medium transition-colors">
              support@genxqr.com
            </a>
          </div>
        </LegalCard>
      </LegalBody>
    </LegalPage>
  )
}
