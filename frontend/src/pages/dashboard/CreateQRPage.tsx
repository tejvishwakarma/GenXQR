import { useState, useRef, useEffect, useCallback } from "react"
import { Link, useNavigate, useParams } from "react-router-dom"
import { useForm, Controller } from "react-hook-form"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import QRCodeStyling, { type DotType, type CornerSquareType } from "qr-code-styling"
import {
  QrCode, Wifi, MessageCircle, Instagram, FileText, Video, Globe,
  Users, Image, Building2, Smartphone, Music, List, Facebook, Tag,
  ChevronRight, ChevronLeft, ChevronDown, Check, Palette, Settings2, ArrowLeft,
  Upload, Loader2, X, Clock, ScanLine,
} from "lucide-react"
import * as Tabs from "@radix-ui/react-tabs"
import * as SelectPrimitive from "@radix-ui/react-select"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { SocialIcon } from "@/components/ui/social-icon"
import { cn } from "@/lib/utils"
import { createQR, updateQR, getQR, uploadFile, getSubscription, getBillingUsage, ApiError, type CreateQRPayload, type UploadedFileInfo, type QRCode, type QRFile } from "@/lib/api"
import { VCardEditor, buildVCardContent, DEFAULT_VCARD_DATA, type VCardData } from "./VCardEditor"
import LandingPreview from "./LandingPreview"
import { ImportQRModal } from "@/components/dashboard/ImportQRModal"
import type { ParsedQR } from "@/lib/qrDecode"

// ─── Constants ────────────────────────────────────────────────────────────────

const qrTypes = [
  { id: "url",      label: "URL / Website",   icon: <Globe size={22} />,        desc: "Link to any website or landing page", category: "basic" },
  { id: "pdf",      label: "PDF Document",    icon: <FileText size={22} />,     desc: "Share any PDF file up to 100 MB",      category: "file"  },
  { id: "video",    label: "Video",           icon: <Video size={22} />,        desc: "Showcase a video up to 250 MB",        category: "file"  },
  { id: "links",    label: "Multi-Link",      icon: <List size={22} />,         desc: "Show multiple links in one place",     category: "page"  },
  { id: "social",   label: "Social Media",    icon: <Users size={22} />,        desc: "30+ social network profiles",          category: "page"  },
  { id: "vcard",    label: "Business Card",   icon: <Users size={22} />,        desc: "Digital vCard with contact details",   category: "page"  },
  { id: "gallery",  label: "Image Gallery",   icon: <Image size={22} />,        desc: "Showcase up to 10 images",             category: "file"  },
  { id: "business", label: "Business Info",   icon: <Building2 size={22} />,    desc: "Hours, location, facilities",          category: "page"  },
  { id: "app",      label: "App Download",    icon: <Smartphone size={22} />,   desc: "App Store & Play Store links",         category: "page"  },
  { id: "mp3",      label: "Audio / MP3",     icon: <Music size={22} />,        desc: "Share music or podcast",               category: "file"  },
  { id: "menu",     label: "Restaurant Menu", icon: <QrCode size={22} />,       desc: "Digital menu with sections",           category: "page"  },
  { id: "wifi",     label: "WiFi",            icon: <Wifi size={22} />,         desc: "Auto-connect to your network",         category: "basic" },
  { id: "whatsapp", label: "WhatsApp",        icon: <MessageCircle size={22} />, desc: "Direct WhatsApp chat",               category: "basic" },
  { id: "instagram",label: "Instagram",       icon: <Instagram size={22} />,    desc: "Link to Instagram profile",            category: "basic" },
  { id: "facebook", label: "Facebook",        icon: <Facebook size={22} />,     desc: "Facebook page or profile",             category: "page"  },
  { id: "coupon",   label: "Coupon",          icon: <Tag size={22} />,          desc: "Digital coupons with barcode",         category: "page"  },
]

const DOT_STYLES: { value: DotType; label: string }[] = [
  { value: "square",         label: "Square"        },
  { value: "dots",           label: "Dots"          },
  { value: "rounded",        label: "Rounded"       },
  { value: "classy",         label: "Classy"        },
  { value: "classy-rounded", label: "Classy Rounded" },
  { value: "extra-rounded",  label: "Extra Rounded" },
]

const CORNER_STYLES: { value: CornerSquareType; label: string }[] = [
  { value: "square",        label: "Square"  },
  { value: "dot",           label: "Dot"     },
  { value: "extra-rounded", label: "Rounded" },
]

const LOGO_MAX_BYTES = 1 * 1024 * 1024 // 1 MB — logos are small; no need for full image upload limit

const FRAME_STYLES: { id: string; label: string }[] = [
  { id: "none",         label: "None"         },
  { id: "simple",       label: "Scan Me"      },
  { id: "top-label",    label: "Top Label"    },
  { id: "both-labels",  label: "Both Labels"  },
  { id: "scan-now",     label: "Scan Now"     },
  { id: "box",          label: "Box Border"   },
  { id: "thick-border", label: "Bold Border"  },
  { id: "dashed",       label: "Dashed"       },
  { id: "double",       label: "Double"       },
  { id: "corners",      label: "Brackets"     },
  { id: "card",         label: "White Card"   },
  { id: "banner",       label: "Banner CTA"   },
  { id: "speech-bubble",label: "Bubble"       },
  { id: "neon-violet",  label: "Neon Violet"  },
  { id: "neon-blue",    label: "Neon Blue"    },
  { id: "neon-pink",    label: "Neon Pink"    },
]

// ─── 30+ Social Networks ──────────────────────────────────────────────────────

const SOCIAL_NETWORKS = [
  { id: "instagram",  label: "Instagram",   ph: "https://instagram.com/username"         },
  { id: "twitter",    label: "Twitter / X",  ph: "https://x.com/username"                 },
  { id: "facebook",   label: "Facebook",     ph: "https://facebook.com/page"              },
  { id: "linkedin",   label: "LinkedIn",     ph: "https://linkedin.com/in/username"       },
  { id: "youtube",    label: "YouTube",      ph: "https://youtube.com/c/channel"          },
  { id: "tiktok",     label: "TikTok",       ph: "https://tiktok.com/@username"           },
  { id: "snapchat",   label: "Snapchat",     ph: "https://snapchat.com/add/username"      },
  { id: "pinterest",  label: "Pinterest",    ph: "https://pinterest.com/username"         },
  { id: "github",     label: "GitHub",       ph: "https://github.com/username"            },
  { id: "spotify",    label: "Spotify",      ph: "https://open.spotify.com/user/..."      },
  { id: "discord",    label: "Discord",      ph: "https://discord.gg/invite"              },
  { id: "twitch",     label: "Twitch",       ph: "https://twitch.tv/username"             },
  { id: "reddit",     label: "Reddit",       ph: "https://reddit.com/u/username"          },
  { id: "website",    label: "Website",      ph: "https://yourwebsite.com"                },
  { id: "whatsapp",   label: "WhatsApp",     ph: "https://wa.me/phonenumber"              },
  { id: "telegram",   label: "Telegram",     ph: "https://t.me/username"                  },
  { id: "behance",    label: "Behance",      ph: "https://behance.net/username"           },
  { id: "dribbble",   label: "Dribbble",     ph: "https://dribbble.com/username"          },
  { id: "vimeo",      label: "Vimeo",        ph: "https://vimeo.com/username"             },
  { id: "soundcloud", label: "SoundCloud",   ph: "https://soundcloud.com/username"        },
  { id: "medium",     label: "Medium",       ph: "https://medium.com/@username"           },
  { id: "substack",   label: "Substack",     ph: "https://username.substack.com"          },
  { id: "patreon",    label: "Patreon",      ph: "https://patreon.com/username"           },
  { id: "threads",    label: "Threads",      ph: "https://threads.net/@username"          },
  { id: "bluesky",    label: "Bluesky",      ph: "https://bsky.app/profile/username.bsky.social" },
  { id: "mastodon",   label: "Mastodon",     ph: "https://mastodon.social/@username"      },
  { id: "line",       label: "LINE",         ph: "https://line.me/ti/p/~username"         },
  { id: "viber",      label: "Viber",        ph: "viber://chat?number=phonenumber"        },
  { id: "signal",     label: "Signal",       ph: "https://signal.me/#p/phonenumber"       },
  { id: "weibo",      label: "Weibo",        ph: "https://weibo.com/username"             },
  { id: "kakao",      label: "KakaoTalk",    ph: "https://open.kakao.com/..."             },
] as const

const WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]

// ─── Dynamic form state types ─────────────────────────────────────────────────

interface SocialLinkDraft { platform: string; url: string }
interface LinkDraft { label: string; url: string; description: string }
interface MenuItemDraft { name: string; description: string; price: string; allergens: string; isVeg: "veg" | "non-veg" | "" }
interface MenuSectionDraft { category: string; items: MenuItemDraft[] }

function emptyItem(): MenuItemDraft { return { name: "", description: "", price: "", allergens: "", isVeg: "" } }
function emptySection(): MenuSectionDraft { return { category: "", items: [emptyItem()] } }

interface ContentExtras {
  vcardData: VCardData
  socialLinks: SocialLinkDraft[]
  socialProfileName: string
  socialBio: string
  dynamicLinks: LinkDraft[]
  linksTitle: string
  linksBio: string
  menuSections: MenuSectionDraft[]
  restaurantDesc: string
  menuCurrency: string
  businessHoursMap: Record<string, string>
  businessCategory: string
  businessDescription: string
  businessSocialLinks: SocialLinkDraft[]
}

const TYPE_MAP: Record<string, string> = {
  url: "URL", pdf: "PDF", video: "VIDEO", links: "LINKS",
  social: "SOCIAL_MEDIA", vcard: "VCARD", gallery: "IMAGE_GALLERY",
  business: "BUSINESS", app: "APP", mp3: "MP3", menu: "MENU",
  wifi: "WIFI", whatsapp: "WHATSAPP", instagram: "INSTAGRAM",
  facebook: "FACEBOOK", coupon: "COUPON",
}

const FILE_TYPES = new Set(["pdf", "video", "mp3", "gallery"])

const steps = ["Type", "Content", "Design"]

// ─── Edit-mode helpers ────────────────────────────────────────────────────────

/** Reverse-map a backend enum value (e.g. "SOCIAL_MEDIA") to a form key (e.g. "social"). */
function typeEnumToKey(enumVal: string): string {
  return Object.entries(TYPE_MAP).find(([, v]) => v === enumVal)?.[0] ?? "url"
}

/** Custom platform picker — shows brand icon + label in trigger and dropdown */
function SocialPlatformSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const current = SOCIAL_NETWORKS.find((n) => n.id === value)
  return (
    <SelectPrimitive.Root value={value} onValueChange={onChange}>
      <SelectPrimitive.Trigger
        className="flex h-10 items-center gap-1.5 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-2 text-sm text-zinc-900 dark:text-white focus:outline-none focus:border-violet-500 shrink-0"
        style={{ minWidth: 120, flex: "0 0 auto" }}
      >
        <SocialIcon platform={value} size={22} />
        <span className="flex-1 truncate text-left text-xs">{current?.label ?? value}</span>
        <ChevronDown className="h-3.5 w-3.5 text-zinc-400 shrink-0" />
      </SelectPrimitive.Trigger>
      <SelectPrimitive.Portal>
        <SelectPrimitive.Content
          position="popper"
          sideOffset={4}
          className="z-[200] max-h-64 overflow-y-auto rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 shadow-2xl"
          style={{ width: "var(--radix-select-trigger-width)" }}
        >
          <SelectPrimitive.Viewport className="p-1">
            {SOCIAL_NETWORKS.map((n) => (
              <SelectPrimitive.Item
                key={n.id}
                value={n.id}
                className="relative flex items-center gap-2 rounded-lg px-2 py-1.5 text-xs text-zinc-800 dark:text-zinc-200 outline-none cursor-pointer data-[highlighted]:bg-zinc-100 dark:data-[highlighted]:bg-zinc-800 data-[state=checked]:text-violet-400"
              >
                <SocialIcon platform={n.id} size={20} />
                <SelectPrimitive.ItemText>{n.label}</SelectPrimitive.ItemText>
                <SelectPrimitive.ItemIndicator className="ml-auto">
                  <Check className="h-3 w-3 text-violet-400" />
                </SelectPrimitive.ItemIndicator>
              </SelectPrimitive.Item>
            ))}
          </SelectPrimitive.Viewport>
        </SelectPrimitive.Content>
      </SelectPrimitive.Portal>
    </SelectPrimitive.Root>
  )
}

