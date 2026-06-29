import { Shield, Lock, Eye, Database } from "lucide-react"

export default function PrivacyPage() {
  const sections = [
    {
      title: "1. Information We Collect",
      content: "When you use GenXQR, we collect specific information to provide our services. This includes account information (name, email), billing details, and analytics data collected from users who scan your QR codes (IP address, approximate location, device type, browser, and scan timestamp)."
    },
    {
      title: "2. How We Use Your Information",
      content: "We use the collected information to operate and maintain our platform, process transactions, send service updates, and provide analytics features to our customers. We do not sell your personal information or the scanning data of your end-users to third parties."
    },
    {
      title: "3. Data Security",
      content: "Security is our top priority. We implement industry-standard security measures including AES-256-GCM encryption for data at rest and TLS 1.3 for data in transit. Passwords are cryptographically hashed using Argon2id. We regularly audit our systems for vulnerabilities."
    },
    {
      title: "4. Third-Party Services",
      content: "We use trusted third-party service providers (such as Stripe for payments, Oracle Cloud for hosting, and Resend for emails). These providers only have access to the information necessary to perform their specific functions and are prohibited from using it for any other purpose."
    },
    {
      title: "5. Your Rights (GDPR & CCPA)",
      content: "Depending on your location, you may have the right to access, correct, delete, or restrict the processing of your personal data. You can exercise these rights directly through your Account Settings or by contacting our Data Protection Officer."
    },
    {
      title: "6. Data Retention",
      content: "We retain your account data for as long as your account is active. Analytics data is retained according to your subscription tier (e.g., 30 days for Free, 1 year for Pro). You can export your data at any time before account deletion."
    }
  ]

  return (
    <div className="pt-24 pb-24 px-4 animate-fade-in">
      <div className="max-w-4xl mx-auto">
        <div className="mb-16">
          <span className="section-header mb-6">
            <Shield size={14} />
            Legal
          </span>
          <h1 className="text-4xl md:text-5xl font-bold text-white mb-6">
            Privacy <span className="gradient-text">Policy</span>
          </h1>
          <p className="text-zinc-400 text-lg">
            Last updated: March 12, 2026
          </p>
        </div>

        <div className="grid sm:grid-cols-3 gap-6 mb-16">
          <div className="glass-card p-6 rounded-2xl flex flex-col items-center justify-center text-center">
            <Lock className="text-violet-400 mb-3" size={24} />
            <h3 className="text-white font-medium mb-1">Encrypted</h3>
            <p className="text-xs text-zinc-500">AES-256 At Rest</p>
          </div>
          <div className="glass-card p-6 rounded-2xl flex flex-col items-center justify-center text-center">
            <Database className="text-blue-400 mb-3" size={24} />
            <h3 className="text-white font-medium mb-1">Secure Storage</h3>
            <p className="text-xs text-zinc-500">Oracle Cloud Infrastructure</p>
          </div>
          <div className="glass-card p-6 rounded-2xl flex flex-col items-center justify-center text-center">
            <Eye className="text-emerald-400 mb-3" size={24} />
            <h3 className="text-white font-medium mb-1">No Selling</h3>
            <p className="text-xs text-zinc-500">Your Data is Yours</p>
          </div>
        </div>

        <div className="glass-card rounded-2xl p-8 md:p-12 space-y-10">
          <p className="text-zinc-300 leading-relaxed text-sm md:text-base">
            This Privacy Policy describes how GenXQR ("we", "us", or "our") collects, uses, and shares your personal information when you use our website, developer API, and related services (collectively, the "Services").
          </p>
          
          {sections.map(section => (
            <div key={section.title} className="space-y-3">
              <h2 className="text-xl font-bold text-white">{section.title}</h2>
              <p className="text-zinc-400 leading-relaxed text-sm md:text-base">{section.content}</p>
            </div>
          ))}

          <div className="pt-8 border-t border-zinc-800">
            <h2 className="text-xl font-bold text-white mb-4">Contact Us</h2>
            <p className="text-zinc-400 leading-relaxed text-sm md:text-base mb-4">
              If you have any questions or concerns about this Privacy Policy, please contact our Data Protection Officer at:
            </p>
            <a href="mailto:privacy@genxqr.com" className="text-violet-400 hover:text-violet-300 font-medium transition-colors">
              privacy@genxqr.com
            </a>
          </div>
        </div>
      </div>
    </div>
  )
}
