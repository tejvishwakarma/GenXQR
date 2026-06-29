import { FileText } from "lucide-react"

export default function TermsPage() {
  return (
    <div className="pt-24 pb-24 px-4 animate-fade-in">
      <div className="max-w-4xl mx-auto">
        <div className="mb-16">
          <span className="section-header mb-6">
            <FileText size={14} />
            Legal
          </span>
          <h1 className="text-4xl md:text-5xl font-bold text-white mb-6">
            Terms of <span className="gradient-text">Service</span>
          </h1>
          <p className="text-zinc-400 text-lg">
            Last updated: March 12, 2026
          </p>
        </div>

        <div className="glass-card rounded-2xl p-8 md:p-12 space-y-10">
          <div className="space-y-4">
            <h2 className="text-xl font-bold text-white">1. Agreement to Terms</h2>
            <p className="text-zinc-400 leading-relaxed text-sm md:text-base">
              By accessing or using GenXQR, you agree to be bound by these Terms of Service. If you disagree with any part of these terms, you may not access our services. These terms apply to all visitors, users, and others who access the service.
            </p>
          </div>

          <div className="space-y-4">
            <h2 className="text-xl font-bold text-white">2. Acceptable Use Policy</h2>
            <p className="text-zinc-400 leading-relaxed text-sm md:text-base">
              You agree not to use GenXQR to encode URLs or content that:
            </p>
            <ul className="list-disc pl-5 space-y-2 text-zinc-400 text-sm md:text-base">
              <li>Maligns, defames, or otherwise harms third parties.</li>
              <li>Contains malware, phishing attempts, or malicious code.</li>
              <li>Violates intellectual property rights or copyright laws.</li>
              <li>Promotes illegal activities, violence, or hate speech.</li>
            </ul>
            <p className="text-zinc-400 leading-relaxed text-sm md:text-base mt-2">
              We reserve the right to immediately suspend or terminate any QR codes or accounts that violate this policy, without prior notice or refund.
            </p>
          </div>

          <div className="space-y-4">
            <h2 className="text-xl font-bold text-white">3. Subscriptions and Payments</h2>
            <p className="text-zinc-400 leading-relaxed text-sm md:text-base">
              Some parts of the Service are billed on a subscription basis. You will be billed in advance on a recurring and periodic basis (monthly or annually). Your subscription will automatically renew under the exact same conditions unless you cancel it or we cancel it.
            </p>
          </div>

          <div className="space-y-4">
            <h2 className="text-xl font-bold text-white">4. API Usage Limits</h2>
            <p className="text-zinc-400 leading-relaxed text-sm md:text-base">
              If you access GenXQR via our Developer API, your usage is subject to rate limits based on your subscription tier. Automated scraping, bulk generation circumvention, or any attempts to destabilize the service will result in permanent API key revocation.
            </p>
          </div>

          <div className="space-y-4">
            <h2 className="text-xl font-bold text-white">5. Limitation of Liability</h2>
            <p className="text-zinc-400 leading-relaxed text-sm md:text-base">
              In no event shall GenXQR, nor its directors, employees, partners, agents, suppliers, or affiliates, be liable for any indirect, incidental, special, consequential or punitive damages, including without limitation, loss of profits, data, use, goodwill, or other intangible losses, resulting from your access to or use of or inability to access or use the Service.
            </p>
          </div>

          <div className="pt-8 border-t border-zinc-800">
            <p className="text-zinc-500 text-sm italic">
              These terms are subject to change. We will notify users of any significant changes via email or system notification.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
