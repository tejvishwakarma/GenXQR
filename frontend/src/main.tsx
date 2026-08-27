import { StrictMode } from 'react'
import { createRoot, hydrateRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { HelmetProvider } from 'react-helmet-async'
import './index.css'
import App from './App.tsx'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 1,
    },
  },
})

const tree = (
  <StrictMode>
    <HelmetProvider>
      <QueryClientProvider client={queryClient}>
        <App />
      </QueryClientProvider>
    </HelmetProvider>
  </StrictMode>
)

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
