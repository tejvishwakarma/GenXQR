import { BadgeIndianRupee, Clock, XCircle } from "lucide-react"
import { SEOMeta } from "@/components/SEOMeta"
import { LegalPage, LegalHero, LegalStats, LegalBody, LegalCard, LegalSection } from "@/components/marketing/Legal"
import { ORGANISATION } from "@/lib/site"
import { breadcrumbSchema, webPageSchema } from "@/lib/schema"

/**
 * Refund & Cancellation Policy.
 *
 * Required as a dedicated, linked page for Indian payment-gateway onboarding
 * (Cashfree lists "Refund or return policy" as required for any business that
 * charges customers). The terms here are the ones already published in the
 * FAQ — a 7-day money-back guarantee on new subscriptions — restated in full
 * rather than newly invented, so nothing contradicts what customers were
 * already told.
 */
const sections = [
  {
    title: "1. 7-day money-back guarantee",
    content:
      "New paid subscriptions are covered by a 7-day money-back guarantee. If GenXQR is not right for you, contact us within 7 days of the initial payment and we will refund that payment in full. The guarantee applies once per customer and covers the first payment on a subscription, not subsequent renewals.",
  },
  {
    title: "2. After the first 7 days",
    content:
      "Beyond the 7-day window, payments are non-refundable, including for partially used billing periods. You can cancel at any time to stop all future charges — see section 4. Cancelling does not generate a pro-rata refund for the remainder of the period you have already paid for.",
  },
  {
    title: "3. Renewals",
    content:
      "Subscriptions renew automatically at the end of each billing period. Renewal payments are not covered by the money-back guarantee. If a renewal has charged you unexpectedly, contact us — where a renewal was clearly unintended and the new period is largely unused, we will review it case by case.",
  },
  {
    title: "4. How to cancel",
    content:
      "Cancel from Billing in your dashboard at any time. Cancellation takes effect at the end of the current billing period: your plan stays active, and your QR codes keep working, until that date. No further payments are taken after you cancel.",
  },
  {
    title: "5. What happens to your QR codes",
    content:
      "When a paid plan ends, dynamic QR codes stop redirecting and their analytics become unavailable, because those are paid features. Your data is retained for 30 days after the period ends, so resubscribing within that window restores everything. Static QR codes are unaffected — they encode their destination directly and keep working permanently.",
  },
  {
    title: "6. Requesting a refund",
    content:
      `Email ${ORGANISATION.email} from the address on the account, stating the payment date and the reason. We respond to refund requests within 3 business days. Approved refunds are issued to the original payment method — we cannot refund to a different card, account, or UPI ID.`,
  },
  {
    title: "7. Time to receive an approved refund",
    content:
      "Once approved, we submit the refund to our payment provider immediately. The funds typically reach your account within 5–7 business days for cards and 3–5 business days for UPI and net banking. Exact timing is set by your bank and outside our control.",
  },
  {
    title: "8. Failed and duplicate payments",
    content:
      "If you were charged twice for the same billing period, or charged for a payment that failed, contact us and we will refund the surplus in full regardless of the 7-day window. Duplicate charges are our error, not a change of mind, and are not treated as a refund request.",
  },
  {
    title: "9. Accounts terminated for abuse",
    content:
      "Accounts suspended or terminated for violating our Terms of Service — including using QR codes for phishing, malware distribution, or other illegal activity — are not eligible for a refund of any kind.",
  },
  {
    title: "10. Enterprise and custom agreements",
    content:
      "Enterprise plans are arranged directly and governed by the refund and cancellation terms in their individual agreement, which take precedence over this page where the two differ.",
  },
]

const JSON_LD = [
  webPageSchema({
    name: "Refund & Cancellation Policy",
    path: "/refund-policy",
    description: "GenXQR refund and cancellation terms, including the 7-day money-back guarantee on new subscriptions.",
  }),
  breadcrumbSchema([{ name: "Refund & Cancellation Policy", path: "/refund-policy" }]),
]

export default function RefundPolicyPage() {
  return (
    <LegalPage>
      <SEOMeta
        title="Refund & Cancellation Policy"
        description="GenXQR offers a 7-day money-back guarantee on new subscriptions. Read our full refund, cancellation, and renewal terms."
        url="/refund-policy"
        jsonLd={JSON_LD}
      />
      <LegalHero
        icon={BadgeIndianRupee}
        title={<>Refund &amp; <span className="text-accent">Cancellation</span></>}
        subtitle="Last updated: August 13, 2026"
      />
      <LegalBody>
        <LegalStats
          items={[
            { icon: Clock, tint: "violet", label: "7-day guarantee", sub: "Full refund on new subscriptions" },
            { icon: XCircle, tint: "blue", label: "Cancel anytime", sub: "Runs to the end of the period" },
            { icon: BadgeIndianRupee, tint: "emerald", label: "5–7 business days", sub: "Typical time to receive funds" },
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
              For refunds, cancellations, or billing questions, contact{" "}
              <a href={`mailto:${ORGANISATION.email}`} className="text-accent hover:text-accent-ink">
                {ORGANISATION.email}
              </a>
              . We respond within 3 business days.
            </p>
          </div>
        </LegalCard>
      </LegalBody>
    </LegalPage>
  )
}
