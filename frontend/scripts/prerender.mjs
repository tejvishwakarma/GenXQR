/**
 * Writes a real HTML file for every public route, after `vite build`.
 *
 * WHY
 * Search Console listed 19 pages as "Discovered - currently not indexed". The
 * cause was visible in the served HTML: every route returned the same document —
 * one generic <title>, one generic description, and zero characters of body
 * text — because the page tree and react-helmet-async only exist once
 * JavaScript runs. Googlebot's first pass does not execute JS, so it saw 19
 * identical blank pages and had no reason to spend a second rendering pass on
 * any of them.
 *
 * HOW
 * `vite build --ssr src/entry-server.tsx` produces a Node-runnable bundle. This
 * script renders each route through it and writes dist/<route>/index.html, with
 * the page's own head tags substituted for the template's fallbacks.
 *
 * Deliberately NOT a headless browser. prerender-spa-plugin and friends drive
 * Chromium, which would mean installing ~300 MB of browser onto the VPS where
 * deploy.sh runs the build, and a new class of deploy failure. Rendering in plain
 * Node costs one guard for browser-only APIs read during render (see
 * readStoredValue in src/lib/utils.ts) and nothing else.
 *
 * WHAT THIS DOES NOT DO
 * Effects never run during renderToString, so anything fetched in useEffect or
 * by TanStack Query is absent from the output — live stats render as their
 * loading state and fill in on hydration. That is fine: the static marketing
 * copy is what needs indexing, and prerendering live counters would bake stale
 * numbers into the HTML.
 */
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { pathToFileURL } from "node:url"
import { PUBLIC_ROUTES } from "./public-routes.mjs"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, "..")
const DIST = path.join(ROOT, "dist")
const SSR_ENTRY = path.join(ROOT, "dist-ssr", "entry-server.js")
const TEMPLATE = path.join(DIST, "index.html")

const FALLBACK_START = "<!-- SEO-FALLBACK-START"
const FALLBACK_END = "<!-- SEO-FALLBACK-END -->"

function fail(message) {
  console.error(`\nprerender: ${message}\n`)
  process.exit(1)
}

if (!fs.existsSync(TEMPLATE)) fail(`${TEMPLATE} not found — run \`vite build\` first.`)
if (!fs.existsSync(SSR_ENTRY)) {
  fail(`${SSR_ENTRY} not found — run \`vite build --ssr src/entry-server.tsx --outDir dist-ssr\` first.`)
}

const template = fs.readFileSync(TEMPLATE, "utf8")

// Fail loudly rather than silently producing pages with duplicated or missing
// head tags. If someone edits index.html and drops a marker, that must stop the
// build, not ship 24 pages with two <title> elements each.
const startIdx = template.indexOf(FALLBACK_START)
const endIdx = template.indexOf(FALLBACK_END)
if (startIdx === -1 || endIdx === -1 || endIdx < startIdx) {
  fail("the SEO-FALLBACK markers are missing or out of order in index.html.")
}
if (!template.includes('<div id="root"></div>')) {
  fail('could not find <div id="root"></div> in the built index.html.')
}

const { render, renderCollectedSeo } = await import(pathToFileURL(SSR_ENTRY).href)

/**
 * "/" is deliberately NOT prerendered.
 *
 * nginx resolves "/" to dist/index.html via its `index index.html` directive,
 * and that same file is the SPA fallback for every route without a file of its
 * own — /login, /app/*, /admin/*, and /r/:slug/password among them. Baking the
 * homepage into it would make all of those serve homepage markup for a beat
 * before React hydrated the real page over the top. That is a visible flash on
 * the pages least able to afford one: the password gate is reached mid-scan.
 *
 * The cost is small — the homepage is already indexed, unlike the 19 subpages
 * this exists to fix. To prerender it too, write it to dist/home/index.html and
 * add to the vhost:
 *
 *     location = / {
 *         root /home/genxqr/htdocs/genxqr.com/frontend/dist;
 *         try_files /home/index.html /index.html;
 *         expires epoch;
 *     }
 *
 * which keeps dist/index.html pristine as the fallback.
 */
