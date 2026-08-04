import { useRef, useState } from "react"
import { MapPin, ArrowRight, Check } from "lucide-react"
import { MktContainer, Eyebrow, MktButton, QrArt } from "./ui"
import { cn } from "@/lib/utils"

const MAX_TILT_DEG = 10

function Chip({ className = "", children, delay = "0s" }: { className?: string; children: React.ReactNode; delay?: string }) {
  return (
    <div
      className={cn(
        "absolute animate-floaty rounded-2xl border border-line bg-paper-pure/95 shadow-card backdrop-blur px-3.5 py-2.5",
        className,
      )}
      style={{ animationDelay: delay }}
    >
      {children}
    </div>
  )
}

export function MarketingHero() {
  const tiltRef = useRef<HTMLDivElement>(null)
  const [hover, setHover] = useState({ active: false, rx: 0, ry: 0 })

  function handleTiltMove(e: React.MouseEvent<HTMLDivElement>) {
    const el = tiltRef.current
    if (!el) return
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return
    const rect = el.getBoundingClientRect()
    const px = (e.clientX - rect.left) / rect.width
    const py = (e.clientY - rect.top) / rect.height
    setHover({
      active: true,
      ry: (px - 0.5) * 2 * MAX_TILT_DEG,
      rx: -(py - 0.5) * 2 * MAX_TILT_DEG,
    })
  }
  function resetTilt() {
    setHover({ active: false, rx: 0, ry: 0 })
  }

  return (
    <section id="mkt-top" className="relative overflow-hidden bg-paper">
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute -top-40 right-[-10%] h-[520px] w-[520px] rounded-full bg-accent/10 blur-3xl" />
        <div className="absolute inset-0 text-ink/[0.04] mkt-qr-grid mkt-mask-fade-b" />
      </div>

      <MktContainer className="grid lg:grid-cols-[1.05fr_0.95fr] gap-12 lg:gap-8 items-center pt-12 pb-20 md:pt-16 md:pb-28">
        {/* Copy — centered on mobile/tablet, left-aligned once the two-column layout kicks in at lg */}
        <div className="animate-rise text-center lg:text-left">
          <Eyebrow>The QR platform for business</Eyebrow>
          <h1 className="mt-5 text-[2.6rem] leading-[1.02] sm:text-6xl sm:leading-[0.98] font-bold font-display tracking-tightest text-ink">
            QR codes that keep working{" "}
            <span className="relative whitespace-nowrap">
              after you print them
              <span className="absolute left-0 -bottom-1 h-[6px] w-full rounded-full bg-accent/25" />
            </span>
            .
          </h1>
          <p className="mt-6 max-w-xl mx-auto lg:mx-0 text-lg leading-relaxed text-ink-soft">
            Create branded static and dynamic QR codes, change the destination anytime, and
            track every scan by location, device, and time — all from one dashboard.
          </p>

          <div className="mt-8 flex flex-col items-center sm:flex-row sm:justify-center lg:justify-start gap-3">
            <MktButton href="/signup" variant="accent" size="lg">
              Create your QR code — free <ArrowRight size={18} />
            </MktButton>
            <MktButton href="#mkt-product" variant="outline" size="lg">
              See how it works
            </MktButton>
          </div>

          <ul className="mt-6 flex flex-wrap items-center justify-center lg:justify-start gap-x-5 gap-y-2 text-sm text-ink-soft">
            {["Free forever plan", "No credit card", "Priced in ₹ and $"].map((t) => (
              <li key={t} className="inline-flex items-center gap-1.5">
                <Check size={15} className="text-live" /> {t}
              </li>
            ))}
          </ul>
        </div>

        {/* Signature visual — tilts toward the cursor */}
        <div className="relative mx-auto w-full max-w-[300px] sm:max-w-[340px]">
          <div className="animate-rise" style={{ animationDelay: "0.12s", perspective: "900px" }}>
            <div
              ref={tiltRef}
              onMouseMove={handleTiltMove}
              onMouseLeave={resetTilt}
              className="relative transition-transform duration-300 ease-out will-change-transform"
              style={{
                transform: `rotateX(${hover.rx}deg) rotateY(${hover.ry}deg) scale(${hover.active ? 1.035 : 1})`,
              }}
            >
              <QrArt
                className={cn(
                  "w-full transition-[filter] duration-300",
                  hover.active
                    ? "drop-shadow-[0_42px_84px_rgba(20,19,26,0.3)]"
                    : "drop-shadow-[0_30px_60px_rgba(20,19,26,0.18)]",
                )}
              />

              <Chip className="-left-4 top-10 sm:-left-8" delay="0.2s">
                <div className="flex items-center gap-2">
                  <span className="relative flex h-2 w-2">
                    <span className="absolute inline-flex h-full w-full rounded-full bg-live/60 animate-ping" />
                    <span className="relative inline-flex h-2 w-2 rounded-full bg-live" />
                  </span>
                  <span className="text-[11px] uppercase tracking-wider text-ink-faint font-mono">Live scan</span>
                </div>
                <div className="mt-1 flex items-center gap-1.5 text-sm font-medium text-ink">
                  <MapPin size={14} className="text-accent" /> Mumbai, IN
                </div>
              </Chip>

              <Chip className="-right-3 top-1/3 sm:-right-6" delay="1.1s">
                <div className="font-mono text-2xl font-semibold text-ink leading-none">1,248</div>
                <div className="text-[11px] text-ink-faint mt-1">scans this week</div>
              </Chip>

              <Chip className="right-6 -bottom-4" delay="2s">
                <div className="flex items-center gap-2 text-sm text-ink">
                  <Check size={15} className="text-live" />
                  <span className="font-medium">Destination updated</span>
                </div>
                <div className="text-[11px] text-ink-faint mt-0.5 font-mono">no reprint needed</div>
              </Chip>
            </div>
          </div>
        </div>
      </MktContainer>
    </section>
  )
}
