import { StrictMode } from 'react'
import { createRoot, hydrateRoot } from 'react-dom/client'
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClient } from './lib/queryClient'
import { HelmetProvider } from 'react-helmet-async'
import './index.css'
import App from './App.tsx'
import { captureAttribution } from './lib/attribution'
import { captureCouponLink } from './lib/couponLink'
import { captureReferralLink } from './lib/referralLink'

// Before the first render, not in an effect: the sign-up page builds its Google
// link during render, so a visitor landing straight on /signup?utm_source=…
// would otherwise get a link without the campaign. Only the landing URL matters
// — in-app navigation never carries a new campaign — so once per load is right.
captureAttribution()
captureCouponLink()
captureReferralLink()

const tree = (
  <StrictMode>
    <HelmetProvider>
      <QueryClientProvider client={queryClient}>
        <App />
      </QueryClientProvider>
    </HelmetProvider>
  </StrictMode>
)

/**
 * Head tags written into the HTML by the prerender (or the index.html
 * fallback) carry data-seo-static. They exist for crawlers that do not run
 * JavaScript. Once React renders, <SEOMeta> emits the page's tags again — and
 * react-helmet-async on React 19 renders them as elements that React hoists,
 * rather than adopting what is already in <head> — so leaving the static ones
 * produced two titles, two descriptions and two canonicals on every page (seen
 * in Search Console's rendered HTML). Removing them first leaves one set.
 * JSON-LD is marked too: Helmet re-renders it on the client as well (measured:
 * two ld+json blocks per page before this).
 */
document.head.querySelectorAll('[data-seo-static]').forEach((el) => el.remove())

const container = document.getElementById('root')!

/**
 * Hydrate a prerendered page; mount fresh everywhere else.
 *
 * scripts/prerender.mjs writes real markup into #root for the 23 public routes,
 * while every other URL — /login, /app/*, /admin/*, /r/:slug/password — is served
 * the empty SPA shell. Both cases have to work from this one entry point.
 *
 * The distinction matters for what the visitor sees. createRoot on a container
 * that already has children DISCARDS them and renders from scratch, so a
 * prerendered page would paint its content and then have it thrown away and
 * rebuilt — a flash on exactly the pages the prerendering exists to make fast.
 * hydrateRoot adopts the existing DOM instead.
 *
 * Where the two disagree — the theme class and logged-in state are read from
 * localStorage, which the build could not see — React discards the mismatched
 * subtree and client-renders it. That is the same correction the app already
 * performed on every load before prerendering existed, now scoped to the parts
 * that actually differ rather than the whole page.
 */
if (container.hasChildNodes()) {
  hydrateRoot(container, tree)
} else {
  createRoot(container).render(tree)
}
