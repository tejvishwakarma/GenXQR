import { Link, useParams } from "react-router-dom"
import { ArrowRight, BarChart3, CalendarClock, Lock, Pencil } from "lucide-react"
import { SEOMeta } from "@/components/SEOMeta"
import { PageHero } from "@/components/marketing/PageHero"
import { MktButton, MktCard, MktContainer } from "@/components/marketing/ui"
import { FaqAccordion } from "@/components/marketing/FaqAccordion"
import { GuideSections, faqJsonLd } from "@/components/marketing/GuideContent"
import { QR_TYPE_PAGES, qrTypePage, type QRTypePageContent } from "@/content/qr-type-pages"
import NotFoundPage from "@/pages/marketing/NotFoundPage"

/**
 * /qr-codes/<slug> — one page per dynamic QR type (vCard, PDF, menu…), and the
 * /qr-codes hub that lists them. Content lives in content/qr-type-pages.ts; the
 * page is the same layout for every type. "Create" opens the editor on that
 * type (CreateQRPage reads ?type=), through sign-up for new visitors.
 */

const SITE = "https://genxqr.com"

/** "a vCard", "an Event", "an Image gallery". */
const withArticle = (label: string) => `${/^[aeiou]/i.test(label) ? "an" : "a"} ${label}`

function createHref(page: QRTypePageContent) {
  return `/signup?next=${encodeURIComponent(`/app/create?type=${page.editorKey}`)}`
}

function jsonLd(page: QRTypePageContent) {
  const url = `${SITE}/qr-codes/${page.slug}`
  return [
    {
      "@context": "https://schema.org",
      "@type": "SoftwareApplication",
      "name": `GenXQR ${page.label} QR code generator`,
      "applicationCategory": "BusinessApplication",
      "operatingSystem": "Web",
      "url": url,
      "description": page.description,
      "offers": {
        "@type": "AggregateOffer",
        "priceCurrency": "INR",
        "lowPrice": "299",
        "highPrice": "5999",
        "offerCount": "4",
      },
    },
    faqJsonLd(page.faqs),
    {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      "itemListElement": [
        { "@type": "ListItem", "position": 1, "name": "Home", "item": SITE },
        { "@type": "ListItem", "position": 2, "name": "QR code types", "item": `${SITE}/qr-codes` },
        { "@type": "ListItem", "position": 3, "name": `${page.label} QR code`, "item": url },
      ],
    },
  ]
}

/** What every dynamic code includes — short on purpose, so type pages stay mostly their own. */
const DYNAMIC_EXTRAS = [
  { icon: Pencil, title: "Edit after printing", body: "Change the content any time. The printed code keeps working." },
  { icon: BarChart3, title: "Scan analytics", body: "Every scan with its time, city, device and browser." },
  { icon: Lock, title: "Password and limits", body: "Lock a code, cap its scans, or schedule when it works." },
  { icon: CalendarClock, title: "Free 14-day trial", body: "No credit card. Plans from ₹299 a month after that." },
]

export function QRTypeView({ page }: { page: QRTypePageContent }) {
  const related = page.related.map(qrTypePage).filter((p): p is QRTypePageContent => !!p)
  return (
    <div className="pb-8">
      <SEOMeta title={page.title} description={page.description} url={`/qr-codes/${page.slug}`} jsonLd={jsonLd(page)} />

      <PageHero
        eyebrow={`${page.label} QR code`}
        title={<>{page.h1} <span className="text-accent">{page.accent}</span></>}
        intro={page.intro}
        actions={
          <>
            <MktButton href={createHref(page)} variant="accent" size="lg">
              Create {withArticle(page.label)} QR code <ArrowRight size={18} />
            </MktButton>
            <MktButton href="/pricing" variant="outline" size="lg">See pricing</MktButton>
          </>
        }
      />

      <MktContainer>
        <GuideSections sections={page.sections} />

        <section className="mt-16 max-w-4xl mx-auto">
          <h2 className="text-2xl font-bold text-ink mb-6 text-center">Included with every dynamic QR code</h2>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {DYNAMIC_EXTRAS.map((x) => (
              <MktCard key={x.title} interactive={false} className="p-5">
                <x.icon size={20} className="text-accent" />
                <h3 className="mt-3 text-[15px] font-semibold text-ink">{x.title}</h3>
                <p className="mt-1 text-sm text-ink-soft leading-relaxed">{x.body}</p>
              </MktCard>
            ))}
          </div>
        </section>

        <section className="mt-16 max-w-3xl mx-auto">
          <h2 className="text-2xl font-bold text-ink mb-6">{page.label} QR code questions</h2>
          <FaqAccordion items={page.faqs} />
        </section>

        {related.length > 0 && (
          <section className="mt-16 max-w-3xl mx-auto">
            <h2 className="text-xl font-bold text-ink mb-4">Related QR codes</h2>
            <ul className="grid sm:grid-cols-2 gap-3">
              {related.map((r) => (
                <li key={r.slug}>
                  <Link to={`/qr-codes/${r.slug}`} className="block rounded-xl border border-line bg-paper-pure px-4 py-3 hover:border-accent/40 transition-colors">
                    <span className="font-semibold text-ink">{r.label} QR code</span>
                    <span className="block text-sm text-ink-soft mt-0.5">{r.summary}</span>
                  </Link>
                </li>
              ))}
            </ul>
            <p className="mt-4 text-sm text-ink-soft">
              <Link to="/qr-codes" className="text-accent hover:text-accent-ink underline underline-offset-2">See every QR code type</Link>
              {" "}or{" "}
              <Link to="/generate" className="text-accent hover:text-accent-ink underline underline-offset-2">make a free static code</Link>.
            </p>
          </section>
        )}

        <section className="mt-16 max-w-3xl mx-auto text-center rounded-[24px] border border-line bg-paper-pure px-6 py-10">
          <h2 className="text-2xl md:text-3xl font-bold font-display text-ink">Make your {page.label} QR code</h2>
          <p className="mt-3 text-ink-soft">Free for 14 days on the Pro plan. No credit card needed.</p>
          <div className="mt-6 flex justify-center">
            <MktButton href={createHref(page)} variant="accent" size="lg">
              Start free <ArrowRight size={18} />
            </MktButton>
          </div>
        </section>
      </MktContainer>
    </div>
  )
}

