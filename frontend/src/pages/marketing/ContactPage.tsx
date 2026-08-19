import { useState } from "react"
import { useMutation } from "@tanstack/react-query"
import { MapPin, Mail, Clock, Loader2, CheckCircle2 } from "lucide-react"
import { SEOMeta } from "@/components/SEOMeta"
import { MktContainer, Reveal, MktCard, IconTile, MktButton } from "@/components/marketing/ui"
import { PageHero } from "@/components/marketing/PageHero"
import { ORGANISATION } from "@/lib/site"
import { sendContactMessage, type ContactCategory } from "@/lib/api"

/** Mirrors the server's category enum; the label is what the visitor picks. */
const SUBJECTS: { value: ContactCategory; label: string }[] = [
  { value: "general",   label: "General Inquiry" },
  { value: "sales",     label: "Sales & Enterprise" },
  { value: "technical", label: "Technical Support" },
  { value: "billing",   label: "Billing Question" },
]

const MIN_MESSAGE = 20
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export default function ContactPage() {
  const [firstName, setFirstName] = useState("")
  const [lastName, setLastName] = useState("")
  const [email, setEmail] = useState("")
  const [category, setCategory] = useState<ContactCategory>("general")
  const [message, setMessage] = useState("")
  const [company, setCompany] = useState("")
  const [error, setError] = useState("")

  /**
   * Wraps a field setter so typing dismisses a previous success banner. Without
   * this the confirmation from the last message would sit above a half-written new
   * one, reading as though that one had already been sent.
   */
  const edit = <T,>(setter: (value: T) => void) => (value: T) => {
    if (send.isSuccess) send.reset()
    setter(value)
  }

  const send = useMutation({
    mutationFn: () => sendContactMessage({ firstName, lastName, email, category, message, company }),
    onSuccess: () => {
      setError("")
      setFirstName("")
      setLastName("")
      setEmail("")
      setCategory("general")
      setMessage("")
      setCompany("")
    },
    onError: (err: Error) => setError(err.message || "Could not send your message. Please try again."),
  })

  // Validated here as well as on the server, so the visitor hears about a problem
  // without waiting for a round trip. The server stays the authority.
  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (send.isPending) return
    if (!firstName.trim()) {
      setError("Please enter your first name.")
      return
    }
    if (!EMAIL_RE.test(email.trim())) {
      setError("Please enter a valid email address.")
      return
    }
    if (message.trim().length < MIN_MESSAGE) {
      setError("Please provide a little more detail (at least " + MIN_MESSAGE + " characters).")
      return
    }
    setError("")
    send.mutate()
  }

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

              <form className="space-y-5" onSubmit={onSubmit} noValidate>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm font-medium text-ink-soft mb-1.5 block">First Name</label>
                    <input
                      type="text"
                      name="firstName"
                      value={firstName}
                      onChange={(e) => edit(setFirstName)(e.target.value)}
                      autoComplete="given-name"
                      placeholder="John"
                      className="w-full rounded-xl border border-line bg-paper-pure px-4 py-2.5 text-sm text-ink placeholder:text-ink-faint focus:outline-none focus:ring-2 focus:ring-accent/40 focus:border-accent transition-colors"
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium text-ink-soft mb-1.5 block">Last Name</label>
                    <input
                      type="text"
                      name="lastName"
                      value={lastName}
                      onChange={(e) => edit(setLastName)(e.target.value)}
                      autoComplete="family-name"
                      placeholder="Doe"
                      className="w-full rounded-xl border border-line bg-paper-pure px-4 py-2.5 text-sm text-ink placeholder:text-ink-faint focus:outline-none focus:ring-2 focus:ring-accent/40 focus:border-accent transition-colors"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-sm font-medium text-ink-soft mb-1.5 block">Work Email</label>
                  <input
                    type="email"
                    name="email"
                    value={email}
                    onChange={(e) => edit(setEmail)(e.target.value)}
                    autoComplete="email"
                    placeholder="john@company.com"
                    className="w-full rounded-xl border border-line bg-paper-pure px-4 py-2.5 text-sm text-ink placeholder:text-ink-faint focus:outline-none focus:ring-2 focus:ring-accent/40 focus:border-accent transition-colors"
                  />
                </div>

                <div>
                  <label className="text-sm font-medium text-ink-soft mb-1.5 block">Subject</label>
                  <select
                    name="category"
                    value={category}
                    onChange={(e) => edit(setCategory)(e.target.value as ContactCategory)}
                    className="w-full rounded-xl border border-line bg-paper-pure px-4 py-2.5 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-accent/40 focus:border-accent transition-colors appearance-none"
                  >
                    {SUBJECTS.map((subject) => (
                      <option key={subject.value} value={subject.value}>{subject.label}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-sm font-medium text-ink-soft mb-1.5 block">Message</label>
                  <textarea
                    className="w-full rounded-xl border border-line bg-paper-pure px-4 py-3 text-sm text-ink placeholder:text-ink-faint focus:outline-none focus:ring-2 focus:ring-accent/40 focus:border-accent transition-colors resize-none h-32"
                    name="message"
                    value={message}
                    onChange={(e) => edit(setMessage)(e.target.value)}
                    placeholder="How can we help you?"
                  ></textarea>
                </div>

                {/* Honeypot. Positioned off-screen rather than display:none, because
                    some bots skip hidden inputs but fill anything they can "see". */}
                <div aria-hidden="true" className="absolute left-[-9999px] top-auto h-0 w-0 overflow-hidden">
                  <label htmlFor="contact-company">Company</label>
                  <input
                    id="contact-company"
                    type="text"
                    name="company"
                    tabIndex={-1}
                    autoComplete="off"
                    value={company}
                    onChange={(e) => setCompany(e.target.value)}
                  />
                </div>

                {error && (
                  <p role="alert" className="text-sm text-red-600 dark:text-red-400">{error}</p>
                )}

                {send.isSuccess && (
                  <div className="flex items-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-700 dark:text-emerald-300">
                    <CheckCircle2 size={16} className="shrink-0" />
                    <span>Thanks — your message is on its way. We&apos;ll reply by email.</span>
                  </div>
                )}

                <MktButton variant="accent" size="lg" className="w-full" type="submit" disabled={send.isPending}>
                  {send.isPending ? (
                    <>
                      <Loader2 size={16} className="animate-spin" /> Sending&hellip;
                    </>
                  ) : (
                    "Send Message"
                  )}
                </MktButton>
              </form>
            </MktCard>
          </Reveal>
        </div>
      </MktContainer>
    </div>
  )
}
