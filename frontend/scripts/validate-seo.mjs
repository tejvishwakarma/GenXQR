/**
 * Validates the SEO surface that is easy to get silently wrong:
 *   - every JSON-LD builder produces serialisable, on-domain, well-typed output
 *   - sitemap.xml is well-formed, canonical, and free of duplicates
 *   - robots.txt does not block anything listed in the sitemap
 *
 * Run: pnpm seo:check   (also runs in CI)
 *
 * Loads the real TypeScript modules through Vite's SSR pipeline rather than a
 * reimplementation, so this tests the code that actually ships.
 */
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { createServer } from "vite"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, "..")

let failures = 0
const fail = (msg) => {
  console.log("  FAIL:", msg)
  failures++
}

/** Recursively collects every absolute URL so the domain can be asserted everywhere. */
function collectUrls(value, found = []) {
  if (typeof value === "string" && /^https?:\/\//.test(value)) found.push(value)
  else if (Array.isArray(value)) value.forEach((v) => collectUrls(v, found))
  else if (value && typeof value === "object") Object.values(value).forEach((v) => collectUrls(v, found))
  return found
}

const server = await createServer({
  root,
  configFile: false,
  logLevel: "error",
  server: { middlewareMode: true },
  resolve: { alias: { "@": path.resolve(root, "src") } },
  // ssrLoadModule doesn't need pre-bundled browser deps, and letting the
  // scanner start means it races the server.close() below and prints an
  // alarming-but-harmless "Request is outdated" stack trace.
  optimizeDeps: { noDiscovery: true, include: [] },
})

try {
  const S = await server.ssrLoadModule("/src/lib/schema.ts")
  const site = await server.ssrLoadModule("/src/lib/site.ts")
  const EXPECTED_ORIGIN = site.SITE_URL

  console.log(`Canonical origin: ${EXPECTED_ORIGIN}\n`)

  const nodes = {
    Organization: S.organisationSchema(),
    WebSite: S.websiteSchema(),
    SoftwareApplication: S.softwareApplicationSchema({
      lowPrice: "0", highPrice: "9999", priceCurrency: "INR", offerCount: "5",
    }),
    BreadcrumbList: S.breadcrumbSchema([{ name: "Pricing", path: "/pricing" }]),
    FAQPage: S.faqSchema([{ question: "Is it free?", answer: "Yes." }]),
    WebPage: S.webPageSchema({ name: "About", path: "/about" }),
    HowTo: S.howToSchema({
      name: "Create a QR code",
      description: "Steps",
      steps: [{ name: "Pick a type", text: "Choose URL." }],
    }),
  }

  console.log("JSON-LD BUILDERS")
  for (const [name, node] of Object.entries(nodes)) {
    let round
    try {
      // Exactly what react-helmet-async does when it renders the tag.
      round = JSON.parse(JSON.stringify(node))
    } catch (e) {
      fail(`${name}: not JSON-serialisable — ${e.message}`)
      continue
    }

    if (round["@context"] !== "https://schema.org") fail(`${name}: missing or wrong @context`)
    if (!round["@type"]) fail(`${name}: missing @type`)

    const urls = collectUrls(round)
    const offDomain = urls.filter(
      (u) => !u.startsWith(EXPECTED_ORIGIN) && !u.startsWith("https://schema.org"),
    )
    if (offDomain.length) fail(`${name}: off-domain URLs — ${offDomain.join(", ")}`)
    if (JSON.stringify(round).includes('"undefined"')) fail(`${name}: contains a literal "undefined"`)

    console.log(`  ok  ${name.padEnd(20)} urls=${String(urls.length).padStart(2)}  bytes=${JSON.stringify(round).length}`)
  }

  // Google treats invented ratings as a policy violation, so the builder must
  // omit the field entirely unless real values are supplied.
  if ("aggregateRating" in nodes.SoftwareApplication) {
    fail("SoftwareApplication emitted aggregateRating with no real rating data")
  }
  const rated = S.softwareApplicationSchema({
    lowPrice: "0", highPrice: "1", priceCurrency: "INR", offerCount: "2",
    ratingValue: "4.8", reviewCount: "120",
  })
  if (!rated.aggregateRating) fail("aggregateRating missing when real values were supplied")

  // Cross-node @id references have to resolve, or the graph is meaningless.
  if (nodes.WebSite.publisher?.["@id"] !== nodes.Organization["@id"]) {
    fail("WebSite.publisher @id does not match Organization @id")
  }

  // ── sitemap.xml ──────────────────────────────────────────────────────────
  console.log("\nSITEMAP")
  const xml = fs.readFileSync(path.join(root, "public/sitemap.xml"), "utf8")
  const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1])

  if (!locs.length) fail("no <loc> entries")
  if ((xml.match(/<url>/g) ?? []).length !== (xml.match(/<\/url>/g) ?? []).length) fail("unbalanced <url> tags")

  const offDomain = locs.filter((u) => !u.startsWith(EXPECTED_ORIGIN))
  if (offDomain.length) fail(`off-domain entries — ${offDomain.slice(0, 3).join(", ")}`)

  const dupes = locs.length - new Set(locs).size
  if (dupes) fail(`${dupes} duplicate URL(s)`)

  const badPriority = [...xml.matchAll(/<priority>([^<]+)<\/priority>/g)]
    .map((m) => parseFloat(m[1]))
    .filter((p) => !(p >= 0 && p <= 1))
  if (badPriority.length) fail(`priority out of range: ${badPriority.join(", ")}`)

  console.log(`  ok  ${locs.length} URLs, no duplicates, all on ${EXPECTED_ORIGIN}`)

  // ── payment-gateway compliance ───────────────────────────────────────────
  // Cashfree (and Indian payment aggregators generally) require these pages to
  // be live and reachable, plus a registered business name and phone number on
  // the site. Warn rather than fail, so this can't block an unrelated deploy —
  // but make it impossible to forget.
  console.log("\nPAYMENT-GATEWAY COMPLIANCE")
  const REQUIRED_PAGES = [
    "/terms", "/privacy", "/about", "/contact",
    "/refund-policy", "/delivery-policy", "/pricing", "/features",
  ]
  const missingPages = REQUIRED_PAGES.filter((p) => !locs.some((u) => new URL(u).pathname === p))
  if (missingPages.length) {
    fail(`required pages absent from the sitemap: ${missingPages.join(", ")}`)
  } else {
    console.log(`  ok  all ${REQUIRED_PAGES.length} required policy/info pages present`)
  }

  const identity = site.businessIdentityStatus()
  if (identity.hasLegalName) {
    console.log("  ok  registered business name published")
  } else {
    fail("no registered business name set in ORGANISATION.legalName (src/lib/site.ts)")
  }

  if (identity.hasPhone) {
    console.log("  ok  contact phone number published")
  } else {
    // A warning, not a failure — publishing a number is the owner's call. But
    // Cashfree lists it as required, so this must stay visible rather than
    // quietly passing.
    console.log(
      "  ⚠ NOTE: no contact phone number is published. Cashfree's checklist asks for\n" +
        '    "one email ID and a valid phone number" on the Contact page, so a reviewer\n' +
        "    may raise this. Add `phone` to ORGANISATION in src/lib/site.ts to resolve.",
    )
  }

  // ── robots.txt ───────────────────────────────────────────────────────────
  console.log("\nROBOTS")
  const robots = fs.readFileSync(path.join(root, "public/robots.txt"), "utf8")

  if (robots.charCodeAt(0) === 0xfeff) fail("starts with a BOM, which some crawlers mis-parse")
  if (!/^User-agent:/m.test(robots)) fail("no User-agent group")

  const sitemapLine = robots.match(/^Sitemap:\s*(\S+)$/m)?.[1]
  if (!sitemapLine) fail("no Sitemap: directive")
  else if (!sitemapLine.startsWith(EXPECTED_ORIGIN)) fail(`Sitemap: points off-domain — ${sitemapLine}`)

  // The classic own-goal: shipping a sitemap full of URLs robots.txt forbids.
  const disallows = [...robots.matchAll(/^Disallow:\s*(\S+)$/gm)].map((m) => m[1])
  const blocked = locs.filter((u) => {
    const p = new URL(u).pathname
    return disallows.some((d) => d !== "/" && p.startsWith(d))
  })
  if (blocked.length) fail(`sitemap URLs blocked by robots.txt — ${blocked.join(", ")}`)

  console.log(`  ok  sitemap declared, ${disallows.length} disallow rules, none blocking sitemap URLs`)
} finally {
  await server.close()
}

console.log(`\n${failures === 0 ? "✓ All SEO checks passed" : `✗ ${failures} check(s) failed`}`)
process.exit(failures === 0 ? 0 : 1)
