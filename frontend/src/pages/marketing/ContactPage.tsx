import { MapPin, Mail, Clock } from "lucide-react"
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

            {/* One address handles support, sales and billing, so a second
                email card would just repeat it. The companion card sets
                response expectations instead — the thing people actually want
                to know when there is no phone number to call. */}
            <div className="grid sm:grid-cols-2 gap-6">
              <MktCard interactive={false}>
                <IconTile icon={Mail} tint="violet" className="mb-4" />
                <h3 className="text-ink font-semibold mb-2">Email us</h3>
                <p className="text-ink-soft text-sm mb-4">
                  Support, sales, billing, and enterprise enquiries all reach the same team.
                </p>
                <a
                  href={`mailto:${ORGANISATION.email}`}
                  className="text-accent text-sm font-medium hover:text-accent-ink break-all"
                >
                  {ORGANISATION.email}
                </a>
              </MktCard>

              <MktCard interactive={false}>
                <IconTile icon={Clock} tint="blue" className="mb-4" />
                <h3 className="text-ink font-semibold mb-2">Response time</h3>
                <p className="text-ink-soft text-sm mb-4">
                  We reply within one business day, usually sooner. Billing and refund requests are
                  answered within three business days.
                </p>
                <span className="text-ink-soft text-sm font-medium">Mon–Fri, 10:00–18:00 IST</span>
              </MktCard>
            </div>

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
