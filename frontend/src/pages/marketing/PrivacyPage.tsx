import { Shield, Lock, Eye, Database } from "lucide-react"
import { SEOMeta } from "@/components/SEOMeta"
import { LegalPage, LegalHero, LegalStats, LegalBody, LegalCard, LegalSection } from "@/components/marketing/Legal"

const sections = [
  {
    title: "1. Information We Collect",
    content: "When you use GenXQR, we collect specific information to provide our services. This includes account information (name, email, and the mobile number you give at checkout or in your settings), billing details, and analytics data collected from users who scan your QR codes (IP address, approximate location, device type, browser, and scan timestamp). If you sign up through someone's referral link, we record who referred you. That person can see a partly hidden form of your email address (for example a••••@gmail.com), when you joined, and whether your first purchase earned a reward, including the reward amount. When you create your account and each time you sign in, we also record the IP address you used and the approximate location it indicates (country, region and city). The location is looked up on our own servers; your IP address is not sent to another company for this. We also keep an activity log of actions on your account — such as signing in, changing your password, and creating, changing or deleting QR codes — recording the time, the IP address and the browser used for each.",
  },
  {
    title: "2. How We Use Your Information",
    content: "We use the collected information to operate and maintain our platform, process transactions, send service updates, and provide analytics features to our customers. We use the sign-up and sign-in locations to protect accounts and to understand which countries and cities our customers are in, so we can plan features, languages and pricing, and the activity log to investigate fraud, abuse and security incidents. Only GenXQR administrators can see these locations and the activity log, and only our most senior administrators can see IP addresses. We do not sell your personal information or the scanning data of your end-users to third parties.",
  },
  {
    title: "3. Data Security",
    content: "Security is our top priority. We implement industry-standard security measures including AES-256-GCM encryption for data at rest and TLS 1.3 for data in transit. Passwords are cryptographically hashed using bcrypt (cost factor 12). We regularly audit our systems for vulnerabilities.",
  },
  {
    title: "4. Third-Party Services",
    content: "We use trusted third-party service providers (such as Cashfree for payments and Resend for emails). These providers only have access to the information necessary to perform their specific functions and are prohibited from using it for any other purpose.",
  },
  {
    title: "5. Your Rights (GDPR & CCPA)",
    content: "Depending on your location, you may have the right to access, correct, delete, or restrict the processing of your personal data. You can exercise these rights directly through your Account Settings or by contacting our Data Protection Officer.",
  },
  {
    title: "6. Data Retention",
    content: "We retain your account data for as long as your account exists. Scan analytics are kept while your account has an active plan or trial, and for 3 months after it ends (when the account moves to the Free plan); the scan records are then deleted. Your QR codes are not deleted at that point — they stay paused and can be renewed. When you delete your account, we delete your QR codes, uploaded files, all scan data and any GenXQR credit. We keep a one-way hash of your email address (not the address itself) after you delete your account, so the same person cannot receive another free trial or reuse a once-per-customer coupon, and, if you joined through a referral link, cannot be referred again by the same person. The sign-up and latest sign-in locations stored with your account are deleted with it. Each entry in the activity log is kept for 3 years and then deleted, including after you delete your account, so that fraud, abuse or security incidents can be investigated later; once your account is deleted its entries are no longer linked to an account, but until they are deleted they still contain the IP addresses and browsers used, and some entries, such as the one recording your sign-up, contain your email address. You can export your data at any time before account deletion.",
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
      <LegalHero icon={Shield} title={<>Privacy <span className="text-accent">Policy</span></>} subtitle="Last updated: October 24, 2026" />
      <LegalBody>
        <LegalStats
          items={[
            { icon: Lock, tint: "violet", label: "Encrypted", sub: "AES-256 at rest" },
            { icon: Database, tint: "blue", label: "Secure storage", sub: "On servers we operate" },
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