export default function QRTypePage() {
  const { slug } = useParams<{ slug: string }>()
  const page = slug ? qrTypePage(slug) : undefined
  if (!page) return <NotFoundPage />
  return <QRTypeView page={page} />
}

/** /qr-codes — every QR type GenXQR makes, free static ones included. */
export function QRTypesHubPage() {
  const free = [
    { href: "/generate/url", label: "URL / website", summary: "Open any web page" },
    { href: "/generate/wifi", label: "WiFi", summary: "Join a network without typing the password" },
    { href: "/generate/whatsapp", label: "WhatsApp", summary: "Open a chat with your number" },
    { href: "/generate/instagram", label: "Instagram", summary: "Open your profile" },
    { href: "/generate/upi", label: "UPI payment", summary: "Get paid by any UPI app" },
    { href: "/generate/sms", label: "SMS", summary: "A text message, ready to send" },
    { href: "/generate/phone", label: "Phone call", summary: "One tap to call" },
  ]
  return (
    <div className="pb-8">
      <SEOMeta
        title="QR Code Types — vCard, PDF, Menu, Review and More"
        description="Every kind of QR code GenXQR makes: contact cards, PDFs, menus, Google reviews, events, forms, link-in-bio pages, galleries, video, audio, coupons and more."
        url="/qr-codes"
        jsonLd={{
          "@context": "https://schema.org",
          "@type": "CollectionPage",
          "name": "QR code types",
          "url": `${SITE}/qr-codes`,
          "hasPart": QR_TYPE_PAGES.map((p) => ({ "@type": "WebPage", "name": `${p.label} QR code`, "url": `${SITE}/qr-codes/${p.slug}` })),
        }}
      />
      <PageHero
        eyebrow="QR code types"
        title={<>A QR code for <span className="text-accent">everything you print</span></>}
        intro="Pick what should happen when someone scans. Dynamic codes can be changed after printing and show every scan; the free static ones need no account."
      />
      <MktContainer>
        <section className="max-w-5xl mx-auto">
          <h2 className="text-2xl font-bold text-ink mb-2">Dynamic QR codes</h2>
          <p className="text-ink-soft mb-6">Hosted pages and links you can edit after printing, with scan analytics. Free for 14 days.</p>
          <ul className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {QR_TYPE_PAGES.map((p) => (
              <li key={p.slug}>
                <Link to={`/qr-codes/${p.slug}`} className="block h-full rounded-xl border border-line bg-paper-pure px-4 py-4 hover:border-accent/40 transition-colors">
                  <span className="font-semibold text-ink">{p.label} QR code</span>
                  <span className="block text-sm text-ink-soft mt-1">{p.summary}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
        <section className="mt-14 max-w-5xl mx-auto">
          <h2 className="text-2xl font-bold text-ink mb-2">Free static QR codes</h2>
          <p className="text-ink-soft mb-6">The content is stored in the code itself: no account, no expiry, but no editing or tracking.</p>
          <ul className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {free.map((f) => (
              <li key={f.href}>
                <Link to={f.href} className="block h-full rounded-xl border border-line bg-paper-pure px-4 py-4 hover:border-accent/40 transition-colors">
                  <span className="font-semibold text-ink">{f.label} QR code</span>
                  <span className="block text-sm text-ink-soft mt-1">{f.summary}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      </MktContainer>
    </div>
  )
}
