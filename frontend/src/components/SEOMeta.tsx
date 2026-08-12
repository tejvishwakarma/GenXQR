import { Helmet } from "react-helmet-async"
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

  return (
    <Helmet prioritizeSeoTags>
      {/* Primary */}
      <title>{fullTitle}</title>
      <meta name="description" content={description} />
      {canonicalUrl && <link rel="canonical" href={canonicalUrl} />}

      {/* Explicit on every page: without this, a page can only inherit the
          index.html default, and pages that must stay out of the index (auth,
          dashboard) would silently be indexable. */}
      <meta
        name="robots"
        content={noIndex ? "noindex, nofollow" : "index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1"}
      />

      {/* Open Graph */}
      <meta property="og:type" content={type} />
      <meta property="og:site_name" content={SITE_NAME} />
      <meta property="og:title" content={fullTitle} />
      <meta property="og:description" content={description} />
      <meta property="og:image" content={fullImage} />
      <meta property="og:image:alt" content={`${SITE_NAME} — ${SITE_TAGLINE}`} />
      <meta property="og:locale" content="en_US" />
      {canonicalUrl && <meta property="og:url" content={canonicalUrl} />}
      {type === "article" && publishedTime && (
        <meta property="article:published_time" content={publishedTime} />
      )}
      {type === "article" && modifiedTime && (
        <meta property="article:modified_time" content={modifiedTime} />
      )}

      {/* Twitter Card */}
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:site" content={SOCIAL.twitter} />
      <meta name="twitter:creator" content={SOCIAL.twitter} />
      <meta name="twitter:title" content={fullTitle} />
      <meta name="twitter:description" content={description} />
      <meta name="twitter:image" content={fullImage} />
      <meta name="twitter:image:alt" content={`${SITE_NAME} — ${SITE_TAGLINE}`} />

      {/* Structured data */}
      {jsonLd && (
        <script type="application/ld+json">
          {JSON.stringify(jsonLd)}
        </script>
      )}
    </Helmet>
  )
}
