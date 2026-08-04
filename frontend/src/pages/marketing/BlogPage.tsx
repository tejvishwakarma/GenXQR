import { ArrowRight, Clock3 } from "lucide-react"
import { SEOMeta } from "@/components/SEOMeta"
import { MktContainer, Reveal, MktButton, Eyebrow, FinderGlyph } from "@/components/marketing/ui"
import { PageHero } from "@/components/marketing/PageHero"

const categories = ["All", "Product", "Analytics", "Growth", "Engineering", "Security"]

const featuredPost = {
  title: "How to turn QR scans into growth decisions",
  excerpt:
    "A practical framework for reading scan trends, segmenting by device and geography, and improving campaign conversion with faster iteration loops.",
  date: "March 16, 2026",
  readTime: "8 min read",
  category: "Analytics",
}

const posts = [
  {
    title: "Dynamic QR codes vs static QR codes: what changes operationally",
    excerpt: "Understand when to use each type and how dynamic QR workflows reduce reprint costs.",
    date: "March 14, 2026",
    readTime: "6 min read",
    category: "Product",
  },
  {
    title: "Using smart routing for location-aware campaigns",
    excerpt: "Serve localized destinations by geography, device, and time windows with measurable outcomes.",
    date: "March 11, 2026",
    readTime: "7 min read",
    category: "Growth",
  },
  {
    title: "Designing QR experiences that scan more reliably",
    excerpt: "Best practices for color contrast, size, placement, and print surfaces across environments.",
    date: "March 8, 2026",
    readTime: "5 min read",
    category: "Product",
  },
  {
    title: "Security checklist for enterprise QR deployments",
    excerpt: "A concise checklist covering auth, content controls, abuse protection, and audit readiness.",
    date: "March 5, 2026",
    readTime: "9 min read",
    category: "Security",
  },
  {
    title: "From campaign launch to post-scan analysis in one dashboard",
    excerpt: "How teams close the loop between creation, distribution, and performance review faster.",
    date: "March 2, 2026",
    readTime: "6 min read",
    category: "Analytics",
  },
  {
    title: "Building resilient scan pipelines in high-volume scenarios",
    excerpt: "Notes on queue-backed ingestion, deduplication strategy, and keeping analytics consistent.",
    date: "February 28, 2026",
    readTime: "10 min read",
    category: "Engineering",
  },
]

export default function BlogPage() {
  return (
    <div>
      <SEOMeta
        title="Blog"
        description="Insights, guides, and product updates from GenXQR on QR strategy, analytics, growth, and engineering."
        url="/blog"
      />

      <PageHero
        eyebrow="Insights and updates"
        title={<>GenXQR <span className="text-accent">Blog</span></>}
        intro="Product deep-dives, campaign playbooks, and technical notes to help you create better QR experiences."
      />

      <section className="pb-4">
        <MktContainer>
          <Reveal className="flex flex-wrap gap-2 justify-center">
            {categories.map((category) => (
              <span
                key={category}
                className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-line bg-paper-pure text-ink-soft text-xs"
              >
                <FinderGlyph size={11} className="text-accent" />
                {category}
              </span>
            ))}
          </Reveal>
        </MktContainer>
      </section>

      <section className="py-10 md:py-14">
        <MktContainer>
          <Reveal className="rounded-[24px] border border-line bg-paper-pure p-8 md:p-10 shadow-card">
            <Eyebrow>Featured</Eyebrow>
            <h2 className="mt-4 text-2xl md:text-3xl font-bold font-display tracking-tightest text-ink">
              {featuredPost.title}
            </h2>
            <p className="mt-4 max-w-3xl text-[15px] leading-relaxed text-ink-soft">{featuredPost.excerpt}</p>
            <div className="mt-6 flex flex-wrap items-center gap-4 text-sm text-ink-faint">
              <span>{featuredPost.date}</span>
              <span className="inline-flex items-center gap-1">
                <Clock3 size={14} />
                {featuredPost.readTime}
              </span>
              <span className="text-ink-soft">{featuredPost.category}</span>
            </div>
            <MktButton href="#" variant="ink" className="mt-7">
              Read article
              <ArrowRight size={16} />
            </MktButton>
          </Reveal>
        </MktContainer>
      </section>

      <section className="pb-20 md:pb-28">
        <MktContainer>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {posts.map((post, index) => (
              <Reveal key={post.title} delay={index * 60}>
                <div className="group flex flex-col h-full rounded-2xl border border-line bg-paper-pure p-6 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lift hover:border-ink/10">
                  <div className="font-mono text-[11px] uppercase tracking-[0.18em] text-accent">{post.category}</div>
                  <h3 className="mt-2.5 text-lg font-semibold font-display text-ink leading-snug">{post.title}</h3>
                  <p className="mt-3 text-sm leading-relaxed text-ink-soft">{post.excerpt}</p>
                  <div className="mt-auto pt-5 flex items-center justify-between text-xs text-ink-faint border-t border-line">
                    <span>{post.date}</span>
                    <span className="inline-flex items-center gap-1">
                      <Clock3 size={12} />
                      {post.readTime}
                    </span>
                  </div>
                </div>
              </Reveal>
            ))}
          </div>
        </MktContainer>
      </section>

      <section className="pb-24">
        <MktContainer>
          <Reveal className="rounded-[28px] border border-line bg-paper-pure p-8 md:p-12 text-center">
            <h2 className="text-2xl md:text-4xl font-bold font-display tracking-tightest text-ink">
              Want updates in your inbox?
            </h2>
            <p className="mt-4 max-w-2xl mx-auto text-ink-soft">
              Follow product releases, design guides, and campaign ideas as we publish new articles.
            </p>
            <div className="mt-8 flex flex-col sm:flex-row gap-4 justify-center">
              <MktButton href="/signup" variant="accent" size="lg">
                Get started free
                <ArrowRight size={16} />
              </MktButton>
              <MktButton href="/changelog" variant="outline" size="lg">
                View changelog
              </MktButton>
            </div>
          </Reveal>
        </MktContainer>
      </section>
    </div>
  )
}
