import { Shield, UserCheck, Database } from "lucide-react"
import { SEOMeta } from "@/components/SEOMeta"

const rights = [
  {
    title: "Right of access",
    desc: "Request a copy of the personal data we hold about you and understand how it is processed.",
  },
  {
    title: "Right to rectification",
    desc: "Correct inaccurate or incomplete personal data directly through account settings or support.",
  },
  {
    title: "Right to erasure",
    desc: "Request deletion of your personal data where legally applicable.",
  },
  {
    title: "Right to restrict processing",
    desc: "Ask us to limit processing in specific circumstances.",
  },
  {
    title: "Right to data portability",
    desc: "Request export of your account data in a structured, machine-readable format.",
  },
  {
    title: "Right to object",
    desc: "Object to certain processing activities based on legitimate interest.",
  },
]

export default function GDPRPage() {
  return (
    <div className="pt-24 pb-24 px-4 animate-fade-in">
      <SEOMeta
        title="GDPR"
        description="GenXQR GDPR information, data subject rights, and data processing commitments."
        url="/gdpr"
      />

      <div className="max-w-5xl mx-auto">
        <div className="mb-16">
          <span className="section-header mb-6">
            <Shield size={14} />
            Compliance
          </span>
          <h1 className="text-4xl md:text-5xl font-bold text-white mb-6">
            GDPR <span className="gradient-text">Commitment</span>
          </h1>
          <p className="text-zinc-400 text-lg">
            We are committed to transparent data processing and to honoring user rights under the General Data Protection Regulation.
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-6 mb-12">
          <div className="glass-card p-6 rounded-2xl text-center">
            <UserCheck className="mx-auto text-violet-400 mb-3" size={24} />
            <h3 className="text-white font-medium">Data Rights</h3>
            <p className="text-zinc-500 text-xs mt-1">Access, update, delete, export</p>
          </div>
          <div className="glass-card p-6 rounded-2xl text-center">
            <Database className="mx-auto text-blue-400 mb-3" size={24} />
            <h3 className="text-white font-medium">Data Minimization</h3>
            <p className="text-zinc-500 text-xs mt-1">Only data needed for service operation</p>
          </div>
          <div className="glass-card p-6 rounded-2xl text-center">
            <Shield className="mx-auto text-emerald-400 mb-3" size={24} />
            <h3 className="text-white font-medium">Secure Processing</h3>
            <p className="text-zinc-500 text-xs mt-1">Encryption and strict access controls</p>
          </div>
        </div>

        <div className="glass-card rounded-2xl p-8 md:p-12">
          <h2 className="text-2xl font-bold text-white mb-6">Your GDPR rights</h2>
          <div className="grid sm:grid-cols-2 gap-4">
            {rights.map((right) => (
              <div key={right.title} className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-5">
                <h3 className="text-white font-semibold text-sm mb-2">{right.title}</h3>
                <p className="text-zinc-400 text-sm leading-relaxed">{right.desc}</p>
              </div>
            ))}
          </div>

          <div className="mt-10 pt-8 border-t border-zinc-800 space-y-3">
            <h2 className="text-xl font-bold text-white">How to submit a request</h2>
            <p className="text-zinc-400 text-sm md:text-base leading-relaxed">
              You can submit data rights requests from your account settings or by contacting our privacy team. We respond within legally required timelines.
            </p>
            <p className="text-zinc-400 text-sm md:text-base">
              Contact:
              <a href="mailto:privacy@genxqr.com" className="text-violet-400 hover:text-violet-300 ml-1">
                privacy@genxqr.com
              </a>
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
