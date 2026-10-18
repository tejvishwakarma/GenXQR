import { useEffect, useState } from "react"
import { Link, Navigate, useParams } from "react-router-dom"
import { ArrowLeft, ArrowRight, Clock3 } from "lucide-react"
import { SEOMeta } from "@/components/SEOMeta"
import { MktContainer, MktButton, Eyebrow } from "@/components/marketing/ui"
import { type BlogPost, formatPostDate, getPublishedPost, loadDrafts } from "@/lib/blog"
import { blogPostingSchema, breadcrumbSchema } from "@/lib/schema"

export default function BlogPostPage() {
  const { slug = "" } = useParams()
  const live = getPublishedPost(slug)

  // Dev only: drafts open at the same URL for review. In production the draft
  // list is always empty, so an unknown slug goes straight back to /blog.
  const [draft, setDraft] = useState<BlogPost | null | undefined>(
    live || !import.meta.env.DEV ? null : undefined,
  )
  useEffect(() => {
    if (live || !import.meta.env.DEV) return
    void loadDrafts().then((all) => setDraft(all.find((p) => p.slug === slug) ?? null))
  }, [live, slug])

  const post = live ?? draft
  if (draft === undefined) return null // dev: draft still loading
  if (!post) return <Navigate to="/blog" replace />

  const path = `/blog/${post.slug}`

  return (
    <article>
      <SEOMeta
        title={post.title}
        description={post.description}
        url={path}
        type="article"
        noIndex={post.draft}
        publishedTime={post.date ?? undefined}
        jsonLd={
          post.date
            ? [
                blogPostingSchema({ headline: post.title, description: post.description, path, datePublished: post.date }),
                breadcrumbSchema([
                  { name: "Blog", path: "/blog" },
                  { name: post.title, path },
                ]),
              ]
            : undefined
        }
      />

      <MktContainer className="max-w-3xl pt-14 md:pt-20 pb-20">
        {post.draft && (
          <div className="mb-8 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            Draft for review. This page only exists in local development and is not published.
          </div>
        )}

        <Link to="/blog" className="inline-flex items-center gap-1.5 text-sm text-ink-soft hover:text-ink transition">
          <ArrowLeft size={14} />
          All articles
        </Link>

        <Eyebrow className="mt-8">{post.category}</Eyebrow>
        <h1 className="mt-4 text-3xl md:text-[44px] md:leading-[1.1] font-bold font-display tracking-tightest text-ink">
          {post.title}
        </h1>
        <p className="mt-5 text-lg leading-relaxed text-ink-soft">{post.description}</p>
        <div className="mt-6 flex flex-wrap items-center gap-4 text-sm text-ink-faint border-b border-line pb-8">
          {post.date ? <time dateTime={post.date}>{formatPostDate(post.date)}</time> : <span>Unpublished draft</span>}
          <span className="inline-flex items-center gap-1">
            <Clock3 size={14} />
            {post.readMinutes} min read
          </span>
        </div>

        {/* First-party content from src/content/blog, rendered at build time. */}
        <div className="blog-prose mt-10" dangerouslySetInnerHTML={{ __html: post.html }} />

        <div className="mt-16 rounded-[24px] border border-line bg-paper-pure p-8 text-center">
          <h2 className="text-xl md:text-2xl font-bold font-display tracking-tightest text-ink">
            Try it with your own QR code
          </h2>
          <p className="mt-3 text-ink-soft">
            Static QR codes are free with no account. Dynamic codes you can edit after printing start at ₹299 a month.
          </p>
          <div className="mt-6 flex flex-col sm:flex-row gap-3 justify-center">
            <MktButton href="/signup" variant="accent">
              Create a dynamic QR
              <ArrowRight size={16} />
            </MktButton>
            <MktButton href="/generate" variant="outline">
              Free QR generator
            </MktButton>
          </div>
        </div>
      </MktContainer>
    </article>
  )
}
