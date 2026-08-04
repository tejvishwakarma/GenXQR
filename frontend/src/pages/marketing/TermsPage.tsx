import { FileText } from "lucide-react"
import { SEOMeta } from "@/components/SEOMeta"
import { LegalPage, LegalHero, LegalBody, LegalCard, LegalSection } from "@/components/marketing/Legal"

export default function TermsPage() {
  return (
    <LegalPage>
      <SEOMeta
        title="Terms of Service"
        description="GenXQR Terms of Service — acceptable use, subscriptions and billing, API usage limits, and liability terms."
        url="/terms"
      />
      <LegalHero icon={FileText} title={<>Terms of <span className="text-accent">Service</span></>} subtitle="Last updated: March 12, 2026" />
      <LegalBody>
        <LegalCard>
          <LegalSection title="1. Agreement to Terms">
            <p>
              By accessing or using GenXQR, you agree to be bound by these Terms of Service. If you disagree with any part of these terms, you may not access our services. These terms apply to all visitors, users, and others who access the service.
            </p>
          </LegalSection>

          <LegalSection title="2. Acceptable Use Policy">
            <p>You agree not to use GenXQR to encode URLs or content that:</p>
            <ul className="list-disc pl-5 space-y-2">
              <li>Maligns, defames, or otherwise harms third parties.</li>
              <li>Contains malware, phishing attempts, or malicious code.</li>
              <li>Violates intellectual property rights or copyright laws.</li>
              <li>Promotes illegal activities, violence, or hate speech.</li>
            </ul>
            <p className="mt-2">
              We reserve the right to immediately suspend or terminate any QR codes or accounts that violate this policy, without prior notice or refund.
            </p>
          </LegalSection>

          <LegalSection title="3. Subscriptions and Payments">
            <p>
              Some parts of the Service are billed on a subscription basis. You will be billed in advance on a recurring and periodic basis (monthly or annually). Your subscription will automatically renew under the exact same conditions unless you cancel it or we cancel it.
            </p>
          </LegalSection>

          <LegalSection title="4. API Usage Limits">
            <p>
              If you access GenXQR via our Developer API, your usage is subject to rate limits based on your subscription tier. Automated scraping, bulk generation circumvention, or any attempts to destabilize the service will result in permanent API key revocation.
            </p>
          </LegalSection>

          <LegalSection title="5. Limitation of Liability">
            <p>
              In no event shall GenXQR, nor its directors, employees, partners, agents, suppliers, or affiliates, be liable for any indirect, incidental, special, consequential or punitive damages, including without limitation, loss of profits, data, use, goodwill, or other intangible losses, resulting from your access to or use of or inability to access or use the Service.
            </p>
          </LegalSection>

          <div className="pt-8 border-t border-line">
            <p className="text-ink-faint text-sm italic">
              These terms are subject to change. We will notify users of any significant changes via email or system notification.
            </p>
          </div>
        </LegalCard>
      </LegalBody>
    </LegalPage>
  )
}
