import { Zap, Globe2, MailCheck } from "lucide-react"
import { SEOMeta } from "@/components/SEOMeta"
import { LegalPage, LegalHero, LegalStats, LegalBody, LegalCard, LegalSection } from "@/components/marketing/Legal"
import { ORGANISATION } from "@/lib/site"
import { breadcrumbSchema, webPageSchema } from "@/lib/schema"

/**
 * Service Delivery Policy.
 *
 * Indian payment gateways ask for a "Shipping and delivery policy" even from
 * businesses that ship nothing physical — reviewers are checking that a
 * customer can tell what they receive and when. This states plainly that
 * GenXQR is a digital service delivered instantly to the account, with nothing
 * posted and no delivery charges.
 */
const sections = [
  {
    title: "1. What you receive",
    content:
      "GenXQR is software delivered over the internet. There is no physical product and nothing is shipped. A subscription gives you access to your account at genxqr.com, where you create and manage QR codes, and download them as image or vector files.",
  },
  {
    title: "2. When access begins",
    content:
      "Access is activated immediately once payment is confirmed by our payment provider — normally within seconds. Your plan's features become available on the same account you paid from, with no waiting period and no separate activation step.",
  },
  {
    title: "3. If access has not activated",
    content:
      `Occasionally a bank or payment provider holds a confirmation for a few minutes. If your plan has not activated within 30 minutes of a successful payment, email ${ORGANISATION.email} with the payment reference and we will activate it manually. You will not be charged twice for a delayed activation.`,
  },
  {
    title: "4. Delivery of files you create",
    content:
      "QR codes you generate are downloaded directly from your browser in PNG, JPEG, WebP, SVG, or editable vector PDF. Downloads are immediate and unlimited within your plan. Files are not emailed or posted.",
  },
  {
    title: "5. Geographic availability",
    content:
      "GenXQR is available worldwide wherever there is internet access. QR codes you create work in any country and require no app for the person scanning them. Prices are charged in Indian Rupees (INR).",
  },
  {
    title: "6. Delivery charges",
    content:
      "There are none. Because nothing is physically shipped, there are no shipping, handling, courier, or customs charges at any point. The plan price shown at checkout is the full amount payable.",
  },
  {
    title: "7. Duration of access",
    content:
      "Access continues for as long as your subscription is active and renews automatically each billing period until cancelled. See the Refund & Cancellation Policy for what happens to your QR codes when a plan ends.",
  },
  {
    title: "8. Service availability",
    content:
      "We target 99.9% uptime for QR code redirects, which is the part customers depend on most — a scanned code resolving correctly. Planned maintenance is scheduled outside peak hours and announced in advance where it could be disruptive.",
  },
]

const JSON_LD = [
  webPageSchema({
    name: "Service Delivery Policy",
    path: "/delivery-policy",
    description: "How GenXQR delivers its service: instant digital access, no physical shipment, no delivery charges.",
  }),
  breadcrumbSchema([{ name: "Service Delivery Policy", path: "/delivery-policy" }]),
]

export default function DeliveryPolicyPage() {
  return (
    <LegalPage>
      <SEOMeta
        title="Service Delivery Policy"
        description="GenXQR is a digital service. Access activates immediately after payment, nothing is shipped, and there are no delivery charges."
        url="/delivery-policy"
        jsonLd={JSON_LD}
      />
      <LegalHero
        icon={Zap}
        title={<>Service <span className="text-accent">Delivery</span></>}
        subtitle="Last updated: August 13, 2026"
      />
      <LegalBody>
        <LegalStats
          items={[
            { icon: Zap, tint: "violet", label: "Instant access", sub: "Activated on payment confirmation" },
            { icon: Globe2, tint: "blue", label: "Available worldwide", sub: "No app needed to scan" },
            { icon: MailCheck, tint: "emerald", label: "Nothing shipped", sub: "No delivery charges, ever" },
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
              Questions about access or activation? Email{" "}
              <a href={`mailto:${ORGANISATION.email}`} className="text-accent hover:text-accent-ink">
                {ORGANISATION.email}
              </a>
              .
            </p>
          </div>
        </LegalCard>
      </LegalBody>
    </LegalPage>
  )
}
