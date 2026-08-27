import { Helmet } from "react-helmet-async"
import { useSeoCollector } from "@/lib/seo-collector"
import {
  OG_IMAGE_PATH,
  SITE_DESCRIPTION,
  SITE_NAME,
  SITE_TAGLINE,
  SOCIAL,
  absoluteUrl,
} from "@/lib/site"

interface SEOMetaProps {
  /** Page title, without the site-name suffix — that's appended automatically. */
  title?: string
  description?: string
  /** Path or absolute URL of the share image. Defaults to the site OG image. */
  image?: string
  /** Path of this page, e.g. "/pricing". Drives the canonical and og:url tags. */
  url?: string
  type?: "website" | "article"
  noIndex?: boolean
  jsonLd?: object | object[]
  /** ISO date — emitted as article:published_time when type is "article". */
  publishedTime?: string
  /** ISO date — emitted as article:modified_time when type is "article". */
  modifiedTime?: string
}

export function SEOMeta({
  title,
  description = SITE_DESCRIPTION,
  image = OG_IMAGE_PATH,
  url,
  type = "website",
  noIndex = false,
  jsonLd,
  publishedTime,
  modifiedTime,
}: SEOMetaProps) {
  const fullTitle = title ? `${title} | ${SITE_NAME}` : `${SITE_NAME} — ${SITE_TAGLINE}`
  const fullImage = absoluteUrl(image)
  const canonicalUrl = url ? absoluteUrl(url) : undefined

  /**
   * The tags are built as data once, then used twice: rendered through Helmet
   * for the browser, and handed to the collector for the build-time prerender.
   *
   * They used to be written inline as JSX. Keeping them as data is what makes it
   * impossible for the prerendered head to drift from the runtime one — the
   * alternative was a second copy of this list inside the prerender script, and
   * the failure mode there is silent: pages ship with head tags that no longer
   * match what the app sets on navigation.
   */
  const meta: Array<Record<string, string>> = [
    { name: "description", content: description },
    // Explicit on every page: without this, a page can only inherit the
    // index.html default, and pages that must stay out of the index (auth,
    // dashboard) would silently be indexable.
    {
      name: "robots",
      content: noIndex
        ? "noindex, nofollow"
        : "index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1",
    },

    // Open Graph
    { property: "og:type", content: type },
    { property: "og:site_name", content: SITE_NAME },
    { property: "og:title", content: fullTitle },
    { property: "og:description", content: description },
    { property: "og:image", content: fullImage },
    { property: "og:image:alt", content: `${SITE_NAME} — ${SITE_TAGLINE}` },
    { property: "og:locale", content: "en_US" },
    ...(canonicalUrl ? [{ property: "og:url", content: canonicalUrl }] : []),
    ...(type === "article" && publishedTime
      ? [{ property: "article:published_time", content: publishedTime }]
      : []),
    ...(type === "article" && modifiedTime
      ? [{ property: "article:modified_time", content: modifiedTime }]
      : []),

    // Twitter Card
    { name: "twitter:card", content: "summary_large_image" },
    { name: "twitter:site", content: SOCIAL.twitter },
    { name: "twitter:creator", content: SOCIAL.twitter },
    { name: "twitter:title", content: fullTitle },
    { name: "twitter:description", content: description },
    { name: "twitter:image", content: fullImage },
    { name: "twitter:image:alt", content: `${SITE_NAME} — ${SITE_TAGLINE}` },
  ]

  const link: Array<Record<string, string>> = canonicalUrl
    ? [{ rel: "canonical", href: canonicalUrl }]
    : []

  // Null in the browser; non-null only inside the prerender entry. Called during
  // render rather than in an effect because effects do not run under
  // renderToString — which is the whole point. Safe here: the prerender is a
  // single synchronous pass with no StrictMode double-invocation, and the
  // collector only records the last value it is given.
  const collect = useSeoCollector()
  if (collect) {
    collect({ title: fullTitle, meta, link, jsonLd })
    // Render nothing during the prerender pass.
    //
    // React 19 supports <title>/<meta>/<link> anywhere in the tree and hoists
    // them into <head> — in the BROWSER. renderToString emits them exactly where
    // they appear instead, so leaving Helmet mounted here put a full duplicate
    // set of head tags inside <div id="root">: two <title> elements per page,
    // one valid in the head and one stranded in the body.
    //
    // The collector already has the same data, and prerender.mjs writes it into
    // the head properly, so there is nothing left for this to render.
    return null
  }

  return (
    <Helmet prioritizeSeoTags>
      <title>{fullTitle}</title>
      {meta.map((tag, i) => (
        <meta key={`m${i}`} {...tag} />
      ))}
      {link.map((tag, i) => (
        <link key={`l${i}`} {...tag} />
      ))}
      {jsonLd && (
        <script type="application/ld+json">
          {JSON.stringify(jsonLd)}
        </script>
      )}
    </Helmet>
  )
}
