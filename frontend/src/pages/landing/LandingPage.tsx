import { useParams, Navigate } from "react-router-dom"
import { useQuery } from "@tanstack/react-query"
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
    default:
      return <Navigate to="/" replace />
  }
}
