import { Shield, UserCheck, Database } from "lucide-react"
import { SEOMeta } from "@/components/SEOMeta"
import { LegalPage, LegalHero, LegalStats, LegalBody, LegalCard } from "@/components/marketing/Legal"

const rights = [
  { title: "Right of access", desc: "Request a copy of the personal data we hold about you and understand how it is processed." },
  { title: "Right to rectification", desc: "Correct inaccurate or incomplete personal data directly through account settings or support." },
  { title: "Right to erasure", desc: "Request deletion of your personal data where legally applicable." },
  { title: "Right to restrict processing", desc: "Ask us to limit processing in specific circumstances." },
  { title: "Right to data portability", desc: "Request export of your account data in a structured, machine-readable format." },
  { title: "Right to object", desc: "Object to certain processing activities based on legitimate interest." },
]

export default function GDPRPage() {
  return (
    <LegalPage>
      <SEOMeta
        title="GDPR"
        description="GenXQR GDPR information, data subject rights, and data processing commitments."
        url="/gdpr"
      />
      <LegalHero
        icon={Shield}
        eyebrow="Compliance"
        title={<>GDPR <span className="text-accent">Commitment</span></>}
        subtitle="We are committed to transparent data processing and to honoring user rights under the General Data Protection Regulation."
      />
      <LegalBody>
        <LegalStats
          items={[
            { icon: UserCheck, tint: "violet", label: "Data rights", sub: "Access, update, delete, export" },
            { icon: Database, tint: "blue", label: "Data minimization", sub: "Only data needed for service operation" },
            { icon: Shield, tint: "emerald", label: "Secure processing", sub: "Encryption and strict access controls" },
          ]}
        />
        <LegalCard>
          <div>
            <h2 className="text-xl font-bold font-display text-ink mb-5">Your GDPR rights</h2>
            <div className="grid sm:grid-cols-2 gap-4">
              {rights.map((right) => (
                <div key={right.title} className="rounded-xl border border-line bg-paper p-5">
                  <h3 className="text-ink font-semibold text-sm mb-2">{right.title}</h3>
                  <p className="text-ink-soft text-sm leading-relaxed">{right.desc}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="pt-8 border-t border-line space-y-3">
            <h2 className="text-xl font-bold font-display text-ink">How to submit a request</h2>
            <p className="text-ink-soft text-sm md:text-base leading-relaxed">
              You can submit data rights requests from your account settings or by contacting our privacy team. We respond within legally required timelines.
            </p>
            <p className="text-ink-soft text-sm md:text-base">
              Contact:{" "}
              <a href="mailto:privacy@genxqr.com" className="text-accent hover:text-accent-ink">
                privacy@genxqr.com
              </a>
            </p>
          </div>
        </LegalCard>
      </LegalBody>
    </LegalPage>
  )
}
