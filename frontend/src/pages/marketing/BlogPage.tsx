import { Link } from "react-router-dom"
import { ArrowRight, BookOpenText, Clock3, Tag } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { SEOMeta } from "@/components/SEOMeta"

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
    <div className="pt-16 pb-24 px-4 animate-fade-in">
      <SEOMeta
        title="Blog"
        description="Insights, guides, and product updates from GenXQR on QR strategy, analytics, growth, and engineering."
        url="/blog"
      />

      <div className="max-w-7xl mx-auto">
        <section className="pt-8 text-center mb-12">
          <span className="section-header">
            <BookOpenText size={14} />
            Insights and updates
          </span>
          <h1 className="text-4xl md:text-6xl font-bold text-white mt-6 mb-5">
            GenXQR <span className="gradient-text">Blog</span>
          </h1>
          <p className="text-zinc-400 text-lg max-w-3xl mx-auto">
            Product deep-dives, campaign playbooks, and technical notes to help you create better QR experiences.
          </p>
        </section>

        <section className="mb-12">
          <div className="flex flex-wrap gap-2 justify-center">
            {categories.map((category) => (
              <span
                key={category}
                className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-zinc-800 bg-zinc-900/60 text-zinc-300 text-xs"
              >
                <Tag size={12} className="text-violet-400" />
                {category}
              </span>
            ))}
          </div>
        </section>

        <section className="mb-10">
          <Card className="glass-card border-zinc-800 p-8">
            <CardContent className="p-0">
              <div className="text-violet-400 text-xs font-semibold uppercase tracking-wider mb-3">Featured</div>
              <h2 className="text-2xl md:text-3xl font-bold text-white mb-4">{featuredPost.title}</h2>
              <p className="text-zinc-400 leading-relaxed mb-6 max-w-3xl">{featuredPost.excerpt}</p>
              <div className="flex items-center gap-4 text-zinc-500 text-sm mb-6">
                <span>{featuredPost.date}</span>
                <span className="inline-flex items-center gap-1">
                  <Clock3 size={14} />
                  {featuredPost.readTime}
                </span>
                <span className="text-zinc-300">{featuredPost.category}</span>
              </div>
              <Button variant="glow">
                Read article
                <ArrowRight size={16} />
              </Button>
            </CardContent>
          </Card>
        </section>

        <section className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 mb-16">
          {posts.map((post) => (
            <Card key={post.title} className="p-6 card-hover">
              <CardContent className="p-0 flex flex-col h-full">
                <div className="text-violet-400 text-[11px] font-semibold uppercase tracking-wider mb-2">{post.category}</div>
                <h3 className="text-white font-semibold text-lg mb-3 leading-snug">{post.title}</h3>
                <p className="text-zinc-400 text-sm leading-relaxed mb-5">{post.excerpt}</p>
                <div className="mt-auto flex items-center justify-between text-zinc-500 text-xs pt-4 border-t border-zinc-800">
                  <span>{post.date}</span>
                  <span className="inline-flex items-center gap-1">
                    <Clock3 size={12} />
                    {post.readTime}
                  </span>
                </div>
              </CardContent>
            </Card>
          ))}
        </section>

        <section>
          <div className="glass-card rounded-2xl p-8 md:p-10 border border-zinc-800 text-center">
            <h2 className="text-2xl md:text-4xl font-bold text-white mb-4">Want updates in your inbox?</h2>
            <p className="text-zinc-400 max-w-2xl mx-auto mb-8">
              Follow product releases, design guides, and campaign ideas as we publish new articles.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link to="/signup">
                <Button size="xl" variant="glow">
                  Get started free
                  <ArrowRight size={16} />
                </Button>
              </Link>
              <Link to="/changelog">
                <Button size="xl" variant="secondary">View changelog</Button>
              </Link>
            </div>
          </div>
        </section>
      </div>
    </div>
  )
}
