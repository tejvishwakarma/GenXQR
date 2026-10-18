/**
 * Blog content, loaded from Markdown files at build time.
 *
 *   src/content/blog/published/<slug>.md   live: listed, routed, prerendered, in the sitemap
 *   src/content/blog/drafts/<slug>.md      local dev only — never in a production build
 *
 * Posts are files in the repo, not database rows, because the prerender step
 * (scripts/prerender.mjs) renders pages without fetching anything: a post that
 * only exists behind an API call would be an empty page to Google.
 *
 * The folder IS the publish state, and scripts/public-routes.mjs reads the same
 * folder for the sitemap and prerender list, so a post cannot be live without
 * being indexable or the other way round. See src/content/blog/README.md.
 */
import { marked } from "marked"

export interface BlogPost {
  slug: string
  title: string
  /** Meta description and listing excerpt. */
  description: string
  category: string
  /** YYYY-MM-DD; null only for a draft not yet given one. */
  date: string | null
  featured: boolean
  draft: boolean
  readMinutes: number
  html: string
}

const published = import.meta.glob("../content/blog/published/*.md", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>

// Lazy, and inside a DEV-only branch: in a production build this whole
// expression is dead code, so no draft text reaches the shipped bundle (an eager
// import would put unpublished articles in a public JS file).
const draftLoaders = import.meta.env.DEV
  ? (import.meta.glob("../content/blog/drafts/*.md", { query: "?raw", import: "default" }) as Record<
      string,
      () => Promise<string>
    >)
  : {}

/** Splits a `---` frontmatter block of `key: value` lines from the body. */
function parseFrontmatter(raw: string): { data: Record<string, string>; body: string } {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(raw)
  if (!match) return { data: {}, body: raw }
  const data: Record<string, string> = {}
  for (const line of match[1].split(/\r?\n/)) {
    const idx = line.indexOf(":")
    if (idx > 0) data[line.slice(0, idx).trim()] = line.slice(idx + 1).trim().replace(/^"(.*)"$/, "$1")
  }
  return { data, body: raw.slice(match[0].length) }
}

const WORDS_PER_MINUTE = 220

function toPost(path: string, raw: string, draft: boolean): BlogPost {
  const slug = path.split("/").pop()!.replace(/\.md$/, "")
  const { data, body } = parseFrontmatter(raw)
  if (!data.title || !data.description || !data.category) {
    throw new Error(`Blog post "${slug}" is missing title, description or category in its frontmatter.`)
  }
  if (!draft && !/^\d{4}-\d{2}-\d{2}$/.test(data.date ?? "")) {
    throw new Error(`Published blog post "${slug}" needs a date (YYYY-MM-DD) in its frontmatter.`)
  }
  const words = body.trim().split(/\s+/).filter(Boolean).length
  return {
    slug,
    title: data.title,
    description: data.description,
    category: data.category,
    date: /^\d{4}-\d{2}-\d{2}$/.test(data.date ?? "") ? data.date! : null,
    featured: data.featured === "true",
    draft,
    readMinutes: Math.max(1, Math.round(words / WORDS_PER_MINUTE)),
    html: marked.parse(body, { async: false }) as string,
  }
}

function byNewest(a: BlogPost, b: BlogPost): number {
  return (b.date ?? "9999").localeCompare(a.date ?? "9999")
}

const publishedPosts: BlogPost[] = Object.entries(published)
  .map(([path, raw]) => toPost(path, raw, false))
  .sort(byNewest)

/** Live posts, newest first. What production lists, routes and prerenders. */
export function getPublishedPosts(): BlogPost[] {
  return publishedPosts
}

export function getPublishedPost(slug: string): BlogPost | undefined {
  return publishedPosts.find((p) => p.slug === slug)
}

/** Dev only: every draft, for review. Always empty in a production build. */
export async function loadDrafts(): Promise<BlogPost[]> {
  const entries = await Promise.all(
    Object.entries(draftLoaders).map(async ([path, load]) => toPost(path, await load(), true)),
  )
  return entries.sort(byNewest)
}

/** "17 October 2026" — the en-IN long form, from a YYYY-MM-DD string, timezone-safe. */
export function formatPostDate(date: string | null): string {
  if (!date) return "Unpublished draft"
  const [y, m, d] = date.split("-").map(Number)
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  })
}
