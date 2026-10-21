import { FileText } from "lucide-react"
import { SEOMeta } from "@/components/SEOMeta"
import { LegalPage, LegalHero, LegalBody, LegalCard, LegalSection } from "@/components/marketing/Legal"

export default function TermsPage() {
  return (
    <LegalPage>
      <SEOMeta
        title="Terms of Service"
        description="GenXQR Terms of Service — acceptable use, subscriptions and billing, the referral programme, API usage limits, and liability terms."
        url="/terms"
      />
      <LegalHero icon={FileText} title={<>Terms of <span className="text-accent">Service</span></>} subtitle="Last updated: October 21, 2026" />
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
              Some parts of the Service are billed on a subscription basis. You pay in advance for each billing period (monthly or annually). Payments are not taken automatically: your subscription does not auto-renew, and to continue after a period ends you pay again. If you do not, your account moves to the free plan and its dynamic QR codes are paused until you do; scan history is kept for 3 months after that and then deleted. Each paid plan includes a monthly scan allowance: once it is used up, your QR codes stop redirecting until the allowance resets or you upgrade.
            </p>
          </LegalSection>

          <LegalSection title="4. Referral Programme">
            <p>
              Every GenXQR account has a personal referral link. When someone creates a new GenXQR account through your link and then makes their first paid purchase, you and they each receive GenXQR credit equal to 20% of the amount they actually paid for that purchase, after any coupon or credit.
            </p>
            <ul className="list-disc pl-5 space-y-2">
              <li>Only the referred account's first paid purchase earns a reward. A purchase paid entirely with coupons or credit earns nothing, and later purchases earn nothing.</li>
              <li>Credit becomes usable 15 days after the qualifying purchase. It is then applied automatically to your next GenXQR plan purchase and can cover the full price.</li>
              <li>Credit can only be used for GenXQR plan purchases. It has no cash value and cannot be withdrawn, transferred to another account, or exchanged for money. Credit is lost if your account is deleted.</li>
              <li>You may refer as many people as you like, but each person only once. An account can be referred by only one person, and further accounts on the same email inbox (including address aliases, or an account deleted and created again) are not referred again. Referring yourself does not count.</li>
              <li>If the qualifying purchase is refunded or charged back, or we find the programme has been abused (for example through fake or duplicate accounts), we may cancel the rewards for that referral. If cancelled credit has already been spent, the amount is deducted from credit you earn later.</li>
              <li>If a purchase paid partly with credit is refunded, only the amount you paid is refunded.</li>
              <li>We may change or end the referral programme at any time.</li>
            </ul>
          </LegalSection>

          <LegalSection title="5. API Usage Limits">
            <p>
              If you access GenXQR via our Developer API, your usage is subject to rate limits based on your subscription tier. Automated scraping, bulk generation circumvention, or any attempts to destabilize the service will result in permanent API key revocation.
            </p>
          </LegalSection>

          <LegalSection title="6. Limitation of Liability">
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
