import type { ComponentType, ReactNode } from "react"
import { MktContainer, Reveal, IconTile, type IconTint } from "./ui"

// Shared layout for the four legal/compliance pages (Privacy, Terms, Cookie,
// GDPR) — they all follow the same hero + optional stat row + prose-sections
// shape, so the shell is written once here instead of four times.

export function LegalHero({
  icon,
  eyebrow = "Legal",
  title,
  subtitle,
}: {
  icon: ComponentType<{ size?: number; className?: string }>
  eyebrow?: string
  title: ReactNode
  subtitle?: ReactNode
}) {
  const Icon = icon
  return (
    <section className="pt-20 md:pt-24 pb-10 bg-paper">
      <MktContainer className="max-w-3xl">
        <Reveal>
          <span className="inline-flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.18em] text-ink-faint">
            <Icon size={13} className="text-accent" />
            {eyebrow}
          </span>
          <h1 className="mt-5 text-4xl md:text-5xl font-bold font-display tracking-tightest leading-[1.1] text-ink">
            {title}
          </h1>
          {subtitle && <p className="mt-4 text-base text-ink-soft">{subtitle}</p>}
        </Reveal>
      </MktContainer>
    </section>
  )
}

export function LegalStats({
  items,
}: {
  items: { icon: ComponentType<{ size?: number; className?: string }>; tint: IconTint; label: string; sub: string }[]
}) {
  return (
    <Reveal className="grid sm:grid-cols-3 gap-4 mb-10">
      {items.map((it) => (
        <div key={it.label} className="rounded-2xl border border-line bg-paper-pure p-6 text-center">
          <IconTile icon={it.icon} tint={it.tint} className="mx-auto mb-3" />
          <h3 className="text-ink font-semibold text-sm">{it.label}</h3>
          <p className="text-xs text-ink-faint mt-1">{it.sub}</p>
        </div>
      ))}
    </Reveal>
  )
}

export function LegalCard({ children }: { children: ReactNode }) {
  return (
    <Reveal delay={100} className="rounded-[28px] border border-line bg-paper-pure p-8 md:p-12 space-y-10">
      {children}
    </Reveal>
  )
}

export function LegalSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="space-y-3">
      <h2 className="text-xl font-bold font-display text-ink">{title}</h2>
      <div className="text-ink-soft leading-relaxed text-sm md:text-base space-y-2">{children}</div>
    </div>
  )
}

export function LegalPage({ children }: { children: ReactNode }) {
  return (
    <div className="bg-paper">
      {children}
      <div className="h-20 md:h-24" />
    </div>
  )
}

export function LegalBody({ children }: { children: ReactNode }) {
  return <MktContainer className="max-w-3xl pb-4">{children}</MktContainer>
}
