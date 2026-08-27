import { useParams, Navigate } from "react-router-dom"
import { useQuery } from "@tanstack/react-query"
import { QrCode } from "lucide-react"
import { getPublicQR } from "@/lib/api"

// Landing page templates
import PDFLandingPage from "./templates/PDFLandingPage"
import VideoLandingPage from "./templates/VideoLandingPage"
import LinksLandingPage from "./templates/LinksLandingPage"
import SocialMediaLandingPage from "./templates/SocialMediaLandingPage"
import VCardLandingPage from "./templates/VCardLandingPage"
import ImageGalleryLandingPage from "./templates/ImageGalleryLandingPage"
import BusinessLandingPage from "./templates/BusinessLandingPage"
import AppLandingPage from "./templates/AppLandingPage"
import MP3LandingPage from "./templates/MP3LandingPage"
import MenuLandingPage from "./templates/MenuLandingPage"
import WiFiLandingPage from "./templates/WiFiLandingPage"
import CouponLandingPage from "./templates/CouponLandingPage"
import FacebookLandingPage from "./templates/FacebookLandingPage"
import URLLandingPage from "./templates/URLLandingPage"

export default function LandingPage() {
  const { slug } = useParams<{ slug: string }>()

  const { data, isLoading, isError } = useQuery({
    queryKey: ["public-qr", slug],
    queryFn: () => getPublicQR(slug!),
    enabled: !!slug,
    retry: 1,
    staleTime: 60_000,
  })

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mx-auto mb-4" />
          <p className="text-gray-500 text-sm">Loading...</p>
        </div>
      </div>
    )
  }

  if (isError || !data?.data) {
    return <Navigate to="/" replace />
  }

  const qr = data.data

  if (!qr.isActive) {
    return <Navigate to={`/r/${slug}/expired`} replace />
  }

  const props = {
    name: qr.name,
    content: qr.content,
    design: qr.design,
    files: qr.files,
  }

  /**
   * The template is chosen first and the attribution appended around it, rather
   * than added to each of the 14 templates. One place to change, and a new
   * template cannot ship without it by omission — which is how these pages came
   * to carry no attribution at all.
   */
  const template = (() => {
    switch (qr.type) {
      case "URL":           return <URLLandingPage {...props} />
      case "PDF":           return <PDFLandingPage {...props} />
      case "VIDEO":         return <VideoLandingPage {...props} />
      case "LINKS":         return <LinksLandingPage {...props} />
      case "SOCIAL_MEDIA":  return <SocialMediaLandingPage {...props} />
      case "VCARD":         return <VCardLandingPage {...props} />
      case "IMAGE_GALLERY": return <ImageGalleryLandingPage {...props} />
      case "BUSINESS":      return <BusinessLandingPage {...props} />
      case "APP":           return <AppLandingPage {...props} />
      case "MP3":           return <MP3LandingPage {...props} />
      case "MENU":          return <MenuLandingPage {...props} />
      case "WIFI":          return <WiFiLandingPage {...props} />
      case "COUPON":        return <CouponLandingPage {...props} />
      case "FACEBOOK":      return <FacebookLandingPage {...props} />
      default:              return null
    }
  })()

  if (template === null) {
    return <Navigate to="/" replace />
  }

  // Defaults to shown when the field is absent, matching the server: a page that
  // renders before the API is redeployed, or from a cached response, should
  // attribute rather than silently drop it.
  const showBranding = qr.showBranding !== false

  return (
    <>
      {template}
      {showBranding && <PoweredByGenXQR />}
    </>
  )
}

/**
 * Attribution shown on landing pages, unless the owner's plan includes
 * whiteLabel.
 *
 * Two reasons it exists. It is what the white-label feature actually removes —
 * that plan flag has been on the pricing page since launch while removing
 * nothing, because there was no branding here to take away. And it says whose
 * platform is hosting the page: these render customer-authored content on
 * genxqr.com, and an unattributed page is one a visitor cannot place, which is
 * the same omission Google flagged on the QR password gate.
 *
 * Deliberately quiet — the customer's content is the point, not this.
 */
function PoweredByGenXQR() {
  return (
    <div className="w-full border-t border-black/5 bg-white/60 py-4 text-center backdrop-blur-sm dark:border-white/10 dark:bg-black/30">
      <a
        href="https://genxqr.com/?utm_source=landing&utm_medium=badge&utm_campaign=powered_by"
        target="_blank"
        rel="noopener"
        className="inline-flex items-center gap-1.5 text-xs text-zinc-500 transition-colors hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-100"
      >
        <QrCode size={13} aria-hidden="true" />
        <span>
          Powered by <span className="font-semibold">GenXQR</span>
        </span>
      </a>
    </div>
  )
}
