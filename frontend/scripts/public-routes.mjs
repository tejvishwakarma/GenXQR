/**
 * The public route manifest — the single source of truth for both
 * generate-sitemap.mjs and prerender.mjs.
 *
 * These two must never disagree. A route in the sitemap but not prerendered is
 * submitted to Google as an empty document; a route prerendered but not in the
 * sitemap is work nobody asked for. Keeping one list makes that impossible
 * rather than merely unlikely.
 *
 * Adding a public page? Add it here. Anything not listed is neither submitted to
 * search engines nor prerendered.
 *
 * priority is relative within this site only — it does not affect ranking.
 * changefreq is a hint, not a directive. Both are advisory; `loc` is what
 * actually matters.
 */
export const PUBLIC_ROUTES = [
  // Core
  { path: "/", changefreq: "weekly", priority: "1.0" },
  { path: "/features", changefreq: "monthly", priority: "0.9" },
  { path: "/pricing", changefreq: "monthly", priority: "0.9" },
  { path: "/dynamic-qr", changefreq: "monthly", priority: "0.9" },
  { path: "/use-cases", changefreq: "monthly", priority: "0.8" },

  // Free tools — high intent, worth crawling often
  { path: "/generate", changefreq: "monthly", priority: "0.9" },
  { path: "/generate/url", changefreq: "monthly", priority: "0.8" },
  { path: "/generate/wifi", changefreq: "monthly", priority: "0.8" },
  { path: "/generate/whatsapp", changefreq: "monthly", priority: "0.8" },
  { path: "/generate/instagram", changefreq: "monthly", priority: "0.8" },
  { path: "/scanner", changefreq: "monthly", priority: "0.8" },

  // Content
  { path: "/blog", changefreq: "weekly", priority: "0.7" },
  { path: "/faq", changefreq: "monthly", priority: "0.7" },
  { path: "/api-docs", changefreq: "monthly", priority: "0.8" },
  { path: "/about", changefreq: "monthly", priority: "0.6" },
  { path: "/contact", changefreq: "yearly", priority: "0.6" },
  { path: "/careers", changefreq: "weekly", priority: "0.5" },
  { path: "/changelog", changefreq: "weekly", priority: "0.5" },

  // Legal — low priority but should still be indexed for trust signals.
  // refund-policy and delivery-policy are also required to be publicly
  // reachable for Indian payment-gateway onboarding.
  { path: "/privacy", changefreq: "yearly", priority: "0.3" },
  { path: "/terms", changefreq: "yearly", priority: "0.3" },
  { path: "/refund-policy", changefreq: "yearly", priority: "0.4" },
  { path: "/delivery-policy", changefreq: "yearly", priority: "0.4" },
  { path: "/cookie-policy", changefreq: "yearly", priority: "0.3" },
  { path: "/gdpr", changefreq: "yearly", priority: "0.3" },
]

/**
 * Deliberately excluded, and why — kept here so the reasoning survives:
 *  /login, /signup, /forgot-password, /reset-password, /verify-email
 *      Auth screens: no content to rank, and indexing them invites confusion.
 *  /invite/:token, /r/:slug/*, /l/:slug
 *      Per-user or per-QR URLs. Indexing them would leak customer content
 *      into search results.
 *  /app/*, /admin/*
 *      Authenticated areas; also blocked in robots.txt.
 */

/** Keep in sync with src/lib/site.ts — see the note in generate-sitemap.mjs. */
export const SITE_URL = (process.env.VITE_SITE_URL ?? "https://genxqr.com").replace(/\/$/, "")
