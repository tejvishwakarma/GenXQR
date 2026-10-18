import { useEffect, useMemo, useState } from "react"
import { Link } from "react-router-dom"
import { ArrowRight, Clock3 } from "lucide-react"
import { SEOMeta } from "@/components/SEOMeta"
import { MktContainer, Reveal, MktButton, Eyebrow, FinderGlyph } from "@/components/marketing/ui"
import { PageHero } from "@/components/marketing/PageHero"
import { type BlogPost, formatPostDate, getPublishedPosts, loadDrafts } from "@/lib/blog"
import { cn } from "@/lib/utils"

function DraftBadge() {
  return (
    <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider text-amber-800">
      Draft — dev only
    </span>
  )
}

export default function BlogPage() {
  // Drafts are listed in local dev only, for review; loadDrafts() is always
  // empty in a production build.
  const [drafts, setDrafts] = useState<BlogPost[]>([])
  useEffect(() => {
    if (import.meta.env.DEV) void loadDrafts().then(setDrafts)
  }, [])

  const posts = useMemo(() => [...getPublishedPosts(), ...drafts], [drafts])
  const categories = useMemo(() => [...new Set(posts.map((p) => p.category))].sort(), [posts])
  const [category, setCategory] = useState<string | null>(null)

  const featured = posts.find((p) => p.featured) ?? posts[0]
  const rest = posts.filter((p) => p !== featured && (category === null || p.category === category))
  const showFeatured = featured && (category === null || featured.category === category)

  return (
    <div>
      <SEOMeta
        title="Blog"
        description="Guides from GenXQR on dynamic QR codes, scan analytics, smart routing and printing QR codes that scan."
        url="/blog"
      />

      <PageHero
        eyebrow="Guides and updates"
        title={<>GenXQR <span className="text-accent">Blog</span></>}
        intro="Practical guides to creating, printing and measuring QR codes."
      />

      {posts.length === 0 ? (
        <section className="pb-24">
          <MktContainer>
            <p className="text-center text-ink-soft">No articles published yet.</p>
          </MktContainer>
        </section>
      ) : (
        <>
          {categories.length > 1 && (
            <section className="pb-4">
              <MktContainer>
                <Reveal className="flex flex-wrap gap-2 justify-center">
                  {[null, ...categories].map((c) => (
                    <button
                      key={c ?? "all"}
                      type="button"
                      onClick={() => setCategory(c)}
                      aria-pressed={category === c}
                      className={cn(
                        "inline-flex items-center gap-2 px-3 py-1.5 rounded-full border text-xs transition",
                        category === c
                          ? "border-accent bg-accent text-white"
                          : "border-line bg-paper-pure text-ink-soft hover:border-ink/30",
                      )}
                    >
                      <FinderGlyph size={11} className={category === c ? "text-white" : "text-accent"} />
                      {c ?? "All"}
                    </button>
                  ))}
                </Reveal>
              </MktContainer>
            </section>
          )}

          {showFeatured && (
            <section className="py-10 md:py-14">
              <MktContainer>
                <Reveal className="rounded-[24px] border border-line bg-paper-pure p-8 md:p-10 shadow-card">
                  <Eyebrow>Featured{featured.draft && <DraftBadge />}</Eyebrow>
                  <h2 className="mt-4 text-2xl md:text-3xl font-bold font-display tracking-tightest text-ink">
                    {featured.title}
                  </h2>
                  <p className="mt-4 max-w-3xl text-[15px] leading-relaxed text-ink-soft">{featured.description}</p>
                  <div className="mt-6 flex flex-wrap items-center gap-4 text-sm text-ink-faint">
                    <span>{formatPostDate(featured.date)}</span>
                    <span className="inline-flex items-center gap-1">
                      <Clock3 size={14} />
                      {featured.readMinutes} min read
                    </span>
                    <span className="text-ink-soft">{featured.category}</span>
                  </div>
                  <MktButton href={`/blog/${featured.slug}`} variant="ink" className="mt-7">
                    Read article
                    <ArrowRight size={16} />
                  </MktButton>
                </Reveal>
              </MktContainer>
            </section>
          )}

          <section className="pb-20 md:pb-28">
            <MktContainer>
              <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
                {rest.map((post, index) => (
                  <Reveal key={post.slug} delay={index * 60}>
                    <Link
                      to={`/blog/${post.slug}`}
                      className="group flex flex-col h-full rounded-2xl border border-line bg-paper-pure p-6 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lift hover:border-ink/10"
                    >
                      <div className="font-mono text-[11px] uppercase tracking-[0.18em] text-accent">
                        {post.category}
                        {post.draft && <DraftBadge />}
                      </div>
                      <h3 className="mt-2.5 text-lg font-semibold font-display text-ink leading-snug group-hover:text-accent transition-colors">
                        {post.title}
                      </h3>
                      <p className="mt-3 text-sm leading-relaxed text-ink-soft">{post.description}</p>
                      <div className="mt-auto pt-5 flex items-center justify-between text-xs text-ink-faint border-t border-line">
                        <span>{formatPostDate(post.date)}</span>
                        <span className="inline-flex items-center gap-1">
                          <Clock3 size={12} />
                          {post.readMinutes} min read
                        </span>
                      </div>
                    </Link>
                  </Reveal>
                ))}
              </div>
            </MktContainer>
          </section>
        </>
      )}

      <section className="pb-24">
        <MktContainer>
          <Reveal className="rounded-[28px] border border-line bg-paper-pure p-8 md:p-12 text-center">
            <h2 className="text-2xl md:text-4xl font-bold font-display tracking-tightest text-ink">
              Put it into practice
            </h2>
            <p className="mt-4 max-w-2xl mx-auto text-ink-soft">
              Make a free static QR code with no account, or create a dynamic one you can edit after printing.
            </p>
            <div className="mt-8 flex flex-col sm:flex-row gap-4 justify-center">
              <MktButton href="/signup" variant="accent" size="lg">
                Get started free
                <ArrowRight size={16} />
              </MktButton>
              <MktButton href="/generate" variant="outline" size="lg">
                Free QR generator
              </MktButton>
            </div>
          </Reveal>
        </MktContainer>
      </section>
    </div>
  )
}
