import { Cookie, ShieldCheck, Settings2 } from "lucide-react"
import { SEOMeta } from "@/components/SEOMeta"

const sections = [
  {
    title: "1. What are cookies",
    content:
      "Cookies are small text files stored on your device to help websites work efficiently, remember preferences, and improve user experience.",
  },
  {
    title: "2. How GenXQR uses cookies",
    content:
      "We use essential cookies for authentication, security, and session continuity. We may also use analytics cookies to understand aggregate platform usage and improve performance.",
  },
  {
    title: "3. Types of cookies we use",
    content:
      "Essential cookies support login and account security. Preference cookies remember UI settings. Analytics cookies help us measure feature adoption and reliability trends.",
  },
  {
    title: "4. Managing your cookie settings",
    content:
      "You can manage or block cookies from your browser settings at any time. Disabling essential cookies may affect sign-in and some platform functionality.",
  },
  {
    title: "5. Third-party cookies",
    content:
      "Some integrated services may set cookies to deliver core functionality. We only work with providers that follow strong security and privacy standards.",
  },
  {
    title: "6. Updates to this policy",
    content:
      "We may revise this Cookie Policy when product functionality or legal requirements change. Material updates will be reflected by changing the effective date below.",
  },
]

export default function CookiePolicyPage() {
  return (
    <div className="pt-24 pb-24 px-4 animate-fade-in">
      <SEOMeta
        title="Cookie Policy"
        description="Learn how GenXQR uses cookies for security, preferences, and platform performance."
        url="/cookie-policy"
      />

      <div className="max-w-4xl mx-auto">
        <div className="mb-16">
          <span className="section-header mb-6">
            <Cookie size={14} />
            Legal
          </span>
          <h1 className="text-4xl md:text-5xl font-bold text-white mb-6">
            Cookie <span className="gradient-text">Policy</span>
          </h1>
          <p className="text-zinc-400 text-lg">Last updated: March 16, 2026</p>
        </div>

        <div className="grid sm:grid-cols-3 gap-6 mb-16">
          <div className="glass-card p-6 rounded-2xl text-center">
            <ShieldCheck className="text-violet-400 mb-3 mx-auto" size={24} />
            <h3 className="text-white font-medium mb-1">Security First</h3>
            <p className="text-xs text-zinc-500">Essential cookies protect sessions</p>
          </div>
          <div className="glass-card p-6 rounded-2xl text-center">
            <Settings2 className="text-blue-400 mb-3 mx-auto" size={24} />
            <h3 className="text-white font-medium mb-1">User Control</h3>
            <p className="text-xs text-zinc-500">Manage via browser settings</p>
          </div>
          <div className="glass-card p-6 rounded-2xl text-center">
            <Cookie className="text-emerald-400 mb-3 mx-auto" size={24} />
            <h3 className="text-white font-medium mb-1">Transparent Usage</h3>
            <p className="text-xs text-zinc-500">Only required categories used</p>
          </div>
        </div>

        <div className="glass-card rounded-2xl p-8 md:p-12 space-y-10">
          {sections.map((section) => (
            <div key={section.title} className="space-y-3">
              <h2 className="text-xl font-bold text-white">{section.title}</h2>
              <p className="text-zinc-400 leading-relaxed text-sm md:text-base">{section.content}</p>
            </div>
          ))}

          <div className="pt-8 border-t border-zinc-800">
            <h2 className="text-xl font-bold text-white mb-3">Contact</h2>
            <p className="text-zinc-400 text-sm md:text-base">
              For cookie-related questions, contact us at
              <a href="mailto:privacy@genxqr.com" className="text-violet-400 hover:text-violet-300 ml-1">
                privacy@genxqr.com
              </a>
              .
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
