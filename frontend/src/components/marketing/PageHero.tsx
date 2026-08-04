import type { ReactNode } from "react"
import { MktContainer, Eyebrow, Reveal } from "./ui"
import { cn } from "@/lib/utils"

// Shared centered hero for every inner marketing page (Features, Pricing, FAQ, etc.)
// — the homepage keeps its own bespoke <MarketingHero>, this is the lighter-weight
// "page header" pattern reused everywhere else.
export function PageHero({
  eyebrow,
  title,
  intro,
  actions,
  children,
  className = "",
}: {
  eyebrow: ReactNode
  title: ReactNode
  intro?: ReactNode
  actions?: ReactNode
  children?: ReactNode
  className?: string
}) {
  return (
    <section className={cn("pt-14 md:pt-20 pb-14 md:pb-16 bg-paper", className)}>
      <MktContainer className="text-center">
        <Reveal className="mx-auto max-w-3xl">
          <Eyebrow className="justify-center">{eyebrow}</Eyebrow>
          <h1 className="mt-5 text-4xl md:text-6xl leading-[1.05] font-bold font-display tracking-tightest text-ink">
            {title}
          </h1>
          {intro && (
            <p className="mt-5 text-lg leading-relaxed text-ink-soft max-w-2xl mx-auto">{intro}</p>
          )}
          {actions && <div className="mt-8 flex flex-wrap items-center justify-center gap-4">{actions}</div>}
        </Reveal>
        {children && <Reveal delay={100} className="mt-12">{children}</Reveal>}
      </MktContainer>
    </section>
  )
}
