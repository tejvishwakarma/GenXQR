import { MktContainer, SectionHead } from "./ui"
import { FaqAccordion } from "./FaqAccordion"

export function MarketingFaq({ faqs }: { faqs: { q: string; a: string }[] }) {
  return (
    <section className="py-20 md:py-28 bg-paper-pure border-y border-line">
      <MktContainer className="max-w-3xl">
        <SectionHead eyebrow="Questions" title={<>Frequently asked questions</>} align="center" />
        <div className="mt-10">
          <FaqAccordion items={faqs} />
        </div>
      </MktContainer>
    </section>
  )
}
