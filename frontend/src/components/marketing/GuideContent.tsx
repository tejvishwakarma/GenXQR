import { Link } from "react-router-dom"
import type { GuideBlock, GuideSection } from "@/content/generator-guides"

/**
 * The written guide under a tool (generator types, scanner): headings,
 * paragraphs, steps and lists from a content file. Text may hold internal
 * links written as [text](/path).
 */

/** Renders "[text](/path)" as an internal link; everything else as text. */
export function RichText({ text }: { text: string }) {
  const parts = text.split(/(\[[^\]]+\]\(\/[^)\s]*\))/g)
  return (
    <>
      {parts.map((part, i) => {
        const m = /^\[([^\]]+)\]\((\/[^)\s]*)\)$/.exec(part)
        return m ? (
          <Link key={i} to={m[2]} className="text-accent hover:text-accent-ink underline underline-offset-2">{m[1]}</Link>
        ) : (
          <span key={i}>{part}</span>
        )
      })}
    </>
  )
}

function GuideBlockView({ block }: { block: GuideBlock }) {
  if (typeof block === "string") return <p className="text-ink-soft leading-relaxed"><RichText text={block} /></p>
  if ("steps" in block) {
    return (
      <ol className="list-decimal pl-5 space-y-2 text-ink-soft leading-relaxed marker:text-accent marker:font-semibold">
        {block.steps.map((t) => <li key={t} className="pl-1"><RichText text={t} /></li>)}
      </ol>
    )
  }
  return (
    <ul className="list-disc pl-5 space-y-2 text-ink-soft leading-relaxed marker:text-accent">
      {block.list.map((t) => <li key={t} className="pl-1"><RichText text={t} /></li>)}
    </ul>
  )
}

export function GuideSections({ sections, className = "" }: { sections: GuideSection[]; className?: string }) {
  return (
    <section className={`max-w-3xl mx-auto space-y-12 ${className}`}>
      {sections.map((section) => (
        <div key={section.heading}>
          <h2 className="text-2xl font-bold text-ink mb-4">{section.heading}</h2>
          <div className="space-y-4 text-[15px]">
            {section.blocks.map((block, i) => <GuideBlockView key={i} block={block} />)}
          </div>
        </div>
      ))}
    </section>
  )
}

/** FAQPage structured data from the same questions the page shows. */
export function faqJsonLd(faqs: { q: string; a: string }[]) {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    "mainEntity": faqs.map((f) => ({ "@type": "Question", "name": f.q, "acceptedAnswer": { "@type": "Answer", "text": f.a } })),
  }
}
