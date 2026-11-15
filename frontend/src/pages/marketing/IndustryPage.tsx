import { Link, useParams } from "react-router-dom"
import { ArrowRight } from "lucide-react"
import { SEOMeta } from "@/components/SEOMeta"
import { PageHero } from "@/components/marketing/PageHero"
import { MktButton, MktContainer } from "@/components/marketing/ui"
import { FaqAccordion } from "@/components/marketing/FaqAccordion"
import { GuideSections, faqJsonLd } from "@/components/marketing/GuideContent"
import { INDUSTRY_PAGES, industryPage, type IndustryPageContent } from "@/content/industry-pages"
import NotFoundPage from "@/pages/marketing/NotFoundPage"

/**
 * /use-cases/<slug> — one page per industry (content/industry-pages.ts): the
 * QR codes that business needs, linked to their type pages, then a guide and
 * FAQs. /use-cases itself (UseCasesPage) links each industry card here.
 */

const SITE = "https://genxqr.com"

function jsonLd(page: IndustryPageContent) {
  const url = `${SITE}/use-cases/${page.slug}`
  return [
    {
      "@context": "https://schema.org",
      "@type": "WebPage",
      "name": page.title,
      "url": url,
      "description": page.description,
      "about": { "@type": "Thing", "name": `QR codes for ${page.label.toLowerCase()}` },
    },
    faqJsonLd(page.faqs),
    {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      "itemListElement": [
        { "@type": "ListItem", "position": 1, "name": "Home", "item": SITE },
        { "@type": "ListItem", "position": 2, "name": "Use cases", "item": `${SITE}/use-cases` },
        { "@type": "ListItem", "position": 3, "name": page.label, "item": url },
      ],
    },
  ]
}

export function IndustryView({ page }: { page: IndustryPageContent }) {
  const others = INDUSTRY_PAGES.filter((p) => p.slug !== page.slug)
  return (
    <div className="pb-8">
      <SEOMeta title={page.title} description={page.description} url={`/use-cases/${page.slug}`} jsonLd={jsonLd(page)} />

      <PageHero
        eyebrow={page.label}
        title={<>{page.h1} <span className="text-accent">{page.accent}</span></>}
        intro={page.intro}
        actions={
          <>
            <MktButton href="/signup" variant="accent" size="lg">Start free for 14 days <ArrowRight size={18} /></MktButton>
            <MktButton href="/generate" variant="outline" size="lg">Free QR generator</MktButton>
          </>
        }
      />

      <MktContainer>
        <section className="max-w-5xl mx-auto">
          <h2 className="text-2xl font-bold text-ink mb-6">QR codes for {page.label.toLowerCase()}</h2>
          <ul className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {page.codes.map((c) => (
              <li key={c.href}>
                <Link to={c.href} className="block h-full rounded-xl border border-line bg-paper-pure px-4 py-4 hover:border-accent/40 transition-colors">
                  <span className="font-semibold text-ink">{c.label} QR code</span>
                  <span className="block text-sm text-ink-soft mt-1 leading-relaxed">{c.why}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>

        <GuideSections sections={page.sections} className="mt-16" />

        <section className="mt-16 max-w-3xl mx-auto">
          <h2 className="text-2xl font-bold text-ink mb-6">Questions</h2>
          <FaqAccordion items={page.faqs} />
        </section>

        <section className="mt-16 max-w-3xl mx-auto">
          <h2 className="text-xl font-bold text-ink mb-4">Other industries</h2>
          <ul className="flex flex-wrap gap-2">
            {others.map((o) => (
              <li key={o.slug}>
                <Link to={`/use-cases/${o.slug}`} className="inline-block rounded-full border border-line bg-paper-pure px-3.5 py-1.5 text-sm text-ink hover:border-accent/40 transition-colors">
                  {o.label}
                </Link>
              </li>
            ))}
          </ul>
        </section>

        <section className="mt-16 max-w-3xl mx-auto text-center rounded-[24px] border border-line bg-paper-pure px-6 py-10">
          <h2 className="text-2xl md:text-3xl font-bold font-display text-ink">Try every QR code type free</h2>
          <p className="mt-3 text-ink-soft">14 days on the Pro plan, no credit card. Plans from ₹299 a month after that.</p>
          <div className="mt-6 flex justify-center">
            <MktButton href="/signup" variant="accent" size="lg">Start free <ArrowRight size={18} /></MktButton>
          </div>
        </section>
      </MktContainer>
    </div>
  )
}

export default function IndustryPage() {
  const { slug } = useParams<{ slug: string }>()
  const page = slug ? industryPage(slug) : undefined
  if (!page) return <NotFoundPage />
  return <IndustryView page={page} />
}
