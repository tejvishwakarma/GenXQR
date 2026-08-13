import { MessageSquare, MapPin, Phone, Mail } from "lucide-react"
import { SEOMeta } from "@/components/SEOMeta"
import { MktContainer, Reveal, MktCard, IconTile, MktButton } from "@/components/marketing/ui"
import { PageHero } from "@/components/marketing/PageHero"
import { ORGANISATION } from "@/lib/site"

export default function ContactPage() {
  return (
    <div className="pb-24 md:pb-32">
      <SEOMeta
        title="Contact Us"
        description="Get in touch with the GenXQR team for support, sales, or enterprise questions."
        url="/contact"
      />

      <PageHero
        eyebrow="Contact us"
        title={
          <>
            We'd love to <span className="text-accent">hear from you</span>
          </>
        }
        intro="Have a question about GenXQR or want to discuss a custom enterprise plan? Reach out to our team."
      />

      <MktContainer>
        <div className="grid lg:grid-cols-2 gap-12 items-start">
          {/* Contact Info */}
          <Reveal className="space-y-8">
            <h2 className="text-2xl font-bold font-display tracking-tightest text-ink">Get in touch</h2>

            <div className="grid sm:grid-cols-2 gap-6">
              <MktCard interactive={false}>
                <IconTile icon={MessageSquare} tint="violet" className="mb-4" />
                <h3 className="text-ink font-semibold mb-2">Support</h3>
                <p className="text-ink-soft text-sm mb-4">We're here to help with any technical or account issues.</p>
                <a href="mailto:support@genxqr.com" className="text-accent text-sm font-medium hover:text-accent-ink">
                  support@genxqr.com
                </a>
              </MktCard>

              <MktCard interactive={false}>
                <IconTile icon={Mail} tint="blue" className="mb-4" />
                <h3 className="text-ink font-semibold mb-2">Sales</h3>
                <p className="text-ink-soft text-sm mb-4">Questions about pricing or enterprise features?</p>
                <a href={`mailto:${ORGANISATION.email}`} className="text-accent text-sm font-medium hover:text-accent-ink">
                  {ORGANISATION.email}
                </a>
              </MktCard>
            </div>

            {/* A reachable phone number is explicitly required alongside an
                email address for payment-gateway onboarding. */}
            <MktCard interactive={false} className="flex items-start gap-4">
              <IconTile icon={Phone} tint="violet" className="mt-1" />
              <div>
                <h3 className="text-ink font-semibold mb-2">Phone</h3>
                <a
                  href={`tel:${ORGANISATION.phone.replace(/\s+/g, "")}`}
                  className="text-accent text-sm font-medium hover:text-accent-ink"
                >
                  {ORGANISATION.phone}
                </a>
                <p className="text-ink-soft text-xs mt-1">Monday to Friday, 10:00–18:00 IST</p>
              </div>
            </MktCard>

            <MktCard interactive={false} className="flex items-start gap-4">
              <IconTile icon={MapPin} tint="emerald" className="mt-1" />
              <div>
                <h3 className="text-ink font-semibold mb-2">Headquarters</h3>
                {/* The registered legal entity must appear here for
                    payment-gateway onboarding — reviewers match it against the
                    PAN / certificate of incorporation. */}
                <p className="text-ink-soft text-sm leading-relaxed">
                  {ORGANISATION.legalName}<br />
                  Trading as {ORGANISATION.name}<br />
                  {ORGANISATION.addressLocality}, India
                </p>
              </div>
            </MktCard>
          </Reveal>

          {/* Contact Form */}
          <Reveal delay={100}>
            <MktCard interactive={false} className="p-8">
              <h2 className="text-2xl font-bold font-display tracking-tightest text-ink mb-6">Send a message</h2>

              <form className="space-y-5">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm font-medium text-ink-soft mb-1.5 block">First Name</label>
                    <input
                      type="text"
                      placeholder="John"
                      className="w-full rounded-xl border border-line bg-paper-pure px-4 py-2.5 text-sm text-ink placeholder:text-ink-faint focus:outline-none focus:ring-2 focus:ring-accent/40 focus:border-accent transition-colors"
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium text-ink-soft mb-1.5 block">Last Name</label>
                    <input
                      type="text"
                      placeholder="Doe"
                      className="w-full rounded-xl border border-line bg-paper-pure px-4 py-2.5 text-sm text-ink placeholder:text-ink-faint focus:outline-none focus:ring-2 focus:ring-accent/40 focus:border-accent transition-colors"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-sm font-medium text-ink-soft mb-1.5 block">Work Email</label>
                  <input
                    type="email"
                    placeholder="john@company.com"
                    className="w-full rounded-xl border border-line bg-paper-pure px-4 py-2.5 text-sm text-ink placeholder:text-ink-faint focus:outline-none focus:ring-2 focus:ring-accent/40 focus:border-accent transition-colors"
                  />
                </div>

                <div>
                  <label className="text-sm font-medium text-ink-soft mb-1.5 block">Subject</label>
                  <select className="w-full rounded-xl border border-line bg-paper-pure px-4 py-2.5 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-accent/40 focus:border-accent transition-colors appearance-none">
                    <option>General Inquiry</option>
                    <option>Sales & Enterprise</option>
                    <option>Technical Support</option>
                    <option>Billing Question</option>
                  </select>
                </div>

                <div>
                  <label className="text-sm font-medium text-ink-soft mb-1.5 block">Message</label>
                  <textarea
                    className="w-full rounded-xl border border-line bg-paper-pure px-4 py-3 text-sm text-ink placeholder:text-ink-faint focus:outline-none focus:ring-2 focus:ring-accent/40 focus:border-accent transition-colors resize-none h-32"
                    placeholder="How can we help you?"
                  ></textarea>
                </div>

                <MktButton variant="accent" size="lg" className="w-full">
                  Send Message
                </MktButton>
              </form>
            </MktCard>
          </Reveal>
        </div>
      </MktContainer>
    </div>
  )
}