/** Pre-populate form state from an existing QRCode record. */
function populateFormFromQR(
  qr: QRCode,
  reset: (v: Partial<FormValues>) => void,
  setSelectedType: (t: string) => void,
  setPrimaryColor: (c: string) => void,
  setBgColor: (c: string) => void,
  setDotStyle: (s: import("qr-code-styling").DotType) => void,
  setCornerStyle: (s: import("qr-code-styling").CornerSquareType) => void,
  setFrameStyle: (s: string) => void,
  setFrameText: (s: string) => void,
  setFrameBgColor: (s: string) => void,
  setExistingFiles: (f: QRFile[]) => void,
  setLogoUrl: (url: string | null) => void,
  setVcardData: (d: VCardData) => void,
  setPageAccentColor: (c: string) => void,
  setSocialLinks: (v: SocialLinkDraft[]) => void,
  setSocialProfileName: (v: string) => void,
  setSocialBio: (v: string) => void,
  setDynamicLinks: (v: LinkDraft[]) => void,
  setLinksTitle: (v: string) => void,
  setLinksBio: (v: string) => void,
  setMenuSections: (v: MenuSectionDraft[]) => void,
  setRestaurantDesc: (v: string) => void,
  setMenuCurrency: (v: string) => void,
  setBusinessHoursMap: (v: Record<string, string>) => void,
  setBusinessCategory: (v: string) => void,
  setBusinessDescription: (v: string) => void,
  setBusinessSocialLinks: (v: SocialLinkDraft[]) => void,
  setExpiryDate: (v: string) => void,
) {
  const typeKey = typeEnumToKey(qr.type)
  setSelectedType(typeKey)

  if (qr.design) {
    setPrimaryColor(qr.design.primaryColor ?? "#7c3aed")
    setBgColor(qr.design.backgroundColor ?? "#000000")
    setPageAccentColor((qr.design as unknown as Record<string, unknown>).secondaryColor as string ?? "#7c3aed")
    setDotStyle((qr.design.dotStyle ?? "rounded") as import("qr-code-styling").DotType)
    setCornerStyle((qr.design.cornerSquareStyle ?? "square") as import("qr-code-styling").CornerSquareType)
    setFrameStyle(qr.design.frameStyle ?? "none")
    setFrameText((qr.design as unknown as Record<string, unknown>).frameText as string ?? "SCAN ME")
    setFrameBgColor((qr.design as unknown as Record<string, unknown>).frameBgColor as string ?? "#1f2937")
    setLogoUrl(qr.design.logoUrl ?? null)
  }

  setExistingFiles(qr.files ?? [])

  if (typeKey === "vcard" && qr.content?.data) {
    const d = qr.content.data as Record<string, unknown>
    setVcardData({
      profileImage: (d.profileImage as string | null) ?? null,
      firstName: String(d.firstName ?? ""),
      lastName: String(d.lastName ?? ""),
      phones: (d.phones as VCardData["phones"]) ?? [{ value: "", label: "mobile" }],
      emails: (d.emails as VCardData["emails"]) ?? [{ value: "", label: "work" }],
      websites: (d.websites as VCardData["websites"]) ?? [{ value: "", label: "website" }],
      address: String(d.address ?? ""),
      city: String(d.city ?? ""),
      state: String(d.state ?? ""),
      country: String(d.country ?? ""),
      zip: String(d.zip ?? ""),
      company: String(d.company ?? ""),
      profession: String(d.jobTitle ?? ""),
      summary: String(d.summary ?? ""),
      socials: (d.socials as Record<string, string>) ?? {},
    })
  }

  const d = qr.content?.data ?? {}
  const v: Partial<FormValues> = {
    name: qr.name,
    tags: (qr.tags ?? []).join(", "),
  }

  switch (typeKey) {
    case "url":       v.url = String(d.url ?? ""); break
    case "wifi":
      v.ssid = String(d.ssid ?? "")
      v.wifi_password = String(d.password ?? "")
      v.security = String(d.security ?? "wpa2")
      break
    case "whatsapp":  v.phone = String(d.phone ?? ""); v.message = String(d.message ?? ""); break
    case "instagram": v.instagram_username = String(d.username ?? ""); break
    case "facebook":  v.facebook_url = String(d.url ?? ""); break
    case "vcard":
      v.first_name = String(d.firstName ?? "")
      v.last_name = String(d.lastName ?? "")
      v.job_title = String(d.jobTitle ?? "")
      v.company = String(d.company ?? "")
      v.vcard_phone = String(d.phone ?? "")
      v.vcard_email = String(d.email ?? "")
      v.vcard_website = String(d.website ?? "")
      v.vcard_address = String(d.address ?? "")
      break
    case "social":
      v.social_instagram = String(d.instagram ?? "")
      v.social_twitter = String(d.twitter ?? "")
      v.social_linkedin = String(d.linkedin ?? "")
      v.social_youtube = String(d.youtube ?? "")
      v.social_tiktok = String(d.tiktok ?? "")
      break
    case "business":
      v.business_name = String(d.businessName ?? "")
      v.business_phone = String(d.phone ?? "")
      v.business_email = String(d.email ?? "")
      v.business_website = String(d.website ?? "")
      v.business_address = String(d.address ?? "")
      v.business_hours = String(d.hours ?? "")
      break
    case "app":
      v.app_name = String(d.appName ?? "")
      v.ios_url = String(d.iosUrl ?? "")
      v.android_url = String(d.androidUrl ?? "")
      v.app_description = String(d.description ?? "")
      break
    case "menu": {
      v.restaurant_name = String(d.restaurantName ?? "")
      const secs = d.sections as Array<{ name: string; items: Array<{ name: string; price: string }> }> | undefined
      v.section_name = secs?.[0]?.name ?? ""
      v.item_name = secs?.[0]?.items?.[0]?.name ?? ""
      v.item_price = secs?.[0]?.items?.[0]?.price ?? ""
      break
    }
    case "coupon":
      v.coupon_title = String(d.title ?? "")
      v.coupon_discount = String(d.discount ?? "")
      v.coupon_code = String(d.code ?? "")
      v.coupon_valid_until = String(d.validUntil ?? "")
      v.coupon_terms = String(d.terms ?? "")
      break
    case "links": {
      const links = (d.links as Array<{ label?: string; url: string }> | undefined) ?? []
      v.link_title_1 = links[0]?.label ?? ""
      v.link_url_1 = links[0]?.url ?? ""
      v.link_title_2 = links[1]?.label ?? ""
      v.link_url_2 = links[1]?.url ?? ""
      v.link_title_3 = links[2]?.label ?? ""
      v.link_url_3 = links[2]?.url ?? ""
      break
    }
  }

  // ── Restore dynamic state (social, links, menu, business) ────────────────────
  const cd = qr.content?.data as Record<string, unknown> ?? {}

  if (typeKey === "social") {
    setSocialProfileName(String(cd.name ?? ""))
    setSocialBio(String(cd.bio ?? ""))
    const sl = (cd.links as Array<{ platform: string; url: string }>) ?? []
    setSocialLinks(sl.length > 0 ? sl : [{ platform: "instagram", url: "" }])
  }

  if (typeKey === "links") {
    setLinksTitle(String(cd.title ?? ""))
    setLinksBio(String(cd.bio ?? ""))
    const dl = (cd.links as Array<{ label?: string; url: string }>) ?? []
    setDynamicLinks(dl.length > 0 ? dl.map((l) => ({ label: l.label ?? "", url: l.url, description: String((l as Record<string, unknown>).description ?? "") })) : [{ label: "", url: "", description: "" }])
  }

  if (typeKey === "menu") {
    setRestaurantDesc(String(cd.description ?? ""))
    setMenuCurrency(String(cd.currency ?? "₹"))
    const ss = (cd.sections as Array<{ category: string; items: Array<Record<string, unknown>> }>) ?? []
    setMenuSections(ss.length > 0 ? ss.map((s) => ({
      category: s.category ?? "",
      items: Array.isArray(s.items)
        ? s.items.map((item) => ({
          name: String(item.name ?? ""),
          description: String(item.description ?? ""),
          price: String(item.price ?? ""),
          allergens: Array.isArray(item.allergens)
            ? (item.allergens as string[]).join(", ")
            : String(item.allergens ?? ""),
          isVeg: item.isVeg === true ? "veg" : item.isVeg === false ? "non-veg" : ("" as MenuItemDraft["isVeg"]),
        }))
        : [emptyItem()],
    })) : [emptySection()])
  }

  if (typeKey === "business") {
    setBusinessCategory(String(cd.category ?? ""))
    setBusinessDescription(String(cd.description ?? ""))
    const h = cd.hours
    if (h && typeof h === "object" && !Array.isArray(h)) {
      setBusinessHoursMap(h as Record<string, string>)
    }
    const bsl = cd.socialLinks as Array<{ platform: string; url: string }> | undefined
    setBusinessSocialLinks(bsl && bsl.length > 0 ? bsl : [{ platform: "website", url: "" }])
  }

  // Restore expiry date (convert UTC ISO → local date string YYYY-MM-DD)
  setExpiryDate(qr.activeUntil ? qr.activeUntil.slice(0, 10) : "")

  reset(v)
}

// ─── Form types ───────────────────────────────────────────────────────────────

interface FormValues {
  name: string; tags: string; url: string
  ssid: string; wifi_password: string; security: string
  phone: string; message: string
  instagram_username: string; facebook_url: string
  first_name: string; last_name: string; job_title: string; company: string
  vcard_phone: string; vcard_email: string; vcard_website: string; vcard_address: string
  social_instagram: string; social_twitter: string; social_linkedin: string
  social_youtube: string; social_tiktok: string
  business_name: string; business_phone: string; business_email: string
  business_website: string; business_address: string; business_hours: string
  app_name: string; ios_url: string; android_url: string; app_description: string
  restaurant_name: string; section_name: string; item_name: string; item_price: string
  coupon_title: string; coupon_discount: string; coupon_code: string
  coupon_valid_until: string; coupon_terms: string
  link_title_1: string; link_url_1: string
  link_title_2: string; link_url_2: string
  link_title_3: string; link_url_3: string
}

const DEFAULT_VALUES: FormValues = {
  name: "", tags: "", url: "", ssid: "", wifi_password: "", security: "wpa2",
  phone: "", message: "", instagram_username: "", facebook_url: "",
  first_name: "", last_name: "", job_title: "", company: "",
  vcard_phone: "", vcard_email: "", vcard_website: "", vcard_address: "",
  social_instagram: "", social_twitter: "", social_linkedin: "",
  social_youtube: "", social_tiktok: "",
  business_name: "", business_phone: "", business_email: "",
  business_website: "", business_address: "", business_hours: "",
  app_name: "", ios_url: "", android_url: "", app_description: "",
  restaurant_name: "", section_name: "", item_name: "", item_price: "",
  coupon_title: "", coupon_discount: "", coupon_code: "",
  coupon_valid_until: "", coupon_terms: "",
  link_title_1: "", link_url_1: "", link_title_2: "", link_url_2: "",
  link_title_3: "", link_url_3: "",
}

