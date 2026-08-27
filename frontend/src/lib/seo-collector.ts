import { createContext, useContext } from "react"

/**
 * Build-time collection of the head tags SEOMeta produces.
 *
 * react-helmet-async@3.0.0 does not populate its provider context during
 * renderToString. Verified against the installed copy: with canUseDOM === false,
 * neither `<Helmet><title>x</title></Helmet>`, nor the `title` prop, nor
 * `defer: false`, nor the documented HelmetData pattern yields anything but
 * `<title data-rh="true"></title>` and empty meta. Helmet still works correctly
 * in the browser, which is why the site's titles change as you navigate — the
 * break is server-side only.
 *
 * So the prerender step reads the tags from SEOMeta rather than from Helmet.
 * SEOMeta builds its tag list once and both renders it through Helmet (for the
 * browser) and hands the same arrays here (for the build). One definition, so
 * the prerendered head cannot drift from the runtime one.
 *
 * The context is null everywhere except inside entry-server.tsx, so this adds
 * nothing to the client bundle's behaviour.
 */
export interface CollectedSeo {
  title: string
  meta: Array<Record<string, string>>
  link: Array<Record<string, string>>
  jsonLd?: object | object[]
}

export type SeoCollector = (seo: CollectedSeo) => void

export const SeoCollectorContext = createContext<SeoCollector | null>(null)

export function useSeoCollector(): SeoCollector | null {
  return useContext(SeoCollectorContext)
}

/** Escapes a value for safe interpolation into an HTML attribute. */
function attr(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
}

/**
 * Renders collected tags as the HTML string the prerender step injects.
 *
 * Lives here beside the type rather than in the script so the escaping and the
 * shape it escapes stay together.
 */
export function renderCollectedSeo(seo: CollectedSeo): string {
  const parts: string[] = [`<title>${attr(seo.title)}</title>`]

  for (const tag of seo.meta) {
    const attrs = Object.entries(tag)
      .map(([k, v]) => `${k}="${attr(v)}"`)
      .join(" ")
    parts.push(`<meta ${attrs} />`)
  }

  for (const tag of seo.link) {
    const attrs = Object.entries(tag)
      .map(([k, v]) => `${k}="${attr(v)}"`)
      .join(" ")
    parts.push(`<link ${attrs} />`)
  }

  if (seo.jsonLd) {
    // JSON-LD goes inside a script element, so the escaping rule is different:
    // only "</" can terminate the element early. Escaping quotes here would
    // corrupt the JSON.
    const json = JSON.stringify(seo.jsonLd).replace(/<\//g, "<\\/")
    parts.push(`<script type="application/ld+json">${json}</script>`)
  }

  return parts.join("\n    ")
}
