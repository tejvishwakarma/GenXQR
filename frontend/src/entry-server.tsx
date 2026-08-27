import { renderToString } from "react-dom/server"
// From react-router-dom, NOT react-router, even though both export StaticRouter.
// Every component imports its hooks from react-router-dom; pulling the router
// from the other package put two copies of the router context in the bundle and
// every route failed with "useLocation() may be used only in the context of a
// <Router>". They must be the same module instance.
import { StaticRouter } from "react-router-dom"
import { HelmetProvider } from "react-helmet-async"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { SeoCollectorContext, type CollectedSeo } from "./lib/seo-collector"
// Re-exported so prerender.mjs gets it from the same bundle rather than needing
// its own way to load a .ts module.
export { renderCollectedSeo } from "./lib/seo-collector"
import { AppRoutes } from "./App"

/**
 * Build-time render entry. Never ships to the browser.
 *
 * Search Console listed 19 pages as "Discovered - currently not indexed", and
 * the cause was visible in the served HTML: every route returned the SAME
 * document — one generic <title>, one generic description, and zero characters
 * of body text — because the page tree and its head tags only exist once
 * JavaScript runs. Googlebot's first pass does not execute JS, so it saw 19
 * identical blank pages and had no reason to spend a second rendering pass on
 * any of them.
 *
 * scripts/prerender.mjs calls render() once per public route at build time and
 * writes a real HTML file per URL.
 *
 * Deliberately NOT wrapped in StrictMode: it double-invokes render, which costs
 * build time and buys nothing when there is no interactivity to check. The SEO
 * collector below also assumes a single pass.
 */
export interface RenderResult {
  html: string
  seo: CollectedSeo | null
}

export function render(url: string): RenderResult {
  let seo: CollectedSeo | null = null

  // HelmetProvider is still mounted because the page tree renders <Helmet>, and
  // Helmet throws without a provider above it. Its server context is not used —
  // see lib/seo-collector.ts for why it cannot be.
  const queryClient = new QueryClient({
    // Any query is in its pending state during renderToString — effects never
    // run, so nothing fetches — and the markup kept is the loading state. That
    // is intended: the static marketing copy is what needs indexing, and baking
    // in live counters would ship stale numbers. Retries would only slow the
    // build for output that is discarded.
    defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } },
  })

  const html = renderToString(
    <SeoCollectorContext.Provider value={(collected) => { seo = collected }}>
      <HelmetProvider>
        <QueryClientProvider client={queryClient}>
          <StaticRouter location={url}>
            <AppRoutes />
          </StaticRouter>
        </QueryClientProvider>
      </HelmetProvider>
    </SeoCollectorContext.Provider>,
  )

  return { html, seo }
}
