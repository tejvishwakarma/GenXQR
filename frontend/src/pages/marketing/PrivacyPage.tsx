import { Shield, Lock, Eye, Database } from "lucide-react"
import { SEOMeta } from "@/components/SEOMeta"
import { LegalPage, LegalHero, LegalStats, LegalBody, LegalCard, LegalSection } from "@/components/marketing/Legal"

const sections = [
  {
    title: "1. Information We Collect",
    content: "When you use GenXQR, we collect specific information to provide our services. This includes account information (name, email, and the mobile number you give at checkout or in your settings), billing details, and analytics data collected from users who scan your QR codes (IP address, approximate location, device type, browser, and scan timestamp). If your organisation has set up single sign-on, we receive your name and work email address from Google or Microsoft when you sign in that way, and you join your organisation's GenXQR team. If you sign up through someone's referral link, we record who referred you. That person can see a partly hidden form of your email address (for example a••••@gmail.com), when you joined, and whether your first purchase earned a reward, including the reward amount. When you create your account and each time you sign in, we also record the IP address you used and the approximate location it indicates (country, region and city). The location is looked up on our own servers; your IP address is not sent to another company for this. We also keep an activity log of actions on your account — such as signing in, changing your password, and creating, changing or deleting QR codes — recording the time, the IP address and the browser used for each.",
  },
  {
    title: "2. How We Use Your Information",
    content: "We use the collected information to operate and maintain our platform, process transactions, send service updates, and provide analytics features to our customers. We use the sign-up and sign-in locations to protect accounts and to understand which countries and cities our customers are in, so we can plan features, languages and pricing, and the activity log to investigate fraud, abuse and security incidents. Only GenXQR administrators can see these locations and the full activity log, and only our most senior administrators can see full IP addresses. You can see your own entries in the activity log under Activity in your dashboard. If you work in someone else's team workspace, its owner and admins can see what you changed there, when, and from which browser and device, with the IP address shortened to the network (for example 203.0.113.x); your sign-ins are only ever shown to you. We do not sell your personal information or the scanning data of your end-users to third parties.",
  },
  {
    title: "3. Data Security",
    content: "Everything sent between your browser or app and GenXQR is encrypted with HTTPS (TLS 1.2 or 1.3); plain HTTP requests are redirected to HTTPS. We never store your password, only a bcrypt hash of it (cost factor 12). API keys, sign-in sessions and the access tokens of apps you connect are also stored only as one-way hashes, so they cannot be read back from our database, and two-factor sign-in secrets are encrypted with AES-256-GCM. Our database and uploaded files are kept on servers we operate, and the database cannot be reached from the internet. We have our code and servers checked for security weaknesses and fix the problems found. No system is completely secure, so we also recommend turning on two-factor sign-in in your account settings.",
  },
  {
    title: "4. Third-Party Services",
    content: "We use these other companies to run GenXQR, and each receives only what its job needs. Cloudflare: every visit to genxqr.com, and to the custom domains customers connect, passes through Cloudflare, which protects and delivers the site and so sees the visitor's IP address, browser and the pages requested. Cashfree: processes payments; it receives your name, email address and mobile number with each order, and you enter your card or UPI details on Cashfree's own page, not ours. Resend: sends our emails, so it receives your email address and the message. Google: if you sign in with Google, Google tells us your name and email address; if you export to Google Drive, the files you choose are saved to your Drive; and, if you allow it, Google Analytics counts visits and which pages are used. Microsoft: if your organisation uses Microsoft single sign-on, Microsoft tells us your name and work email address; and, if you allow it, Microsoft Clarity records how our public pages are used (clicks, scrolling and the pages viewed) so we can find what is confusing or broken. Neither loads until you say yes, and you can change your choice at any time (\"Cookie settings\" at the bottom of every page). Google Analytics never runs on the admin panel or on the pages people see after scanning a code, Clarity runs only on our public pages, and neither runs on customers' custom domains or agencies' shared reports (see our Cookie Policy). If you connect GenXQR to another service yourself (for example Zapier, Make, an AI app, or your own webhook), that service receives the data you choose to send it, under its own privacy policy. We do not sell personal information to anyone.",
  },
  {
    title: "5. Your Rights (GDPR & CCPA)",
    content: "Depending on where you live, you may have the right to access, correct or delete your personal data, or to object to or restrict how we use it. You can change your name and mobile number, and delete your account, yourself in Settings. For anything else, such as a copy of your data, write to support@genxqr.com from the email address on your account and we will reply within one month.",
  },
  {
    title: "6. Answers to Forms on Scan Pages",
    content: "Some QR codes open a form made by the business that printed them (for example a feedback or enquiry form). If you answer one, your answers go to that business: GenXQR stores them on its behalf, shows them only to that business's account (and sends them to it by email or to its own systems if it has set that up), and deletes them when the business deletes them, the code, or its account. For questions about those answers, or to have them removed, contact the business; you can also write to us and we will pass the request on.",
  },
  {
    title: "7. Data Retention",
    content: "We retain your account data for as long as your account exists. Scan analytics are kept while your account has an active plan or trial, and for 3 months after it ends (when the account moves to the Free plan); the scan records are then deleted. Your QR codes are not deleted at that point — they stay paused and can be renewed. When you delete your account, we delete your QR codes, uploaded files, all scan data and any GenXQR credit. We keep a one-way hash of your email address (not the address itself) after you delete your account, so the same person cannot receive another free trial or reuse a once-per-customer coupon, and, if you joined through a referral link, cannot be referred again by the same person. The sign-up and latest sign-in locations stored with your account are deleted with it. Each entry in the activity log is kept for 3 years and then deleted, including after you delete your account, so that fraud, abuse or security incidents can be investigated later; once your account is deleted its entries are no longer linked to an account, but until they are deleted they still contain the IP addresses and browsers used, and some entries, such as the one recording your sign-up, contain your email address. Before deleting your account you can download your QR codes and each code's scan records from the dashboard, or ask us for a copy of your data.",
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
      <LegalHero icon={Shield} title={<>Privacy <span className="text-accent">Policy</span></>} subtitle="Last updated: November 9, 2026" />
      <LegalBody>
        <LegalStats
          items={[
            { icon: Lock, tint: "violet", label: "Encrypted", sub: "HTTPS on every page" },
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
              If you have any questions or concerns about this Privacy Policy, please write to us at:
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
