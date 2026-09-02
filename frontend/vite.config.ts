import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import path from 'path'

const pwaConfig = VitePWA({
  registerType: 'autoUpdate',
  // Use the manifest.json we provide in public/
  manifest: false,
  includeAssets: ['favicon.svg', 'favicon-32x32.png', 'apple-touch-icon.png', 'robots.txt'],
  workbox: {
    maximumFileSizeToCacheInBytes: 5242880, // 5 MiB
    // Cache static QR generator + scanner routes for offline use
    navigateFallback: '/index.html',
    navigateFallbackDenylist: [
      /^\/api\//,
      /^\/admin-api\//,
      /^\/r\//,
      /^\/uploads\//,
    ],
    globPatterns: ['**/*.{js,css,html,svg,png,ico,woff2}'],
    runtimeCaching: [
      {
        // Pentest finding #11: this used to be /^\/api\/(?!admin).+/, which
        // cached EVERY non-admin API GET — including authenticated, per-user
        // responses — in one URL-keyed cache. The cache is not partitioned by
        // user and logout does not clear it, so on a shared browser the
        // NetworkFirst fallback could serve one account's cached JSON to the
        // next. Restricted to the genuinely public, non-personalised endpoints
        // only. Anything authenticated now always hits the network and is never
        // written to Cache Storage.
        urlPattern: /^\/api\/public\//,
        handler: 'NetworkFirst',
        options: {
          cacheName: 'public-api-cache',
          networkTimeoutSeconds: 10,
          expiration: { maxEntries: 30, maxAgeSeconds: 60 * 5 },
        },
      },
    ],
  },
  devOptions: {
    // Disable SW in dev to avoid stale cache confusion
    enabled: false,
  },
})

// https://vite.dev/config/
export default defineConfig({
  // TS2769: VitePWA returns Plugin[] typed against the pnpm-store vite instance.
  // vite.config.ts resolves 'vite' against the hoisted root node_modules/vite.
  // Both are vite@7.3.1 — the mismatch is an artefact of pnpm's virtual store layout.
  // Safe to cast; runtime behaviour is identical.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  plugins: [react(), ...(pwaConfig as unknown as any[])],
  ssr: {
    // Bundle these rather than leaving them as bare imports in the SSR output.
    //
    // The prerender step (scripts/prerender.mjs) runs the SSR bundle in Node.
    // Vite externalises dependencies there, emitting `import { svg2pdf } from
    // "svg2pdf.js"` — but svg2pdf.js is CommonJS, and Node cannot resolve a
    // named export from CJS, so the import throws before a single route renders.
    // Bundling it lets Vite do the interop at build time.
    //
    // It is reachable at all only because App.tsx imports every page eagerly, so
    // the SSR bundle contains the dashboard's PDF export even though no
    // prerendered route touches it. Code-splitting the non-marketing routes would
    // remove this whole class of problem, and shrink the 2.5 MB client bundle
    // besides — worth doing, but a separate change.
    // `true` bundles every dependency instead of leaving bare imports for Node
    // to resolve at runtime. Two reasons, both hit while building this:
    //
    //  1. Node cannot import a named export from a CommonJS module, so an
    //     externalised `import { svg2pdf } from "svg2pdf.js"` threw before a
    //     single route rendered.
    //  2. Externalised react and react-dom/server were resolved separately at
    //     runtime and Node picked up two copies of React — "Invalid hook call"
    //     on all 23 routes. This is the same pnpm virtual-store hazard that
    //     resolve.dedupe below handles for the client build; dedupe only affects
    //     bundling, so it cannot help an import Vite left external.
    //
    // Bundling costs a second or two of build time on throwaway output and makes
    // both classes of failure impossible rather than something to chase one
    // package at a time.
    noExternal: true,
  },
  server: {
    host: true, // expose on LAN so mobile devices can connect
    proxy: {
      "/api": {
        target: "http://localhost:4000",
        changeOrigin: true,
        secure: false,
        // "/api-docs" is a frontend marketing page (React Router), not a backend
        // route — the naive "/api" prefix match would otherwise swallow it too.
        // Only forward exact "/api" or "/api/..." paths to the backend.
        bypass(req) {
          const url = req.url ?? ""
          if (url !== "/api" && !url.startsWith("/api/")) return "/index.html"
          return null
        },
      },
      "/admin-api": { target: "http://localhost:4000", changeOrigin: true, secure: false },
      "/r":         {
        target: "http://localhost:4000",
        changeOrigin: true,
        secure: false,
        // Sub-paths like /r/:slug/expired and /r/:slug/password are frontend
        // SPA routes — don't proxy them, let React Router handle them.
        bypass(req) {
          const parts = (req.url ?? "").split("/").filter(Boolean)
          // parts[0] === "r", parts[1] === slug, parts[2] === "expired"|"password"
          if (parts.length > 2) return "/index.html"
          return null
        },
      },
      "/uploads":   { target: "http://localhost:4000", changeOrigin: true, secure: false },
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
    // Force Vite to bundle exactly one copy of React, preventing the
    // "Invalid hook call" error caused by pnpm hoisting react into both
    // root node_modules and frontend/node_modules simultaneously.
    // Do NOT add react-router / react-router-dom here. Deduping them broke the
    // CLIENT build on the production server, where pnpm's layout differs from a
    // dev machine's:
    //
    //   Rollup failed to resolve import "react-router-dom" from
    //   ".../.pnpm/react-router-dom@7.15.1_.../react-router-dom/dist/index.mjs"
    //
    // — the package failing to resolve itself. It built cleanly locally, so the
    // breakage only appeared on deploy.
    //
    // They were added while chasing two copies of the router context during
    // prerendering ("useLocation() may be used only in the context of a
    // <Router>"). That was actually fixed by importing StaticRouter from
    // react-router-dom, the same specifier every component uses; the dedupe was
    // belt-and-braces and is not needed.
    dedupe: ["react", "react-dom", "@tanstack/react-query"],
  },
})

