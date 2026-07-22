import {
  Globe, FileText, Video, List, Users, Contact, Images, Building2,
  Smartphone, Music, UtensilsCrossed, Wifi, MessageCircle, Instagram,
  Facebook, Ticket, QrCode, type LucideIcon,
} from "lucide-react"

/**
 * Canonical QR-type → Lucide icon mapping. Use this everywhere a QR type is shown
 * so the whole app renders consistent vector icons (no per-device emoji drift).
 */
const QR_TYPE_ICONS: Record<string, LucideIcon> = {
  URL: Globe,
  PDF: FileText,
  VIDEO: Video,
  LINKS: List,
  SOCIAL_MEDIA: Users,
  VCARD: Contact,
  IMAGE_GALLERY: Images,
  BUSINESS: Building2,
  APP: Smartphone,
  MP3: Music,
  MENU: UtensilsCrossed,
  WIFI: Wifi,
  WHATSAPP: MessageCircle,
  INSTAGRAM: Instagram,
  FACEBOOK: Facebook,
  COUPON: Ticket,
}

export function QRTypeIcon({ type, size = 18, className }: { type: string; size?: number; className?: string }) {
  const Icon = QR_TYPE_ICONS[type] ?? QrCode
  return <Icon size={size} className={className} />
}
