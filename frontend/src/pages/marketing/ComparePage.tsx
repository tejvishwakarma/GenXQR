import { Link, useParams } from "react-router-dom"
import { ArrowRight } from "lucide-react"
import { SEOMeta } from "@/components/SEOMeta"
import { PageHero } from "@/components/marketing/PageHero"
import { MktButton, MktContainer } from "@/components/marketing/ui"
import { FaqAccordion } from "@/components/marketing/FaqAccordion"
import { GuideSections, RichText, faqJsonLd } from "@/components/marketing/GuideContent"
import { COMPARE_PAGES, COMPARED_ON, comparePage, type ComparePageContent } from "@/content/compare-pages"
import NotFoundPage from "@/pages/marketing/NotFoundPage"

/**
 * /compare/<slug> — GenXQR next to one competitor (content/compare-pages.ts),
 * and the /compare hub. Every competitor fact on these pages comes from that
 * competitor's own site on the date shown, with the source linked, and each
 * page says plainly where the competitor is the better choice.
 */

const SITE = "https://genxqr.com"

function jsonLd(page: ComparePageContent) {
  const url = `${SITE}/compare/${page.slug}`
  return [
    { "@context": "https://schema.org", "@type": "WebPage", "name": page.title, "url": url, "description": page.description, "dateModified": COMPARED_ON },
    faqJsonLd(page.faqs),
    {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      "itemListElement": [
        { "@type": "ListItem", "position": 1, "name": "Home", "item": SITE },
        { "@type": "ListItem", "position": 2, "name": "Compare", "item": `${SITE}/compare` },
        { "@type": "ListItem", "position": 3, "name": `GenXQR vs ${page.competitor}`, "item": url },
      ],
    },
  ]
}

const checkedOn = new Date(`${COMPARED_ON}T00:00:00Z`).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" })

export function CompareView({ page }: { page: ComparePageContent }) {
  return (
    <div className="pb-8">
      <SEOMeta title={page.title} description={page.description} url={`/compare/${page.slug}`} jsonLd={jsonLd(page)} />
      <PageHero
        eyebrow={`GenXQR vs ${page.competitor}`}
        title={<>{page.h1} <span className="text-accent">{page.accent}</span></>}
        intro={page.intro}
        actions={
          <>
            <MktButton href="/signup" variant="accent" size="lg">Try GenXQR free for 14 days <ArrowRight size={18} /></MktButton>
            <MktButton href="/pricing" variant="outline" size="lg">GenXQR pricing</MktButton>
          </>
        }
      />

      <MktContainer>
        <section className="max-w-4xl mx-auto">
          <h2 className="text-2xl font-bold text-ink mb-2">Side by side</h2>
          <p className="text-sm text-ink-soft mb-5">
            {page.competitor} facts are from {page.competitor}'s own website, checked on {checkedOn}. Prices and plans change, so check the
            sources below before you decide.
          </p>
          <div className="overflow-x-auto rounded-xl border border-line">
            <table className="w-full min-w-[560px] text-sm">
              <thead className="bg-paper text-left">
                <tr>
                  <th scope="col" className="px-4 py-3 font-semibold text-ink w-[28%]"></th>
                  <th scope="col" className="px-4 py-3 font-semibold text-accent">GenXQR</th>
                  <th scope="col" className="px-4 py-3 font-semibold text-ink">{page.competitor}</th>
                </tr>
              </thead>
              <tbody>
                {page.rows.map((r) => (
                  <tr key={r.feature} className="border-t border-line align-top">
                    <th scope="row" className="px-4 py-3 text-left font-medium text-ink">{r.feature}</th>
                    <td className="px-4 py-3 text-ink-soft">{r.genxqr}</td>
                    <td className="px-4 py-3 text-ink-soft">{r.them}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <GuideSections sections={page.sections} className="mt-16" />

        <section className="mt-16 max-w-3xl mx-auto">
          <h2 className="text-2xl font-bold text-ink mb-6">Questions</h2>
          <FaqAccordion items={page.faqs} />
        </section>

        <section className="mt-12 max-w-3xl mx-auto">
          <h2 className="text-base font-semibold text-ink mb-2">Sources (checked {checkedOn})</h2>
          <ul className="list-disc pl-5 space-y-1 text-sm text-ink-soft break-all">
            {page.sources.map((s) => (
              <li key={s}><a href={s} target="_blank" rel="noopener noreferrer nofollow" className="underline underline-offset-2 hover:text-accent">{s}</a></li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-ink-faint">
            {page.competitor} is a trademark of its owner. GenXQR is not affiliated with {page.competitor}. Spotted something out of date? <RichText text="Tell us on the [contact page](/contact)." />
          </p>
        </section>

        <section className="mt-12 max-w-3xl mx-auto">
          <h2 className="text-xl font-bold text-ink mb-4">More comparisons</h2>
          <ul className="flex flex-wrap gap-2">
            {COMPARE_PAGES.filter((p) => p.slug !== page.slug).map((p) => (
              <li key={p.slug}>
                <Link to={`/compare/${p.slug}`} className="inline-block rounded-full border border-line bg-paper-pure px-3.5 py-1.5 text-sm text-ink hover:border-accent/40 transition-colors">
                  GenXQR vs {p.competitor}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      </MktContainer>
    </div>
  )
}

export default function ComparePage() {
  const { slug } = useParams<{ slug: string }>()
  const page = slug ? comparePage(slug) : undefined
  if (!page) return <NotFoundPage />
  return <CompareView page={page} />
}

export function CompareHubPage() {
  return (
    <div className="pb-8">
      <SEOMeta
        title="GenXQR Compared — QR TIGER, Uniqode and More"
        description="How GenXQR compares with other QR code generators on price, plans and features, with each competitor's facts taken from its own website."
        url="/compare"
      />
      <PageHero
        eyebrow="Compare"
        title={<>GenXQR compared <span className="text-accent">with other QR code generators</span></>}
        intro="Straight comparisons: prices, limits and features from each company's own website, and where another tool may suit you better."
      />
      <MktContainer>
        <ul className="max-w-3xl mx-auto grid sm:grid-cols-2 gap-3">
          {COMPARE_PAGES.map((p) => (
            <li key={p.slug}>
              <Link to={`/compare/${p.slug}`} className="block h-full rounded-xl border border-line bg-paper-pure px-4 py-4 hover:border-accent/40 transition-colors">
                <span className="font-semibold text-ink">GenXQR vs {p.competitor}</span>
                <span className="block text-sm text-ink-soft mt-1">{p.summary}</span>
              </Link>
            </li>
          ))}
        </ul>
      </MktContainer>
    </div>
  )
}
