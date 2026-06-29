import { Helmet } from "react-helmet-async"

interface SEOMetaProps {
  title?: string
  description?: string
  image?: string
  url?: string
  type?: "website" | "article"
  noIndex?: boolean
  jsonLd?: object | object[]
}

const SITE_NAME = "GenXQR"
const DEFAULT_DESCRIPTION =
  "Generate, track, and analyze QR codes for every use case — links, vCards, Wi-Fi, menus, and more. Free tier available."
const DEFAULT_IMAGE = "/og-image.png"
const SITE_URL = import.meta.env.VITE_SITE_URL ?? "https://genxqr.in"

export function SEOMeta({
  title,
  description = DEFAULT_DESCRIPTION,
  image = DEFAULT_IMAGE,
  url,
  type = "website",
  noIndex = false,
  jsonLd,
}: SEOMetaProps) {
  const fullTitle = title ? `${title} | ${SITE_NAME}` : `${SITE_NAME} — QR Code Generator with Analytics`
  const fullImage = image.startsWith("http") ? image : `${SITE_URL}${image}`
  const canonicalUrl = url ? `${SITE_URL}${url}` : undefined

  return (
    <Helmet>
      {/* Primary */}
      <title>{fullTitle}</title>
      <meta name="description" content={description} />
      {canonicalUrl && <link rel="canonical" href={canonicalUrl} />}
      {noIndex && <meta name="robots" content="noindex, nofollow" />}

      {/* Open Graph */}
      <meta property="og:type" content={type} />
      <meta property="og:site_name" content={SITE_NAME} />
      <meta property="og:title" content={fullTitle} />
      <meta property="og:description" content={description} />
      <meta property="og:image" content={fullImage} />
      {canonicalUrl && <meta property="og:url" content={canonicalUrl} />}

      {/* Twitter Card */}
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content={fullTitle} />
      <meta name="twitter:description" content={description} />
      <meta name="twitter:image" content={fullImage} />

      {/* Structured data */}
      {jsonLd && (
        <script type="application/ld+json">
          {JSON.stringify(jsonLd)}
        </script>
      )}
    </Helmet>
  )
}