const ROUTES = PUBLIC_ROUTES.filter((r) => r.path !== "/")

let written = 0
const failures = []

for (const { path: route } of ROUTES) {
  let html
  let seo
  try {
    ;({ html, seo } = render(route))
  } catch (err) {
    // Collected rather than thrown, so one broken route reports alongside the
    // others instead of hiding them behind the first failure.
    failures.push(`${route} — ${err instanceof Error ? err.message : String(err)}`)
    continue
  }

  // Guard against a route that "renders" to nothing. The catch-all in App.tsx is
  // a <Navigate>, which produces empty markup — so a typo'd path here would
  // silently emit a blank page that looks fine to this script.
  const textLength = html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().length
  if (textLength < 200) {
    failures.push(`${route} — rendered only ${textLength} chars of text; is the path in App.tsx?`)
    continue
  }

  if (!seo) {
    failures.push(`${route} — no SEO tags collected; does the page render <SEOMeta>?`)
    continue
  }

  // Built from the tag data SEOMeta already computes — see lib/seo-collector.ts
  // for why this cannot come from react-helmet-async's server context.
  const head = renderCollectedSeo(seo)

  const page = template
    .slice(0, startIdx)
    .concat(head, "\n    ", template.slice(endIdx + FALLBACK_END.length))
    .replace('<div id="root"></div>', `<div id="root">${html}</div>`)

  // "/pricing" becomes dist/pricing/index.html. nginx already serves these via
  // `try_files $uri $uri/ /index.html` — the $uri/ term matches the directory
  // and `index index.html` serves the file — so no vhost change is needed.
  const outPath = path.join(DIST, route.replace(/^\//, ""), "index.html")

  fs.mkdirSync(path.dirname(outPath), { recursive: true })
  fs.writeFileSync(outPath, page, "utf8")
  written++
}

if (failures.length) {
  console.error("\nprerender: some routes failed\n")
  failures.forEach((f) => console.error(`  ${f}`))
  fail(`${failures.length} of ${ROUTES.length} routes could not be prerendered.`)
}

console.log(`prerender — ${written} routes written to dist/ (\"/\" left as the SPA shell by design)`)

// ── Strict-CSP guard ────────────────────────────────────────────────────────
// The production CSP has script-src WITHOUT 'unsafe-inline' (deploy/*.conf), so
// any inline <script> would be silently blocked in the browser — the app would
// half-load with no console error at build time, only at runtime for every
// visitor. Fail the build instead if an inline executable script slips into any
// served HTML. JSON-LD (type="application/ld+json") is exempt: browsers never
// execute it, so CSP does not apply to it.
const inlineOffenders = []
;(function scan(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name)
    if (e.isDirectory()) { scan(full); continue }
    if (!e.name.endsWith(".html")) continue
    const html = fs.readFileSync(full, "utf8")
    for (const tag of html.match(/<script\b[^>]*>/gi) ?? []) {
      const hasSrc = /\bsrc=/.test(tag)
      const isJsonLd = /type\s*=\s*["']application\/ld\+json["']/i.test(tag)
      if (!hasSrc && !isJsonLd) inlineOffenders.push(`${full.replace(DIST, "")}: ${tag}`)
    }
  }
})(DIST)

if (inlineOffenders.length) {
  console.error("\nprerender: inline <script> found — the strict script-src CSP will block these in the browser.")
  console.error("Move the script to an external file served from 'self' (see public/theme-init.js).\n")
  inlineOffenders.forEach((o) => console.error(`  ${o}`))
  fail(`${inlineOffenders.length} inline script(s) would be blocked by CSP.`)
}
console.log("prerender — no inline scripts; safe for strict script-src")