function ensureHttps(raw: string): string {
  const s = raw.trim()
  if (!s) return s
  return /^https?:\/\//i.test(s) ? s : `https://${s}`
}

function buildContent(type: string, v: FormValues, files: UploadedFileInfo[], extras: ContentExtras): Record<string, unknown> {
  const {
    vcardData, socialLinks, socialProfileName, socialBio,
    dynamicLinks, linksTitle, linksBio,
    menuSections, restaurantDesc, menuCurrency,
    businessHoursMap, businessCategory, businessDescription, businessSocialLinks,
  } = extras
  switch (type) {
    case "url":       return { url: ensureHttps(v.url) }
    case "wifi":      return { ssid: v.ssid, password: v.wifi_password, security: v.security }
    case "whatsapp":  return { phone: v.phone, message: v.message }
    case "instagram": return { username: v.instagram_username }
    case "facebook":  return { url: ensureHttps(v.facebook_url) }
    case "vcard":     return buildVCardContent(
      vcardData,
      vcardData.firstName,
      vcardData.lastName,
    )
    case "social": return {
      name: socialProfileName,
      bio: socialBio || undefined,
      links: socialLinks.filter((l) => l.url.trim()),
    }
    case "links": return {
      title: linksTitle,
      bio: linksBio || undefined,
      links: dynamicLinks
        .filter((l) => l.label || l.url)
        .map((l) => ({ label: l.label, url: l.url, description: l.description || undefined })),
    }
    case "business": return {
      businessName: v.business_name,
      category: businessCategory || undefined,
      description: businessDescription || undefined,
      phone: v.business_phone,
      email: v.business_email,
      website: v.business_website,
      address: v.business_address,
      hours: Object.keys(businessHoursMap).length > 0 ? businessHoursMap : undefined,
      socialLinks: businessSocialLinks.filter((l) => l.url.trim()).length > 0
        ? businessSocialLinks.filter((l) => l.url.trim())
        : undefined,
    }
    case "app": return {
      appName: v.app_name, iosUrl: v.ios_url, androidUrl: v.android_url, description: v.app_description,
    }
    case "menu": return {
      restaurantName: v.restaurant_name,
      description: restaurantDesc || undefined,
      currency: menuCurrency || "₹",
      sections: menuSections
        .filter((s) => s.category || s.items.some((i) => i.name))
        .map((s) => ({
          category: s.category,
          items: s.items
            .filter((i) => i.name)
            .map((i) => ({
              name: i.name,
              description: i.description || undefined,
              price: i.price,
              allergens: i.allergens
                ? i.allergens.split(",").map((a) => a.trim()).filter(Boolean)
                : [],
              isVeg: i.isVeg === "veg" ? true : i.isVeg === "non-veg" ? false : undefined,
            })),
        })),
    }
    case "coupon": return {
      title: v.coupon_title, discount: v.coupon_discount, code: v.coupon_code,
      expiresAt: v.coupon_valid_until || undefined,
      terms: v.coupon_terms,
    }
    case "pdf":
    case "video":
    case "mp3":     return { files }
    case "gallery": return { images: files }
    default:        return {}
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Draw the logo clipped to a circle with a white background, return a PNG data URL. */
function makeCircularDataUrl(src: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new window.Image()
    img.crossOrigin = "anonymous"
    img.onload = () => {
      const size = 256
      const canvas = document.createElement("canvas")
      canvas.width = size
      canvas.height = size
      const ctx = canvas.getContext("2d")!
      // White circle background
      ctx.beginPath()
      ctx.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2)
      ctx.fillStyle = "#ffffff"
      ctx.fill()
      // Clip to circle and draw logo centred
      ctx.save()
      ctx.beginPath()
      ctx.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2)
      ctx.clip()
      const scale = Math.min(size / img.width, size / img.height)
      const w = img.width * scale
      const h = img.height * scale
      ctx.drawImage(img, (size - w) / 2, (size - h) / 2, w, h)
      ctx.restore()
      resolve(canvas.toDataURL("image/png"))
    }
    img.onerror = reject
    img.src = src.startsWith("/") ? `${window.location.origin}${src}` : src
  })
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function CreateQRPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { id } = useParams<{ id?: string }>()
  const isEdit = !!id

  const [step, setStep] = useState(0)
  const [selectedType, setSelectedType] = useState("url")
  const [selectedCategory, setSelectedCategory] = useState("all")
  const [primaryColor, setPrimaryColor] = useState("#7c3aed")
  const [bgColor, setBgColor] = useState("#000000")
  const [pageAccentColor, setPageAccentColor] = useState("#7c3aed")
  const [dotStyle, setDotStyle] = useState<DotType>("rounded")
  const [cornerStyle, setCornerStyle] = useState<CornerSquareType>("square")
  const [frameStyle, setFrameStyle] = useState("none")
  const [frameText, setFrameText] = useState("SCAN ME")
  const [frameBgColor, setFrameBgColor] = useState("#1f2937")
  const [logoUrl, setLogoUrl] = useState<string | null>(null)
  const [circularLogoUrl, setCircularLogoUrl] = useState<string | null>(null)
  const [logoSize, setLogoSize] = useState(35)
  const [isLogoUploading, setIsLogoUploading] = useState(false)
  const [vcardData, setVcardData] = useState<VCardData>(DEFAULT_VCARD_DATA)
  const [previewTab, setPreviewTab] = useState<"qr" | "scan">("scan")
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFileInfo[]>([])
  const [existingFiles, setExistingFiles] = useState<QRFile[]>([])
  const [isUploading, setIsUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [expiryDate, setExpiryDate] = useState<string>("")
  const [showImportModal, setShowImportModal] = useState(false)
  const [importNotice, setImportNotice] = useState<string | null>(null)

  // Subscription info — needed to gate expiry picker and set max date
  const { data: subData } = useQuery({
    queryKey: ["subscription"],
    queryFn: getSubscription,
    staleTime: 5 * 60 * 1000,
  })
  const subInfo = subData?.data

  // Billing usage — needed to enforce QR limit wall when trial has expired
  const { data: usageData } = useQuery({
    queryKey: ["billing-usage-create"],
    queryFn: getBillingUsage,
    staleTime: 60 * 1000,
    enabled: !isEdit, // only matters when creating new QRs
  })
  const qrUsed = usageData?.data.qrCodes.used ?? 0
  const qrLimit = usageData?.data.qrCodes.limit ?? 0
  // Show upgrade wall when trial has expired and user is on FREE plan (0 QR limit)
  const trialExpiredAtLimit = !isEdit && !subInfo?.isTrialing
    && (subInfo?.planName === "FREE" || subInfo?.planName == null)
    && (qrLimit === 0 || qrUsed >= qrLimit)

  // ── Dynamic form state (social / links / menu / business) ──────────────────
  const [socialLinks, setSocialLinks] = useState<SocialLinkDraft[]>([{ platform: "instagram", url: "" }])
  const [socialProfileName, setSocialProfileName] = useState("")
  const [socialBio, setSocialBio] = useState("")
  const [dynamicLinks, setDynamicLinks] = useState<LinkDraft[]>([{ label: "", url: "", description: "" }])
  const [linksTitle, setLinksTitle] = useState("")
  const [linksBio, setLinksBio] = useState("")
  const [menuSections, setMenuSections] = useState<MenuSectionDraft[]>([emptySection()])
  const [restaurantDesc, setRestaurantDesc] = useState("")
  const [menuCurrency, setMenuCurrency] = useState("₹")
  const [businessHoursMap, setBusinessHoursMap] = useState<Record<string, string>>({})
  const [businessCategory, setBusinessCategory] = useState("")
  const [businessDescription, setBusinessDescription] = useState("")
  const [businessSocialLinks, setBusinessSocialLinks] = useState<SocialLinkDraft[]>([{ platform: "website", url: "" }])

  const fileInputRef = useRef<HTMLInputElement>(null)
  const logoInputRef = useRef<HTMLInputElement>(null)
  const qrRef = useRef<HTMLDivElement>(null)
  const qrInstance = useRef<QRCodeStyling | null>(null)

  const { register, handleSubmit, control, reset, formState: { errors } } = useForm<FormValues>({
    defaultValues: DEFAULT_VALUES,
  })

  /**
   * Pre-fills the creation form from a QR code decoded elsewhere (e.g. a photo
   * of an existing static/third-party code). This never touches the code that
   * was scanned — it only seeds a brand-new dynamic QR with the same content.
   */
  function handleImportedQR(parsed: ParsedQR) {
    setShowImportModal(false)
    setImportNotice(null)

    switch (parsed.type) {
      case "url":
        setSelectedType("url")
        reset({ ...DEFAULT_VALUES, url: parsed.url })
        setStep(1)
        break
      case "wifi": {
        const securityMap: Record<string, string> = { WPA: "wpa2", WEP: "wep", nopass: "none" }
        setSelectedType("wifi")
        reset({
          ...DEFAULT_VALUES,
          ssid: parsed.ssid,
          wifi_password: parsed.password ?? "",
          security: securityMap[parsed.security] ?? "wpa2",
        })
        setStep(1)
        break
      }
      case "whatsapp":
        setSelectedType("whatsapp")
        reset({ ...DEFAULT_VALUES, phone: parsed.phone, message: parsed.message ?? "" })
        setStep(1)
        break
      case "vcard": {
        const [firstName, ...rest] = (parsed.fullName ?? "").split(" ")
        setSelectedType("vcard")
        reset({ ...DEFAULT_VALUES })
        setVcardData({
          ...DEFAULT_VCARD_DATA,
          firstName: firstName ?? "",
          lastName: rest.join(" "),
          phones: parsed.phones.length ? parsed.phones.map((p) => ({ value: p, label: "mobile" })) : DEFAULT_VCARD_DATA.phones,
          emails: parsed.emails.length ? parsed.emails.map((e) => ({ value: e, label: "work" })) : DEFAULT_VCARD_DATA.emails,
          websites: parsed.url ? [{ value: parsed.url, label: "website" }] : DEFAULT_VCARD_DATA.websites,
          address: parsed.address ?? "",
          company: parsed.org ?? "",
          profession: parsed.title ?? "",
          summary: parsed.note ?? "",
        })
        setStep(1)
        break
      }
      default: {
        // sms, tel, email, plain text — no matching GenXQR QR type to auto-fill
        // into yet. Surface what was decoded so the user can copy it manually.
        const raw =
          parsed.type === "tel"   ? parsed.phone :
          parsed.type === "sms"   ? `${parsed.phone}${parsed.body ? ` — ${parsed.body}` : ""}` :
          parsed.type === "email" ? parsed.address :
          parsed.text
        setImportNotice(`Decoded a ${parsed.type} code — GenXQR doesn't have a matching QR type for that yet. Here's what it contained: "${raw}"`)
      }
    }
  }

  // Fetch existing QR when editing
  const { data: existingQR } = useQuery({
    queryKey: ["qr", id],
    queryFn: () => getQR(id!),
    enabled: isEdit,
    staleTime: Infinity,
  })

  // Pre-populate form once existing data is loaded
  useEffect(() => {
    if (!existingQR?.data) return
    populateFormFromQR(
      existingQR.data,
      reset,
      setSelectedType,
      setPrimaryColor,
      setBgColor,
      setDotStyle,
      setCornerStyle,
      setFrameStyle,
      setFrameText,
      setFrameBgColor,
      setExistingFiles,
      setLogoUrl,
      setVcardData,
      setPageAccentColor,
      setSocialLinks,
      setSocialProfileName,
      setSocialBio,
      setDynamicLinks,
      setLinksTitle,
      setLinksBio,
      setMenuSections,
      setRestaurantDesc,
      setMenuCurrency,
      setBusinessHoursMap,
      setBusinessCategory,
      setBusinessDescription,
      setBusinessSocialLinks,
      setExpiryDate,
    )
    if (existingQR.data.design?.logoSize) {
      setLogoSize(existingQR.data.design.logoSize)
    }
  }, [existingQR, reset])

  const { mutateAsync: submitCreate, isPending: isCreating } = useMutation({
    mutationFn: (payload: CreateQRPayload) => createQR(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["qr-codes"] })
      navigate("/app/dashboard")
    },
  })

  const { mutateAsync: submitUpdate, isPending: isUpdating } = useMutation({
    mutationFn: (payload: Partial<CreateQRPayload>) => updateQR(id!, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["qr-codes"] })
      queryClient.invalidateQueries({ queryKey: ["qr", id] })
      navigate("/app/dashboard")
    },
  })

  const isPending = isCreating || isUpdating

  // Initialise qr-code-styling once — DOM manipulation, not data fetching
  useEffect(() => {
    qrInstance.current = new QRCodeStyling({
      width: 200, height: 200, type: "svg",
      data: "https://genxqr.streamsnatcher.com/preview",
      dotsOptions: { color: primaryColor, type: dotStyle },
      cornersSquareOptions: { color: primaryColor, type: cornerStyle },
      cornersDotOptions: { color: primaryColor },
      backgroundOptions: { color: bgColor },
      imageOptions: { hideBackgroundDots: true, imageSize: logoSize / 100, margin: 8, crossOrigin: "anonymous" },
      qrOptions: { errorCorrectionLevel: "H" },
      margin: 16,
    })
    if (qrRef.current) {
      qrRef.current.innerHTML = ""
      qrInstance.current.append(qrRef.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Update preview on every style/colour change
  useEffect(() => {
    qrInstance.current?.update({
      dotsOptions: { color: primaryColor, type: dotStyle },
      cornersSquareOptions: { color: primaryColor, type: cornerStyle },
      cornersDotOptions: { color: primaryColor },
      backgroundOptions: { color: bgColor },
    })
  }, [primaryColor, bgColor, dotStyle, cornerStyle])

  // Convert logoUrl to a circular PNG, then push it to the QR preview
  useEffect(() => {
    if (!logoUrl) {
      setCircularLogoUrl(null)
      return
    }
    makeCircularDataUrl(logoUrl)
      .then(setCircularLogoUrl)
      .catch(() => setCircularLogoUrl(logoUrl)) // fallback: use original on error
  }, [logoUrl])

  useEffect(() => {
    qrInstance.current?.update({ image: circularLogoUrl ?? undefined })
  }, [circularLogoUrl])

  // Update logo size in preview when slider changes
  useEffect(() => {
    qrInstance.current?.update({
      imageOptions: { hideBackgroundDots: true, imageSize: logoSize / 100, margin: 8, crossOrigin: "anonymous" },
    })
  }, [logoSize])

  // Re-append QR SVG if the container was hidden during initialisation
  useEffect(() => {
    if (previewTab !== "qr") return
    if (!qrRef.current || !qrInstance.current) return
    if (qrRef.current.children.length === 0) {
      qrInstance.current.append(qrRef.current)
    }
  }, [previewTab])

  const handleLogoChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > LOGO_MAX_BYTES) {
      alert("Logo must be under 1 MB. Use a smaller PNG or SVG.")
      if (logoInputRef.current) logoInputRef.current.value = ""
      return
    }
    setIsLogoUploading(true)
    try {
      const info = await uploadFile(file, "image")
      setLogoUrl(info.tempUrl)
    } catch {
      // logo is optional — silently discard
    } finally {
      setIsLogoUploading(false)
      if (logoInputRef.current) logoInputRef.current.value = ""
    }
  }, [])

  const handleFileChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const uploadType = selectedType === "gallery" ? "image" : (selectedType as "pdf" | "video" | "mp3")
    setIsUploading(true)
    setUploadError(null)
    try {
      const info = await uploadFile(file, uploadType)
      setUploadedFiles((prev) => [...prev, info])
    } catch (err) {
      setUploadError(err instanceof ApiError ? err.message : "Upload failed")
    } finally {
      setIsUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ""
    }
  }, [selectedType])

  const onSubmit = handleSubmit(
    async (values) => {
      setSubmitError(null)
      const payload: CreateQRPayload = {
        name: values.name,
        type: TYPE_MAP[selectedType] ?? "URL",
        category: "DYNAMIC",
        content: { data: buildContent(selectedType, values, uploadedFiles, {
          vcardData,
          socialLinks, socialProfileName, socialBio,
          dynamicLinks, linksTitle, linksBio,
          menuSections, restaurantDesc, menuCurrency,
          businessHoursMap, businessCategory, businessDescription, businessSocialLinks,
        }) },
        design: {
          primaryColor,
          backgroundColor: bgColor,
          dotStyle: dotStyle as string,
          cornerSquareStyle: cornerStyle as string,
          frameStyle,
          frameText,
          frameBgColor,
          logoSize,
          ...(logoUrl ? { logoUrl } : {}),
          ...(pageAccentColor ? { secondaryColor: pageAccentColor } : {}),
        },
        tags: values.tags ? values.tags.split(",").map((t) => t.trim()).filter(Boolean) : [],
        // In edit mode, only send newly uploaded files; existing files stay in DB untouched
        uploadedFiles: FILE_TYPES.has(selectedType) ? uploadedFiles : [],
        settings: {
          // Send activeUntil if set; send null explicitly in edit mode to allow clearing
          activeUntil: expiryDate
            ? `${expiryDate}T23:59:59.000Z`
            : isEdit ? null : undefined,
        },
      }
      try {
        if (isEdit) {
          await submitUpdate(payload)
        } else {
          await submitCreate(payload)
        }
      } catch (err) {
        setSubmitError(
          err instanceof ApiError
            ? err.message
            : isEdit ? "Failed to update QR code" : "Failed to create QR code"
        )
      }
    },
    // If validation fails (e.g. name empty), jump back to step 2
    () => { setStep(1) }
  )

  const filteredTypes = selectedCategory === "all"
    ? qrTypes
    : qrTypes.filter((t) => t.category === selectedCategory)

  // ── Upgrade wall: shown when trial expired + at FREE QR limit ─────────────
  if (trialExpiredAtLimit) {
    return (
      <div className="space-y-6 animate-fade-in">
        <div className="flex items-center gap-4">
          <Link to="/app/dashboard">
            <button className="w-9 h-9 rounded-xl bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white transition-colors">
              <ArrowLeft size={16} />
            </button>
          </Link>
          <div>
            <h1 className="text-xl font-bold text-zinc-900 dark:text-white">Create QR Code</h1>
            <p className="text-zinc-500 text-sm">Your free plan limit has been reached</p>
          </div>
        </div>

        <div className="max-w-lg mx-auto text-center py-16 px-6">
          <div className="w-16 h-16 rounded-2xl bg-violet-500/10 border border-violet-500/20 flex items-center justify-center mx-auto mb-6">
            <QrCode size={28} className="text-violet-400" />
          </div>
          <h2 className="text-2xl font-bold text-zinc-900 dark:text-white mb-3">
            You've reached your QR limit
          </h2>
          <p className="text-zinc-500 text-sm mb-2">
            You're on the <span className="text-zinc-300 font-medium">Free plan</span> which allows up to <span className="text-zinc-300 font-medium">{qrLimit} QR codes</span>.
          </p>
          <p className="text-zinc-500 text-sm mb-8">
            Upgrade to a paid plan to create unlimited QR codes, unlock analytics, custom branding, and more.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Link to="/app/billing">
              <button className="w-full sm:w-auto px-6 py-3 rounded-xl bg-violet-600 hover:bg-violet-500 text-white font-semibold text-sm transition-colors shadow-[0_0_20px_rgba(124,58,237,0.3)]">
                View plans & upgrade
              </button>
            </Link>
            <Link to="/app/dashboard">
              <button className="w-full sm:w-auto px-6 py-3 rounded-xl bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-300 font-medium text-sm transition-colors">
                Back to dashboard
              </button>
            </Link>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link to="/app/dashboard">
          <button className="w-9 h-9 rounded-xl bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white transition-colors">
            <ArrowLeft size={16} />
          </button>
        </Link>
        <div>
          <h1 className="text-xl font-bold text-zinc-900 dark:text-white">{isEdit ? "Edit QR Code" : "Create QR Code"}</h1>
          <p className="text-zinc-500 text-sm">{isEdit ? "Update your QR code content and design" : "Follow the steps to create your QR code"}</p>
        </div>
      </div>

      {/* Trial notice — shown while still in trial */}
      {!isEdit && subInfo?.isTrialing && subInfo.subscription?.trialEndsAt && (() => {
        const diff = new Date(subInfo.subscription.trialEndsAt).getTime() - Date.now()
        const days = Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)))
        return (
          <div className={cn(
            "rounded-xl border px-4 py-2.5 flex items-center gap-2.5 text-sm",
            days <= 3
              ? "bg-red-500/10 border-red-500/20 text-red-300"
              : days <= 7
              ? "bg-amber-500/10 border-amber-500/20 text-amber-300"
              : "bg-violet-500/10 border-violet-500/20 text-violet-300"
          )}>
            <Clock size={14} className="shrink-0" />
            <span>
              {days === 0
                ? "Your trial has expired. "
                : `${days} day${days === 1 ? "" : "s"} left in your trial. `
              }
              <Link to="/app/billing" className="underline underline-offset-2 hover:opacity-80 transition-opacity font-medium">
                Upgrade now
              </Link>{" "}to keep full access after it ends.
            </span>
          </div>
        )
      })()}

      <Tabs.Root
        value={String(step)}
        onValueChange={(v) => {
          const next = Number(v)
          setStep(next)
          // Automatically show QR Code tab on Design step so colour changes are visible
          setPreviewTab(next === 2 ? "qr" : "scan")
        }}
        className="w-full"
      >
        <Tabs.List className="flex items-center gap-0 mb-6">
          {steps.map((label, i) => (
            <div key={label} className="flex items-center">
              <Tabs.Trigger
                value={String(i)}
                disabled={i > step}
                className="flex items-center gap-2 outline-none group"
              >
                <div className={cn(
                  "step-indicator transition-colors",
                  i < step ? "completed" : i === step ? "active" : "inactive group-disabled:opacity-50"
                )}>
                  {i < step ? <Check size={14} /> : i + 1}
                </div>
                <span className={cn(
                  "text-sm font-medium transition-colors",
                  i === step ? "text-zinc-900 dark:text-white"
                    : i < step ? "text-violet-400"
                    : "text-zinc-600 group-disabled:opacity-50"
                )}>{label}</span>
              </Tabs.Trigger>
              {i < steps.length - 1 && (
                <div className={cn("w-16 h-px mx-3", i < step ? "bg-violet-500/40" : "bg-zinc-200 dark:bg-zinc-800")} />
              )}
            </div>
          ))}
        </Tabs.List>

        <div className="grid lg:grid-cols-[1fr_340px] gap-6">
          {/* ── Left panel ── */}
          <div className="glass-card p-6 rounded-2xl">

            {/* STEP 1 — Select Type */}
            {step === 0 && (
              <div>
                <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
                  <h2 className="text-zinc-900 dark:text-white font-semibold text-lg">Select QR Code Type</h2>
                  <button
                    type="button"
                    onClick={() => setShowImportModal(true)}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-200 dark:border-zinc-800 px-3 py-1.5 text-xs font-medium text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white hover:border-zinc-300 dark:hover:border-zinc-700 transition-colors"
                  >
                    <ScanLine size={13} />
                    Import from existing QR
                  </button>
                </div>

                {importNotice && (
                  <div className="mb-5 flex items-start gap-2.5 rounded-xl border border-violet-500/20 bg-violet-500/5 p-3.5">
                    <ScanLine size={15} className="text-violet-400 mt-0.5 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-zinc-700 dark:text-zinc-300 text-xs leading-relaxed break-words">{importNotice}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setImportNotice(null)}
                      className="text-zinc-500 hover:text-zinc-900 dark:hover:text-white transition-colors shrink-0"
                      aria-label="Dismiss"
                    >
                      <X size={14} />
                    </button>
                  </div>
                )}

                <div className="flex gap-2 mb-5 flex-wrap">
                  {["all", "basic", "file", "page"].map((cat) => (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => setSelectedCategory(cat)}
                      className={cn(
                        "px-3 py-1.5 rounded-lg text-xs font-medium capitalize transition-all",
                        selectedCategory === cat
                          ? "bg-violet-600 text-white"
                          : "bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white"
                      )}
                    >
                      {cat}
                    </button>
                  ))}
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {filteredTypes.map((type) => (
                    <button
                      key={type.id}
                      type="button"
                      onClick={() => setSelectedType(type.id)}
                      className={cn(
                        "qr-type-card rounded-xl p-4 text-left flex items-start gap-3",
                        selectedType === type.id && "selected"
                      )}
                    >
                      <span className={cn("mt-0.5 shrink-0", selectedType === type.id ? "text-violet-400" : "text-zinc-500")}>
                        {type.icon}
                      </span>
                      <div>
                        <div className="text-zinc-900 dark:text-white text-sm font-medium leading-tight">{type.label}</div>
                        <div className="text-zinc-600 text-xs mt-1 leading-tight">{type.desc}</div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* STEP 2 — Content */}
            {step === 1 && (
              <div>
                <h2 className="text-zinc-900 dark:text-white font-semibold text-lg mb-4">
                  {qrTypes.find((t) => t.id === selectedType)?.label} Content
                </h2>
                <div className="space-y-4 max-w-lg">

                  {/* Name — always required */}
                  <div>
                    <label className="label-text">QR Code Name</label>
                    <Input
                      {...register("name", { required: true })}
                      placeholder="e.g. Restaurant Menu — Spring 2026"
                      className={errors.name ? "border-red-500 focus-visible:ring-red-500" : ""}
                    />
                    {errors.name && <p className="text-red-400 text-xs mt-1">Name is required</p>}
                  </div>

                  {/* URL */}
                  {selectedType === "url" && (
                    <div>
                      <label className="label-text">Website URL</label>
                      <Input {...register("url")} placeholder="https://example.com" />
                    </div>
                  )}

                  {/* WiFi */}
                  {selectedType === "wifi" && (
                    <>
                      <div>
                        <label className="label-text">Network Name (SSID)</label>
                        <Input {...register("ssid")} placeholder="MyWiFiNetwork" />
                      </div>
                      <div>
                        <label className="label-text">Password</label>
                        <Input {...register("wifi_password")} type="password" placeholder="••••••••" />
                      </div>
                      <div>
                        <label className="label-text mb-1 block">Security Type</label>
                        <Controller
                          name="security"
                          control={control}
                          render={({ field }) => (
                            <Select value={field.value} onValueChange={field.onChange}>
                              <SelectTrigger className="input-field bg-transparent h-10 px-3 py-2">
                                <SelectValue placeholder="Select security" />
                              </SelectTrigger>
                              <SelectContent className="bg-white dark:bg-zinc-950 border-zinc-200 dark:border-zinc-800 text-zinc-700 dark:text-zinc-300">
                                <SelectItem value="wpa2">WPA/WPA2</SelectItem>
                                <SelectItem value="wep">WEP</SelectItem>
                                <SelectItem value="none">None (open network)</SelectItem>
                              </SelectContent>
                            </Select>
                          )}
                        />
                      </div>
                    </>
                  )}

                  {/* WhatsApp */}
                  {selectedType === "whatsapp" && (
                    <>
                      <div>
                        <label className="label-text">Phone Number (with country code)</label>
                        <Input {...register("phone")} placeholder="+91 98765 43210" />
                      </div>
                      <div>
                        <label className="label-text">Pre-filled Message (optional)</label>
                        <textarea
                          {...register("message")}
                          placeholder="Hello! I scanned your QR code..."
                          rows={3}
                          className="input-field resize-none"
                        />
                      </div>
                    </>
                  )}

                  {/* Instagram */}
                  {selectedType === "instagram" && (
                    <div>
                      <label className="label-text">Instagram Username</label>
                      <div className="flex">
                        <span className="flex items-center px-3 bg-zinc-100 dark:bg-zinc-800 border border-r-0 border-zinc-300 dark:border-zinc-800 rounded-l-xl text-zinc-500 dark:text-zinc-400 text-sm">@</span>
                        <Input {...register("instagram_username")} className="rounded-l-none !border-l-0" placeholder="yourusername" />
                      </div>
                    </div>
                  )}

                  {/* Facebook */}
                  {selectedType === "facebook" && (
                    <div>
                      <label className="label-text">Facebook Page or Profile URL</label>
                      <Input {...register("facebook_url")} placeholder="https://facebook.com/yourpage" />
                    </div>
                  )}

                  {/* vCard */}
                  {selectedType === "vcard" && (
                    <VCardEditor value={vcardData} onChange={setVcardData} />
                  )}

                  {/* File types */}
                  {FILE_TYPES.has(selectedType) && (
                    <div>
                      <label className="label-text">
                        Upload File{selectedType === "gallery" ? "s" : ""}
                      </label>
                      <input
                        ref={fileInputRef}
                        type="file"
                        className="hidden"
                        accept={
                          selectedType === "pdf"     ? ".pdf" :
                          selectedType === "video"   ? "video/*" :
                          selectedType === "mp3"     ? "audio/mpeg,.mp3" :
                          "image/jpeg,image/png,image/webp"
                        }
                        onChange={handleFileChange}
                      />
                      <div
                        className="border-2 border-dashed border-zinc-300 dark:border-zinc-700 hover:border-violet-500/50 rounded-xl p-8 text-center cursor-pointer transition-colors"
                        onClick={() => fileInputRef.current?.click()}
                      >
                        {isUploading ? (
                          <>
                            <Loader2 size={24} className="mx-auto mb-2 text-violet-400 animate-spin" />
                            <p className="text-zinc-400 text-sm">Uploading…</p>
                          </>
                        ) : (
                          <>
                            <Upload size={24} className="mx-auto mb-2 text-zinc-500" />
                            <p className="text-zinc-400 text-sm">Click to upload</p>
                            <p className="text-zinc-600 text-xs mt-1">
                              {selectedType === "pdf"     && "PDF up to 100 MB"}
                              {selectedType === "video"   && "Video up to 250 MB"}
                              {selectedType === "mp3"     && "MP3 up to 25 MB"}
                              {selectedType === "gallery" && "JPG, PNG, WebP up to 10 MB each"}
                            </p>
                          </>
                        )}
                      </div>
                      {uploadError && <p className="text-red-400 text-xs mt-2">{uploadError}</p>}
                      {/* Existing files (already committed to DB in edit mode) */}
                      {existingFiles.length > 0 && (
                        <div className="mt-3">
                          <p className="text-zinc-500 text-xs mb-1">Existing files:</p>
                          <ul className="space-y-1">
                            {existingFiles.map((f) => (
                              <li key={f.id} className="flex items-center justify-between bg-zinc-100 dark:bg-zinc-800/40 rounded-lg px-3 py-2 text-sm">
                                <span className="text-zinc-400 truncate max-w-[220px]">{f.fileName}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                      {uploadedFiles.length > 0 && (
                        <ul className="mt-3 space-y-1">
                          {uploadedFiles.map((f, i) => (
                            <li key={i} className="flex items-center justify-between bg-zinc-100 dark:bg-zinc-800/60 rounded-lg px-3 py-2 text-sm">
                              <span className="text-zinc-700 dark:text-zinc-300 truncate max-w-[220px]">{f.fileName}</span>
                              <button
                                type="button"
                                onClick={() => setUploadedFiles((prev) => prev.filter((_, idx) => idx !== i))}
                                className="text-zinc-500 hover:text-red-400 ml-2 shrink-0"
                              >
                                <X size={14} />
                              </button>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  )}

                  {/* Social Media */}
                  {selectedType === "social" && (
                    <div className="space-y-4">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <label className="label-text">Profile Name</label>
                          <Input value={socialProfileName} onChange={(e) => setSocialProfileName(e.target.value)} placeholder="Your Name" />
                        </div>
                        <div>
                          <label className="label-text">Bio (optional)</label>
                          <Input value={socialBio} onChange={(e) => setSocialBio(e.target.value)} placeholder="Short bio…" />
                        </div>
                      </div>
                      <div>
                        <label className="label-text">Social Networks</label>
                        <div className="space-y-2 mt-1">
                          {socialLinks.map((link, i) => (
                              <div key={i} className="flex gap-2 items-center">
                                <SocialPlatformSelect
                                  value={link.platform}
                                  onChange={(v) => {
                                    const updated = [...socialLinks]
                                    updated[i] = { ...updated[i], platform: v }
                                    setSocialLinks(updated)
                                  }}
                                />
                                <Input
                                  value={link.url}
                                  onChange={(e) => {
                                    const updated = [...socialLinks]
                                    updated[i] = { ...updated[i], url: e.target.value }
                                    setSocialLinks(updated)
                                  }}
                                  placeholder={SOCIAL_NETWORKS.find((n) => n.id === link.platform)?.ph ?? "https://…"}
                                />
                                {socialLinks.length > 1 && (
                                  <button
                                    type="button"
                                    onClick={() => setSocialLinks((prev) => prev.filter((_, idx) => idx !== i))}
                                    className="text-zinc-500 hover:text-red-400 shrink-0"
                                  >
                                    <X size={14} />
                                  </button>
                                )}
                              </div>
                            ))}
                        </div>
                        {socialLinks.length < 30 && (
                          <button
                            type="button"
                            onClick={() => setSocialLinks((prev) => [...prev, { platform: "website", url: "" }])}
                            className="mt-2 text-violet-400 text-xs hover:text-violet-300 flex items-center gap-1"
                          >
                            + Add Network
                          </button>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Multi-Link */}
                  {selectedType === "links" && (
                    <div className="space-y-4">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <label className="label-text">Page Title</label>
                          <Input value={linksTitle} onChange={(e) => setLinksTitle(e.target.value)} placeholder="My Links" />
                        </div>
                        <div>
                          <label className="label-text">Bio (optional)</label>
                          <Input value={linksBio} onChange={(e) => setLinksBio(e.target.value)} placeholder="Short bio…" />
                        </div>
                      </div>
                      <div>
                        <label className="label-text">Links</label>
                        <div className="space-y-3 mt-1">
                          {dynamicLinks.map((link, i) => (
                            <div key={i} className="bg-zinc-50 dark:bg-zinc-900/50 border border-zinc-200 dark:border-zinc-800 rounded-xl p-3 space-y-2">
                              <div className="flex gap-2 items-center">
                                <Input
                                  value={link.label}
                                  onChange={(e) => {
                                    const updated = [...dynamicLinks]
                                    updated[i] = { ...updated[i], label: e.target.value }
                                    setDynamicLinks(updated)
                                  }}
                                  placeholder="Button label"
                                  style={{ width: "auto", flex: "0 0 120px" }}
                                />
                                <Input
                                  value={link.url}
                                  onChange={(e) => {
                                    const updated = [...dynamicLinks]
                                    updated[i] = { ...updated[i], url: e.target.value }
                                    setDynamicLinks(updated)
                                  }}
                                  placeholder="https://…"
                                />
                                {dynamicLinks.length > 1 && (
                                  <button
                                    type="button"
                                    onClick={() => setDynamicLinks((prev) => prev.filter((_, idx) => idx !== i))}
                                    className="text-zinc-500 hover:text-red-400 shrink-0"
                                  >
                                    <X size={14} />
                                  </button>
                                )}
                              </div>
                              <Input
                                value={link.description}
                                onChange={(e) => {
                                  const updated = [...dynamicLinks]
                                  updated[i] = { ...updated[i], description: e.target.value }
                                  setDynamicLinks(updated)
                                }}
                                placeholder="Short description (optional)"
                                className="text-xs"
                              />
                            </div>
                          ))}
                        </div>
                        <button
                          type="button"
                          onClick={() => setDynamicLinks((prev) => [...prev, { label: "", url: "", description: "" }])}
                          className="mt-2 text-violet-400 text-xs hover:text-violet-300 flex items-center gap-1"
                        >
                          + Add Link
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Business Info */}
                  {selectedType === "business" && (
                    <div className="space-y-4">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <label className="label-text">Business Name</label>
                          <Input {...register("business_name")} placeholder="Acme Restaurant" />
                        </div>
                        <div>
                          <label className="label-text">Category (optional)</label>
                          <Input value={businessCategory} onChange={(e) => setBusinessCategory(e.target.value)} placeholder="Restaurant, Retail…" />
                        </div>
                      </div>
                      <div>
                        <label className="label-text">Description (optional)</label>
                        <textarea
                          value={businessDescription}
                          onChange={(e) => setBusinessDescription(e.target.value)}
                          rows={2}
                          placeholder="Short business description…"
                          className="input-field resize-none w-full"
                        />
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <label className="label-text">Phone</label>
                          <Input {...register("business_phone")} placeholder="+91 98765 43210" />
                        </div>
                        <div>
                          <label className="label-text">Email</label>
                          <Input {...register("business_email")} placeholder="info@acme.com" />
                        </div>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <label className="label-text">Website</label>
                          <Input {...register("business_website")} placeholder="https://acme.com" />
                        </div>
                        <div>
                          <label className="label-text">Address</label>
                          <Input {...register("business_address")} placeholder="123 MG Road, Mumbai" />
                        </div>
                      </div>
                      <div>
                        <label className="label-text">Business Hours</label>
                        <div className="space-y-1.5 mt-1">
                          {WEEKDAYS.map((day) => (
                            <div key={day} className="flex items-center gap-2">
                              <span className="text-zinc-500 text-xs shrink-0" style={{ width: "72px" }}>{day.slice(0, 3)}</span>
                              <Input
                                value={businessHoursMap[day.toLowerCase()] ?? ""}
                                onChange={(e) => setBusinessHoursMap((prev) => ({ ...prev, [day.toLowerCase()]: e.target.value }))}
                                placeholder="9am – 5pm  (blank = Closed)"
                                className="text-xs"
                              />
                            </div>
                          ))}
                        </div>
                      </div>
                      <div>
                        <div className="flex items-center justify-between mb-2">
                          <label className="label-text">Social Links (optional)</label>
                          <button
                            type="button"
                            onClick={() => setBusinessSocialLinks((prev) => [...prev, { platform: "website", url: "" }])}
                            className="text-violet-400 text-xs hover:text-violet-300"
                          >
                            + Add
                          </button>
                        </div>
                        <div className="space-y-2">
                          {businessSocialLinks.map((link, i) => (
                              <div key={i} className="flex gap-2 items-center">
                                <SocialPlatformSelect
                                  value={link.platform}
                                  onChange={(v) => {
                                    const updated = [...businessSocialLinks]
                                    updated[i] = { ...updated[i], platform: v }
                                    setBusinessSocialLinks(updated)
                                  }}
                                />
                                <Input
                                  value={link.url}
                                  onChange={(e) => {
                                    const updated = [...businessSocialLinks]
                                    updated[i] = { ...updated[i], url: e.target.value }
                                    setBusinessSocialLinks(updated)
                                  }}
                                  placeholder={SOCIAL_NETWORKS.find((n) => n.id === link.platform)?.ph ?? "https://…"}
                                />
                                {businessSocialLinks.length > 1 && (
                                  <button
                                    type="button"
                                    onClick={() => setBusinessSocialLinks((prev) => prev.filter((_, idx) => idx !== i))}
                                    className="text-zinc-500 hover:text-red-400 shrink-0"
                                  >
                                    <X size={14} />
                                  </button>
                                )}
                              </div>
                            ))}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* App Download */}
                  {selectedType === "app" && (
                    <>
                      <div>
                        <label className="label-text">App Name</label>
                        <Input {...register("app_name")} placeholder="My Awesome App" />
                      </div>
                      <div>
                        <label className="label-text">App Store (iOS) URL</label>
                        <Input {...register("ios_url")} placeholder="https://apps.apple.com/…" />
                      </div>
                      <div>
                        <label className="label-text">Play Store (Android) URL</label>
                        <Input {...register("android_url")} placeholder="https://play.google.com/store/apps/…" />
                      </div>
                      <div>
                        <label className="label-text">App Description (optional)</label>
                        <textarea
                          {...register("app_description")}
                          rows={2}
                          placeholder="Short description shown on the landing page…"
                          className="input-field resize-none"
                        />
                      </div>
                    </>
                  )}

                  {/* Restaurant Menu */}
                  {selectedType === "menu" && (
                    <div className="space-y-4">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <label className="label-text">Restaurant Name</label>
                          <Input {...register("restaurant_name")} placeholder="Acme Bistro" />
                        </div>
                        <div>
                          <label className="label-text">Currency</label>
                          <Input value={menuCurrency} onChange={(e) => setMenuCurrency(e.target.value)} placeholder="₹" />
                        </div>
                      </div>
                      <div>
                        <label className="label-text">Description (optional)</label>
                        <Input value={restaurantDesc} onChange={(e) => setRestaurantDesc(e.target.value)} placeholder="Fine dining since 2010…" />
                      </div>

                      <div>
                        <div className="flex items-center justify-between mb-2">
                          <label className="label-text">Menu Sections</label>
                          <button
                            type="button"
                            onClick={() => setMenuSections((prev) => [...prev, emptySection()])}
                            className="text-violet-400 text-xs hover:text-violet-300"
                          >
                            + Add Section
                          </button>
                        </div>
                        <div className="space-y-4">
                          {menuSections.map((section, si) => (
                            <div key={si} className="border border-zinc-300 dark:border-zinc-700 rounded-xl p-4 space-y-3">
                              <div className="flex items-center gap-2">
                                <Input
                                  value={section.category}
                                  onChange={(e) => {
                                    const updated = menuSections.map((s, idx) =>
                                      idx === si ? { ...s, category: e.target.value } : s
                                    )
                                    setMenuSections(updated)
                                  }}
                                  placeholder="Section (e.g. Starters, Mains)"
                                  className="flex-1"
                                />
                                {menuSections.length > 1 && (
                                  <button
                                    type="button"
                                    onClick={() => setMenuSections((prev) => prev.filter((_, idx) => idx !== si))}
                                    className="text-zinc-500 hover:text-red-400 shrink-0"
                                  >
                                    <X size={14} />
                                  </button>
                                )}
                              </div>

                              <div className="space-y-2">
                                {section.items.map((item, ii) => (
                                  <div key={ii} className="bg-zinc-50 dark:bg-zinc-900/50 rounded-lg p-3 space-y-2">
                                    <div className="flex gap-2 items-center">
                                      <Input
                                        value={item.name}
                                        onChange={(e) => {
                                          const updated = menuSections.map((s, idx) =>
                                            idx !== si ? s : {
                                              ...s, items: s.items.map((it, jdx) =>
                                                jdx !== ii ? it : { ...it, name: e.target.value }
                                              )
                                            }
                                          )
                                          setMenuSections(updated)
                                        }}
                                        placeholder="Item name"
                                        className="flex-1"
                                      />
                                      <Input
                                        value={item.price}
                                        onChange={(e) => {
                                          const updated = menuSections.map((s, idx) =>
                                            idx !== si ? s : {
                                              ...s, items: s.items.map((it, jdx) =>
                                                jdx !== ii ? it : { ...it, price: e.target.value }
                                              )
                                            }
                                          )
                                          setMenuSections(updated)
                                        }}
                                        placeholder="Price"
                                        style={{ width: "72px" }}
                                        className="shrink-0"
                                      />
                                      {section.items.length > 1 && (
                                        <button
                                          type="button"
                                          onClick={() => {
                                            const updated = menuSections.map((s, idx) =>
                                              idx !== si ? s : { ...s, items: s.items.filter((_, jdx) => jdx !== ii) }
                                            )
                                            setMenuSections(updated)
                                          }}
                                          className="text-zinc-500 hover:text-red-400 shrink-0"
                                        >
                                          <X size={12} />
                                        </button>
                                      )}
                                    </div>
                                    <Input
                                      value={item.description}
                                      onChange={(e) => {
                                        const updated = menuSections.map((s, idx) =>
                                          idx !== si ? s : {
                                            ...s, items: s.items.map((it, jdx) =>
                                              jdx !== ii ? it : { ...it, description: e.target.value }
                                            )
                                          }
                                        )
                                        setMenuSections(updated)
                                      }}
                                      placeholder="Description (optional)"
                                      className="text-xs"
                                    />
                                    <div className="flex gap-2 items-center">
                                      <Input
                                        value={item.allergens}
                                        onChange={(e) => {
                                          const updated = menuSections.map((s, idx) =>
                                            idx !== si ? s : {
                                              ...s, items: s.items.map((it, jdx) =>
                                                jdx !== ii ? it : { ...it, allergens: e.target.value }
                                              )
                                            }
                                          )
                                          setMenuSections(updated)
                                        }}
                                        placeholder="Allergens (nuts, dairy, gluten…)"
                                        className="flex-1 text-xs"
                                      />
                                      <select
                                        value={item.isVeg}
                                        onChange={(e) => {
                                          const updated = menuSections.map((s, idx) =>
                                            idx !== si ? s : {
                                              ...s, items: s.items.map((it, jdx) =>
                                                jdx !== ii ? it : { ...it, isVeg: e.target.value as MenuItemDraft["isVeg"] }
                                              )
                                            }
                                          )
                                          setMenuSections(updated)
                                        }}
                                        className="input-field text-xs shrink-0 h-10 px-2"
                                        style={{ width: "112px" }}
                                      >
                                        <option value="">— Type —</option>
                                        <option value="veg">🟢 Veg</option>
                                        <option value="non-veg">🔴 Non-veg</option>
                                      </select>
                                    </div>
                                  </div>
                                ))}
                              </div>

                              <button
                                type="button"
                                onClick={() => {
                                  const updated = menuSections.map((s, idx) =>
                                    idx !== si ? s : { ...s, items: [...s.items, emptyItem()] }
                                  )
                                  setMenuSections(updated)
                                }}
                                className="text-violet-400 text-xs hover:text-violet-300"
                              >
                                + Add Item
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Coupon */}
                  {selectedType === "coupon" && (
                    <>
                      <div>
                        <label className="label-text">Coupon Title</label>
                        <Input {...register("coupon_title")} placeholder="30% OFF Spring Sale" />
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <label className="label-text">Discount Value</label>
                          <Input {...register("coupon_discount")} placeholder="30%" />
                        </div>
                        <div>
                          <label className="label-text">Coupon Code</label>
                          <Input {...register("coupon_code")} placeholder="SPRING30" />
                        </div>
                      </div>
                      <div>
                        <label className="label-text">Valid Until</label>
                        <Input {...register("coupon_valid_until")} type="date" />
                      </div>
                      <div>
                        <label className="label-text">Terms &amp; Conditions (optional)</label>
                        <textarea
                          {...register("coupon_terms")}
                          rows={2}
                          placeholder="Not valid with other offers…"
                          className="input-field resize-none"
                        />
                      </div>
                    </>
                  )}

                  {/* Tags — always present */}
                  <div className="pt-2 border-t border-zinc-200 dark:border-zinc-800">
                    <label className="label-text">Tags (optional)</label>
                    <Input {...register("tags")} placeholder="spring, promo, restaurant" />
                    <p className="text-zinc-600 text-xs mt-1">Comma-separated — helps organise your QR library</p>
                  </div>

                  {/* Expiry Date — paid plans only */}
                  {subInfo?.limits.qrExpiry ? (
                    <div className="pt-2 border-t border-zinc-200 dark:border-zinc-800">
                      <div className="flex items-center justify-between mb-1">
                        <label className="label-text flex items-center gap-1.5">
                          <Clock size={13} className="text-violet-400" /> Expiry Date (optional)
                        </label>
                        {expiryDate && (
                          <button
                            type="button"
                            onClick={() => setExpiryDate("")}
                            className="text-xs text-zinc-500 hover:text-red-400 transition-colors"
                          >
                            Clear
                          </button>
                        )}
                      </div>
                      <input
                        type="date"
                        value={expiryDate}
                        onChange={(e) => setExpiryDate(e.target.value)}
                        min={new Date().toISOString().slice(0, 10)}
                        max={(() => {
                          const periodEnd = new Date(subInfo.subscription.currentPeriodEnd)
                          const today = new Date()
                          // If periodEnd is in the past (e.g. local dev), fall back to 1 year from now
                          return (periodEnd > today ? periodEnd : new Date(today.setFullYear(today.getFullYear() + 1)))
                            .toISOString().slice(0, 10)
                        })()}
                        className="input-field w-full"
                      />
                      <p className="text-zinc-600 text-xs mt-1">
                        QR stops working after this date. Max allowed:{" "}
                        <span className="text-zinc-400">
                          {new Date(subInfo.subscription.currentPeriodEnd).toLocaleDateString()}
                        </span>
                      </p>
                    </div>
                  ) : subInfo && !subInfo.limits.qrExpiry ? (
                    <div className="pt-2 border-t border-zinc-200 dark:border-zinc-800">
                      <p className="text-zinc-600 text-xs flex items-center gap-1.5">
                        <Clock size={12} className="text-zinc-500" />
                        Expiry dates are available on STARTER and above.
                      </p>
                    </div>
                  ) : null}
                </div>
              </div>
            )}

            {/* STEP 3 — Design */}
            {step === 2 && (
              <div>
                <h2 className="text-zinc-900 dark:text-white font-semibold text-lg mb-5">Design Your QR Code</h2>
                <div className="space-y-6 max-w-lg">

                  {/* ── QR Code Colors ── */}
                  <div>
                    <h3 className="text-zinc-700 dark:text-zinc-300 font-medium text-sm mb-1 flex items-center gap-2">
                      <Palette size={14} className="text-violet-400" /> QR Code Colors
                    </h3>
                    <p className="text-zinc-600 text-[11px] mb-3">Style the actual QR code image</p>

                    {/* QR preset palettes — split tile: left=dot color, right=bg color */}
                    <div className="grid grid-cols-4 gap-2 mb-4">
                      {([
                        { label: "Violet",   qr: "#7c3aed", bg: "#ffffff" },
                        { label: "Midnight", qr: "#7c3aed", bg: "#000000" },
                        { label: "Ocean",    qr: "#0ea5e9", bg: "#0f172a" },
                        { label: "Forest",   qr: "#16a34a", bg: "#ffffff" },
                        { label: "Rose",     qr: "#e11d48", bg: "#ffffff" },
                        { label: "Sunset",   qr: "#f97316", bg: "#1c1917" },
                        { label: "Gold",     qr: "#eab308", bg: "#000000" },
                        { label: "Cyan",     qr: "#06b6d4", bg: "#0f172a" },
                        { label: "Pink",     qr: "#ec4899", bg: "#fdf2f8" },
                        { label: "Slate",    qr: "#334155", bg: "#f8fafc" },
                        { label: "Cobalt",   qr: "#1d4ed8", bg: "#eff6ff" },
                        { label: "Mocha",    qr: "#92400e", bg: "#fffbeb" },
                      ] as const).map((preset) => {
                        const isActive = primaryColor.toLowerCase() === preset.qr && bgColor.toLowerCase() === preset.bg
                        return (
                          <button
                            key={preset.label}
                            type="button"
                            title={preset.label}
                            onClick={() => { setPrimaryColor(preset.qr); setBgColor(preset.bg) }}
                            className={cn(
                              "relative h-9 rounded-xl overflow-hidden transition-all border-2",
                              isActive ? "border-violet-500 scale-105 shadow-lg shadow-violet-500/30" : "border-transparent hover:scale-105"
                            )}
                          >
                            <div className="absolute inset-0 flex">
                              <div className="flex-1" style={{ background: preset.qr }} />
                              <div className="flex-1" style={{ background: preset.bg }} />
                            </div>
                          </button>
                        )
                      })}
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="label-text">QR Dot Color</label>
                        <div className="flex items-center gap-2">
                          <input type="color" value={primaryColor} onChange={(e) => setPrimaryColor(e.target.value)} className="w-10 h-10 rounded-xl border border-zinc-300 dark:border-zinc-700 bg-transparent cursor-pointer" />
                          <Input value={primaryColor} onChange={(e) => setPrimaryColor(e.target.value)} className="font-mono text-xs" />
                        </div>
                        <p className="text-zinc-600 text-[10px] mt-1">Color of the dots &amp; corners</p>
                      </div>
                      <div>
                        <label className="label-text">QR Background</label>
                        <div className="flex items-center gap-2">
                          <input type="color" value={bgColor} onChange={(e) => setBgColor(e.target.value)} className="w-10 h-10 rounded-xl border border-zinc-300 dark:border-zinc-700 bg-transparent cursor-pointer" />
                          <Input value={bgColor} onChange={(e) => setBgColor(e.target.value)} className="font-mono text-xs" />
                        </div>
                        <p className="text-zinc-600 text-[10px] mt-1">Canvas behind the dots</p>
                      </div>
                    </div>
                  </div>

                  {/* ── Page / Landing Colors ── */}
                  <div>
                    <h3 className="text-zinc-700 dark:text-zinc-300 font-medium text-sm mb-1 flex items-center gap-2">
                      <Palette size={14} className="text-sky-400" /> Page / Landing Colors
                    </h3>
                    <p className="text-zinc-600 text-[11px] mb-3">Accent color shown on the mobile page after scanning</p>

                    {/* Page color presets — solid circles */}
                    <div className="grid grid-cols-8 sm:grid-cols-6 gap-1.5 sm:gap-2 mb-4">
                      {([
                        { label: "Violet",  color: "#7c3aed" },
                        { label: "Indigo",  color: "#4f46e5" },
                        { label: "Blue",    color: "#2563eb" },
                        { label: "Sky",     color: "#0ea5e9" },
                        { label: "Cyan",    color: "#06b6d4" },
                        { label: "Teal",    color: "#14b8a6" },
                        { label: "Emerald", color: "#10b981" },
                        { label: "Green",   color: "#16a34a" },
                        { label: "Orange",  color: "#f97316" },
                        { label: "Rose",    color: "#e11d48" },
                        { label: "Pink",    color: "#ec4899" },
                        { label: "Purple",  color: "#9333ea" },
                      ] as const).map((preset) => {
                        const isActive = pageAccentColor.toLowerCase() === preset.color
                        return (
                          <button
                            key={preset.label}
                            type="button"
                            title={preset.label}
                            onClick={() => setPageAccentColor(preset.color)}
                            className={cn(
                              "h-8 rounded-xl transition-all border-2",
                              isActive ? "border-white scale-110 shadow-lg" : "border-transparent hover:scale-105"
                            )}
                            style={{ background: preset.color }}
                          />
                        )
                      })}
                    </div>

                    <div>
                      <label className="label-text">Page Accent Color</label>
                      <div className="flex items-center gap-2">
                        <input type="color" value={pageAccentColor} onChange={(e) => setPageAccentColor(e.target.value)} className="w-10 h-10 rounded-xl border border-zinc-300 dark:border-zinc-700 bg-transparent cursor-pointer" />
                        <Input value={pageAccentColor} onChange={(e) => setPageAccentColor(e.target.value)} className="font-mono text-xs" />
                      </div>
                      <p className="text-zinc-600 text-[10px] mt-1">Buttons, highlights &amp; brand color on the landing page</p>
                    </div>
                  </div>

                  {/* Dot Style */}
                  <div>
                    <h3 className="text-zinc-700 dark:text-zinc-300 font-medium text-sm mb-3">Dot Style</h3>
                    <div className="grid grid-cols-3 gap-2">
                      {DOT_STYLES.map(({ value, label }) => (
                        <button
                          key={value}
                          type="button"
                          onClick={() => setDotStyle(value)}
                          className={cn(
                            "py-2 px-3 rounded-lg text-xs font-medium capitalize transition-all border",
                            dotStyle === value
                              ? "border-violet-500 bg-violet-500/15 text-violet-400"
                              : "border-zinc-300 dark:border-zinc-700 text-zinc-500 hover:text-zinc-900 dark:hover:text-white hover:border-zinc-400 dark:hover:border-zinc-600"
                          )}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Corner Style */}
                  <div>
                    <h3 className="text-zinc-700 dark:text-zinc-300 font-medium text-sm mb-3">Corner Style</h3>
                    <div className="grid grid-cols-3 gap-2">
                      {CORNER_STYLES.map(({ value, label }) => (
                        <button
                          key={value}
                          type="button"
                          onClick={() => setCornerStyle(value)}
                          className={cn(
                            "py-2 px-3 rounded-lg text-xs font-medium capitalize transition-all border",
                            cornerStyle === value
                              ? "border-violet-500 bg-violet-500/15 text-violet-400"
                              : "border-zinc-300 dark:border-zinc-700 text-zinc-500 hover:text-zinc-900 dark:hover:text-white hover:border-zinc-400 dark:hover:border-zinc-600"
                          )}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Logo */}
                  <div>
                    <h3 className="text-zinc-700 dark:text-zinc-300 font-medium text-sm mb-3">Logo (optional)</h3>
                    <input
                      ref={logoInputRef}
                      type="file"
                      accept="image/png,image/svg+xml,image/jpeg,image/webp"
                      className="hidden"
                      onChange={handleLogoChange}
                    />
                    {logoUrl ? (
                      <div className="space-y-3">
                        <div className="flex items-center gap-3 p-3 bg-zinc-100 dark:bg-zinc-800 rounded-xl border border-zinc-300 dark:border-zinc-700">
                          <img
                            src={logoUrl}
                            alt="logo preview"
                            className="w-12 h-12 object-contain rounded-lg bg-white/5"
                          />
                          <div className="flex-1 min-w-0">
                            <p className="text-zinc-700 dark:text-zinc-300 text-xs font-medium">Logo uploaded</p>
                            <button
                              type="button"
                              onClick={() => setLogoUrl(null)}
                              className="text-red-400 hover:text-red-300 text-xs mt-0.5"
                            >
                              Remove
                            </button>
                          </div>
                        </div>
                        {/* Logo size slider */}
                        <div>
                          <div className="flex items-center justify-between mb-1.5">
                            <span className="text-zinc-500 text-xs">Logo Size</span>
                            <span className="text-zinc-700 dark:text-zinc-300 text-xs font-mono">{logoSize}%</span>
                          </div>
                          <input
                            type="range"
                            min={10}
                            max={80}
                            step={5}
                            value={logoSize}
                            onChange={(e) => setLogoSize(Number(e.target.value))}
                            className="w-full h-1.5 rounded-full appearance-none cursor-pointer accent-violet-500 bg-zinc-200 dark:bg-zinc-700"
                          />
                          <div className="flex justify-between text-[10px] text-zinc-600 mt-1">
                            <span>Small</span>
                            <span>Large</span>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => logoInputRef.current?.click()}
                        disabled={isLogoUploading}
                        className="w-full border-2 border-dashed border-zinc-300 dark:border-zinc-700 hover:border-violet-500/50 rounded-xl p-5 text-center transition-colors disabled:opacity-50"
                      >
                        {isLogoUploading ? (
                          <Loader2 size={18} className="animate-spin mx-auto text-violet-400 mb-1" />
                        ) : (
                          <Upload size={18} className="mx-auto text-zinc-500 mb-1" />
                        )}
                        <p className="text-zinc-500 text-sm">{isLogoUploading ? "Uploading…" : "Click to upload logo"}</p>
                        <p className="text-zinc-700 text-xs mt-1">PNG, SVG, JPEG · Max 1 MB</p>
                      </button>
                    )}
                  </div>

                  {/* Frame Style */}
                  <div>
                    <h3 className="text-zinc-700 dark:text-zinc-300 font-medium text-sm mb-3 flex items-center gap-2">
                      <Settings2 size={14} className="text-violet-400" /> Frame Style
                    </h3>
                    <div className="grid grid-cols-3 gap-2">
                      {FRAME_STYLES.map((f) => (
                        <button
                          key={f.id}
                          type="button"
                          onClick={() => setFrameStyle(f.id)}
                          className={cn(
                            "py-2 px-2 rounded-lg text-xs font-medium transition-all border",
                            frameStyle === f.id
                              ? "border-violet-500 bg-violet-500/15 text-violet-400"
                              : "border-zinc-300 dark:border-zinc-700 text-zinc-500 hover:text-zinc-900 dark:hover:text-white hover:border-zinc-400 dark:hover:border-zinc-600"
                          )}
                        >
                          {f.label}
                        </button>
                      ))}
                    </div>

                    {/* Frame text + background — only relevant for label-bearing frame styles */}
                    {["simple", "top-label", "both-labels", "scan-now", "banner"].includes(frameStyle) && (
                      <div className="mt-4 space-y-3">
                        <div>
                          <label className="block text-xs text-zinc-500 mb-1.5">Frame Text</label>
                          <Input
                            value={frameText}
                            onChange={(e) => setFrameText(e.target.value.toUpperCase())}
                            placeholder="SCAN ME"
                            className="font-mono text-xs tracking-widest"
                            maxLength={24}
                          />
                        </div>
                        <div>
                          <label className="block text-xs text-zinc-500 mb-1.5">Frame Background Color</label>
                          <div className="flex items-center gap-2">
                            <input
                              type="color"
                              value={frameBgColor}
                              onChange={(e) => setFrameBgColor(e.target.value)}
                              className="w-10 h-10 rounded-xl border border-zinc-300 dark:border-zinc-700 bg-transparent cursor-pointer"
                            />
                            <Input
                              value={frameBgColor}
                              onChange={(e) => setFrameBgColor(e.target.value)}
                              className="font-mono text-xs"
                              maxLength={7}
                            />
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* ── Navigation ── */}
            <div className="flex flex-col gap-2 mt-8 pt-6 border-t border-zinc-200 dark:border-zinc-800">
              {submitError && (
                <p className="text-red-400 text-sm text-center">{submitError}</p>
              )}
              <div className="flex justify-between">
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => {
                      const prev = Math.max(0, step - 1)
                      setStep(prev)
                      setPreviewTab(prev === 2 ? "qr" : "scan")
                    }}
                    disabled={step === 0}
                  >
                    <ChevronLeft size={16} /> Back
                  </Button>
                {step < steps.length - 1 ? (
                  <Button type="button" onClick={() => {
                    const next = step + 1
                    setStep(next)
                    setPreviewTab(next === 2 ? "qr" : "scan")
                  }}>
                    Continue <ChevronRight size={16} />
                  </Button>
                ) : (
                  <Button type="button" variant="glow" onClick={onSubmit} disabled={isPending}>
                    {isPending
                      ? <><Loader2 size={16} className="animate-spin" /> {isEdit ? "Saving…" : "Creating…"}</>
                      : <><Check size={16} /> {isEdit ? "Save Changes" : "Create QR Code"}</>
                    }
                  </Button>
                )}
              </div>
            </div>
          </div>

          {/* ── Right Preview ── */}
          <div className="sticky top-24 self-start glass-card p-6 rounded-2xl">
            {/* Tab selector */}
            <div className="flex items-center gap-1 mb-5 p-1 bg-zinc-100 dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800">
              <button
                type="button"
                onClick={() => setPreviewTab("scan")}
                className={cn(
                  "flex-1 text-xs font-semibold py-1.5 rounded-lg transition-all",
                  previewTab === "scan"
                    ? "bg-violet-600 text-white shadow"
                    : "text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
                )}
              >
                📱 Scan Result
              </button>
              <button
                type="button"
                onClick={() => setPreviewTab("qr")}
                className={cn(
                  "flex-1 text-xs font-semibold py-1.5 rounded-lg transition-all",
                  previewTab === "qr"
                    ? "bg-violet-600 text-white shadow"
                    : "text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
                )}
              >
                🔲 QR Code
              </button>
            </div>

            {/* ── Scan Result tab — always mounted, hidden when inactive so qrRef stays in DOM ── */}
            <div className={previewTab === "scan" ? "" : "hidden"}>
              <LandingPreview
                type={selectedType}
                // react-hook-form's Control is invariant in its field-values type, so a
                // concrete Control<FormValues> isn't assignable to the preview's
                // form-agnostic prop. Cast at this boundary; runtime behaviour is unaffected.
                control={control as unknown as import("react").ComponentProps<typeof LandingPreview>["control"]}
                vcardData={vcardData}
                primaryColor={pageAccentColor}
                socialLinks={socialLinks}
                dynamicLinks={dynamicLinks}
                linksTitle={linksTitle}
                menuSections={menuSections}
                menuCurrency={menuCurrency}
                businessHoursMap={businessHoursMap}
                businessSocialLinks={businessSocialLinks}
              />
            </div>

            {/* ── QR Code tab — always mounted so qrRef is available at init ── */}
            <div className={previewTab === "qr" ? "" : "hidden"}>
              <div className="flex flex-col items-center mb-4">
                {/* Top label — lives OUTSIDE the frame wrapper so qrRef never shifts position */}
                {(frameStyle === "top-label" || frameStyle === "both-labels") && (
                  <div
                    className="w-[200px] text-white text-[10px] font-bold text-center py-2 tracking-widest rounded-t-lg"
                    style={{ backgroundColor: frameBgColor }}
                  >
                    {frameText || "SCAN ME"}
                  </div>
                )}

                {/* Frame wrapper — key prevents React from confusing it with the top label div */}
                <div
                  key="qr-frame"
                  style={(frameStyle === "top-label" || frameStyle === "both-labels") ? { borderColor: frameBgColor } : undefined}
                  className={cn(
                    "relative flex flex-col items-center transition-all",
                    frameStyle === "box"          && "border-2 border-white/50 p-2 rounded-xl",
                    frameStyle === "thick-border" && "border-[5px] border-white p-1 rounded-2xl",
                    frameStyle === "dashed"       && "border-2 border-dashed border-white/65 p-2 rounded-xl",
                    frameStyle === "double"       && "border-2 border-white/80 p-1.5 rounded-xl outline outline-2 outline-white/25 outline-offset-[3px]",
                    frameStyle === "corners"      && "p-5",
                    frameStyle === "speech-bubble"&& "border-2 border-violet-500 p-2 rounded-xl shadow-[0_0_0_5px_rgba(124,58,237,0.2)]",
                    frameStyle === "neon-violet"  && "border-2 border-violet-400 p-2 rounded-xl shadow-[0_0_25px_8px_rgba(139,92,246,0.55)]",
                    frameStyle === "neon-blue"    && "border-2 border-blue-400 p-2 rounded-xl shadow-[0_0_25px_8px_rgba(59,130,246,0.55)]",
                    frameStyle === "neon-pink"    && "border-2 border-pink-400 p-2 rounded-xl shadow-[0_0_25px_8px_rgba(236,72,153,0.55)]",
                    frameStyle === "card"         && "bg-white p-3 rounded-2xl shadow-2xl shadow-black/50",
                    frameStyle === "banner"       && "bg-white p-3 pb-0 rounded-2xl shadow-2xl shadow-black/50 overflow-hidden",
                    (frameStyle === "top-label" || frameStyle === "both-labels") && "border-x-2 border-b-2 rounded-b-lg",
                  )}
                >
                  {/* Corner bracket decorations (absolutely positioned — never affect qrRef position) */}
                  {frameStyle === "corners" && (
                    <>
                      <div className="absolute top-0 left-0 w-6 h-6 border-t-[3px] border-l-[3px] border-white" />
                      <div className="absolute top-0 right-0 w-6 h-6 border-t-[3px] border-r-[3px] border-white" />
                      <div className="absolute bottom-0 left-0 w-6 h-6 border-b-[3px] border-l-[3px] border-white" />
                      <div className="absolute bottom-0 right-0 w-6 h-6 border-b-[3px] border-r-[3px] border-white" />
                    </>
                  )}

                  {/* QR code — first non-absolute child, stable position */}
                  <div ref={qrRef} className="w-[200px] h-[200px] rounded-xl overflow-hidden" />

                  {/* Bottom label */}
                  {(frameStyle === "simple" || frameStyle === "both-labels") && (
                    <div
                      className="w-[200px] text-white text-[10px] font-bold text-center py-2 tracking-widest rounded-b-lg"
                      style={{ backgroundColor: frameBgColor }}
                    >
                      {frameText || "SCAN ME"}
                    </div>
                  )}

                  {/* Banner CTA strip */}
                  {frameStyle === "banner" && (
                    <div
                      className="-mx-3 mt-3 py-2 text-white text-[11px] font-bold text-center tracking-widest"
                      style={{ background: frameBgColor, width: "calc(200px + 24px)" }}
                    >{frameText || "SCAN ME"} →</div>
                  )}
                </div>

                {/* Scan Now label */}
                {frameStyle === "scan-now" && (
                  <div
                    className="mt-2.5 text-[10px] font-bold tracking-widest opacity-90 px-3 py-1.5 rounded-full"
                    style={{ color: "#ffffff", backgroundColor: frameBgColor }}
                  >
                    ↓&nbsp;{frameText || "SCAN NOW"}&nbsp;↓
                  </div>
                )}
              </div>

              <div className="space-y-2 text-xs text-zinc-500">
                <div className="flex justify-between">
                  <span>Type</span>
                  <span className="text-zinc-700 dark:text-zinc-300 capitalize">{selectedType}</span>
                </div>
                <div className="flex justify-between">
                  <span>Dot style</span>
                  <span className="text-zinc-700 dark:text-zinc-300 capitalize">{dotStyle}</span>
                </div>
                <div className="flex justify-between">
                  <span>Corner style</span>
                  <span className="text-zinc-700 dark:text-zinc-300 capitalize">{cornerStyle}</span>
                </div>
                {frameStyle !== "none" && (
                  <div className="flex justify-between">
                    <span>Frame style</span>
                    <span className="text-zinc-700 dark:text-zinc-300 capitalize">{frameStyle.replace(/-/g, " ")}</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </Tabs.Root>

      {showImportModal && (
        <ImportQRModal
          onClose={() => setShowImportModal(false)}
          onImported={handleImportedQR}
        />
      )}
    </div>
  )
}

