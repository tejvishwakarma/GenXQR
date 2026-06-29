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
        urlPattern: /^\/api\/(?!admin).+/,
        handler: 'NetworkFirst',
        options: {
          cacheName: 'api-cache',
          networkTimeoutSeconds: 10,
          expiration: { maxEntries: 50, maxAgeSeconds: 60 * 5 },
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
  server: {
    host: true, // expose on LAN so mobile devices can connect
    proxy: {
      "/api":       { target: "http://localhost:4000", changeOrigin: true, secure: false },
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
    dedupe: ["react", "react-dom", "@tanstack/react-query"],
  },
})

