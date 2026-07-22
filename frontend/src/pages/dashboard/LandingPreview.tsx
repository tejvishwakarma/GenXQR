/**
 * LandingPreview — phone-frame mockup that shows the actual mobile landing page
 * a user sees after scanning the QR code. Mirrors the "scan preview" panel used
 * by professional QR builders (qr-code.io style).
 *
 * Uses react-hook-form's `useWatch` so the preview updates instantly as the user
 * types — no prop-drilling of individual field values required.
 */
import { useWatch, type Control } from "react-hook-form"
import {
  Phone, Mail, MapPin, Globe, Wifi, MessageCircle,
  Music, FileText, Video, Smartphone, Building2,
  Image as ImageIcon, ChevronRight, QrCode,
} from "lucide-react"
import type { VCardData } from "./VCardEditor"
import { SocialIcon } from "@/components/ui/social-icon"

// ─── Public interface ─────────────────────────────────────────────────────────

export interface LandingPreviewProps {
  type: string
  // LandingPreview is form-agnostic (only reads values via useWatch), so it accepts any form's Control.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  control: Control<any, any, any>
  vcardData: VCardData
  primaryColor: string
  // Dynamic state props (Social, Links, Menu, Business)
  socialLinks?: Array<{ platform: string; url: string }>
  socialProfileName?: string
  dynamicLinks?: Array<{ label: string; url: string; description?: string }>
  linksTitle?: string
  menuSections?: Array<{ category: string; items: Array<{ name: string; description: string; price: string; allergens: string; isVeg: string }> }>
  menuCurrency?: string
  businessHoursMap?: Record<string, string>
  businessSocialLinks?: Array<{ platform: string; url: string }>
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const s = (v: unknown): string => String(v ?? "")

function initials(a: string, b: string) {
  return ((a.trim()[0] ?? "") + (b.trim()[0] ?? "")).toUpperCase() || "?"
}

function hostname(url: string) {
  try { return new URL(url).hostname } catch { return url || "example.com" }
}

/** Lighten a hex colour toward white by `factor` (0–1). */
function tint(hex: string, factor = 0.82): string {
  if (!/^#[0-9a-fA-F]{6}$/.test(hex)) return "#f3f4f6"
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  const h = (n: number) => Math.round(n + (255 - n) * factor).toString(16).padStart(2, "0")
  return `#${h(r)}${h(g)}${h(b)}`
}

// ─── Phone shell ──────────────────────────────────────────────────────────────

function PhoneShell({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="relative mx-auto select-none shrink-0"
      style={{ width: 212, height: 436 }}
    >
      {/* Frame */}
      <div
        className="absolute inset-0 rounded-[2.2rem] overflow-hidden"
        style={{
          border: "7px solid #3f3f46",
          boxShadow:
            "0 24px 64px rgba(0,0,0,0.65), inset 0 1px 0 rgba(255,255,255,0.06)",
          background: "#27272a",
        }}
      >
        {/* Status bar */}
        <div
          className="relative z-20 flex items-center justify-between bg-white"
          style={{ height: 22, paddingLeft: 14, paddingRight: 10 }}
        >
          <span className="text-[8px] font-semibold text-gray-700">9:41</span>
          {/* Dynamic island */}
          <div
            className="absolute left-1/2 -translate-x-1/2 top-0 bg-[#27272a] rounded-b-2xl"
            style={{ width: 56, height: 14 }}
          />
          {/* Battery + signal */}
          <div className="flex items-center gap-1">
            <svg width="10" height="6" viewBox="0 0 10 6" fill="none">
              <rect x="0" y="1" width="1.5" height="4" rx="0.4" fill="#9ca3af" />
              <rect x="2.5" y="0.5" width="1.5" height="5" rx="0.4" fill="#9ca3af" />
              <rect x="5" y="0" width="1.5" height="6" rx="0.4" fill="#4b5563" />
              <rect x="7.5" y="0" width="1.5" height="6" rx="0.4" fill="#4b5563" />
            </svg>
            <svg width="16" height="7" viewBox="0 0 16 7" fill="none">
              <rect x="0" y="0" width="13.5" height="7" rx="1.8" stroke="#6b7280" strokeWidth="0.8" fill="none" />
              <rect x="1" y="1" width="9" height="5" rx="1" fill="#4ade80" />
              <rect x="14.2" y="2.2" width="1.2" height="2.6" rx="0.5" fill="#6b7280" />
            </svg>
          </div>
        </div>

        {/* Screen */}
        <div
          className="absolute inset-0 top-[22px] bg-gray-50 overflow-y-auto"
          style={{ scrollbarWidth: "none" } as React.CSSProperties}
        >
          {children}
        </div>
      </div>

      {/* Home bar */}
      <div className="absolute bottom-2 left-1/2 -translate-x-1/2 w-16 h-[3px] bg-zinc-500 rounded-full" />
    </div>
  )
}

// ─── Shared micro-components ─────────────────────────────────────────────────

function HeroBanner({
  accent,
  children,
}: {
  accent: string
  children?: React.ReactNode
}) {
  return (
    <div
      className="w-full px-4 py-5"
      style={{
        background: `linear-gradient(145deg, ${accent} 0%, ${accent}99 100%)`,
      }}
    >
      {children}
    </div>
  )
}

function CTA({ label, accent }: { label: string; accent: string }) {
  return (
    <div
      className="mx-4 my-3 rounded-xl py-2.5 text-center text-white text-[11px] font-bold shadow cursor-pointer active:opacity-90 transition-opacity"
      style={{ background: accent }}
    >
      {label}
    </div>
  )
}

function Row({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode
  label?: string
  value: string
}) {
  if (!value) return null
  return (
    <div className="flex items-start gap-2.5 px-4 py-2.5 border-b border-gray-100 last:border-0">
      <span className="text-gray-400 mt-[1px] shrink-0" style={{ fontSize: 11 }}>
        {icon}
      </span>
      <div className="min-w-0">
        {label && (
          <p className="text-[8px] font-medium text-gray-400 uppercase tracking-wide leading-tight">
            {label}
          </p>
        )}
        <p className="text-[10.5px] text-gray-800 leading-snug truncate">{value}</p>
      </div>
    </div>
  )
}

function SectionHead({ title }: { title: string }) {
  return (
    <div className="px-4 pt-3 pb-0.5">
      <span className="text-[9px] font-bold text-gray-400 uppercase tracking-wider">
        {title}
      </span>
    </div>
  )
}

function SocialChip({ net }: { net: string }) {
  return (
    <div className="flex items-center gap-1.5 px-2 py-1 bg-gray-100 rounded-full text-[9px] text-gray-600 font-medium capitalize">
      <SocialIcon platform={net} size={14} />
      <span>{net}</span>
    </div>
  )
}

// ─── Individual page renderers ────────────────────────────────────────────────

/* --- URL --- */
function UrlPage({ url, accent }: { url: string; accent: string }) {
  const host = hostname(url)
  return (
    <div className="flex flex-col items-center pt-10 px-5 text-center gap-4">
      <div
        className="w-16 h-16 rounded-2xl flex items-center justify-center shadow-md"
        style={{ background: tint(accent, 0.88) }}
      >
        <Globe size={30} style={{ color: accent }} />
      </div>
      <div>
        <p className="text-[13px] font-bold text-gray-800 break-all">{host}</p>
        {url && (
          <p className="text-[9px] text-gray-400 mt-1 break-all line-clamp-2">{url}</p>
        )}
      </div>
      <p className="text-[9.5px] text-gray-400">Tap below to open this website</p>
      <div className="w-full">
        <CTA label="Open Website →" accent={accent} />
      </div>
    </div>
  )
}

/* --- WiFi --- */
function WifiPage({ ssid, security, accent }: { ssid: string; security: string; accent: string }) {
  const secLabel: Record<string, string> = {
    wpa2: "WPA/WPA2", wep: "WEP", none: "Open Network",
  }
  return (
    <div className="flex flex-col items-center pt-8 px-5 text-center gap-4">
      <div
        className="w-20 h-20 rounded-full flex items-center justify-center shadow-lg"
        style={{ background: tint(accent, 0.85) }}
      >
        <Wifi size={36} style={{ color: accent }} />
      </div>
      <div>
        <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Join Network</p>
        <p className="text-[15px] font-black text-gray-900 mt-1 leading-tight">
          {ssid || "NetworkName"}
        </p>
        <div
          className="inline-block mt-2 px-2 py-0.5 rounded-full text-[9px] font-semibold"
          style={{ background: tint(accent, 0.88), color: accent }}
        >
          {secLabel[security] ?? "WPA/WPA2"}
        </div>
      </div>
      <p className="text-[9.5px] text-gray-400 leading-snug">
        Your device will connect automatically
      </p>
      <div className="w-full">
        <CTA label="Connect to Wi-Fi" accent={accent} />
      </div>
    </div>
  )
}

/* --- WhatsApp --- */
function WhatsappPage({
  phone,
  message,
  accent: _accent,
}: {
  phone: string
  message: string
  accent: string
}) {
  return (
    <div className="flex flex-col">
      <HeroBanner accent="#25D366">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center">
            <MessageCircle size={20} className="text-white" />
          </div>
          <div>
            <p className="text-white font-bold text-[13px]">WhatsApp</p>
            <p className="text-white/70 text-[9px]">Chat on WhatsApp</p>
          </div>
        </div>
      </HeroBanner>

      <div className="px-4 py-4 space-y-3">
        <div className="bg-white rounded-xl p-3 shadow-sm border border-gray-100">
          <p className="text-[9px] text-gray-400 font-medium mb-1">PHONE NUMBER</p>
          <p className="text-[12px] font-bold text-gray-800">{phone || "+1 234 567 8900"}</p>
        </div>
        {message && (
          <div className="bg-white rounded-xl p-3 shadow-sm border border-gray-100">
            <p className="text-[9px] text-gray-400 font-medium mb-1">PRE-FILLED MESSAGE</p>
            <p className="text-[10px] text-gray-700 line-clamp-3">{message}</p>
          </div>
        )}
      </div>
      <CTA label="💬  Start Chat" accent="#25D366" />
    </div>
  )
}

/* --- Instagram --- */
function InstagramPage({
  username,
  accent: _accent,
}: {
  username: string
  accent: string
}) {
  const IG_GRADIENT = "linear-gradient(135deg, #f09433, #e6683c, #dc2743, #cc2366, #bc1888)"
  return (
    <div className="flex flex-col">
      <div className="w-full h-20 flex items-end justify-center pb-4" style={{ background: IG_GRADIENT }}>
        <div className="w-14 h-14 rounded-full bg-white shadow-md flex items-center justify-center">
          <span className="text-2xl">📸</span>
        </div>
      </div>
      <div className="text-center px-4 py-3">
        <p className="text-[14px] font-black text-gray-900">@{username || "username"}</p>
        <p className="text-[9px] text-gray-400 mt-1">Instagram Profile</p>
        <div className="flex justify-center gap-8 mt-3">
          <div>
            <p className="text-[11px] font-bold text-gray-800">—</p>
            <p className="text-[8px] text-gray-400">Posts</p>
          </div>
          <div>
            <p className="text-[11px] font-bold text-gray-800">—</p>
            <p className="text-[8px] text-gray-400">Followers</p>
          </div>
          <div>
            <p className="text-[11px] font-bold text-gray-800">—</p>
            <p className="text-[8px] text-gray-400">Following</p>
          </div>
        </div>
      </div>
      <div
        className="mx-4 rounded-xl py-2.5 text-center text-white text-[11px] font-bold"
        style={{ background: IG_GRADIENT }}
      >
        View Profile
      </div>
    </div>
  )
}

/* --- Facebook --- */
function FacebookPage({ url, accent: _accent }: { url: string; accent: string }) {
  return (
    <div className="flex flex-col">
      <HeroBanner accent="#1877F2">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center text-xl">
            👥
          </div>
          <div>
            <p className="text-white font-bold text-[13px]">Facebook</p>
            <p className="text-white/70 text-[9px] truncate max-w-[120px]">
              {url ? hostname(url) : "facebook.com/page"}
            </p>
          </div>
        </div>
      </HeroBanner>
      <div className="px-4 py-4">
        <p className="text-[9px] text-gray-400 mb-1">PAGE URL</p>
        <p className="text-[10.5px] text-gray-700 break-all line-clamp-2">{url || "https://facebook.com/yourpage"}</p>
      </div>
      <CTA label="View on Facebook" accent="#1877F2" />
    </div>
  )
}

/* --- vCard --- */
function VCardPage({ data, accent }: { data: VCardData; accent: string }) {
  const name = [data.firstName, data.lastName].filter(Boolean).join(" ") || "Your Name"
  const subtitle = [data.profession, data.company].filter(Boolean).join(" · ")
  const phones = data.phones.filter((p) => p.value)
  const emails = data.emails.filter((e) => e.value)
  const websites = data.websites.filter((w) => w.value)
  const activeSocials = Object.entries(data.socials).filter(([, v]) => v)
  const location = [data.city, data.state, data.country].filter(Boolean).join(", ")

  return (
    <div className="flex flex-col min-h-full bg-white">
      {/* Cover + avatar */}
      <div className="relative pb-8" style={{ background: `linear-gradient(145deg, ${accent}, ${accent}aa)`, minHeight: 80 }}>
        <div
          className="absolute -bottom-8 left-1/2 -translate-x-1/2 rounded-full border-[3px] border-white shadow-lg overflow-hidden flex items-center justify-center text-white font-black"
          style={{
            width: 60,
            height: 60,
            background: tint(accent, 0.3),
            fontSize: 20,
          }}
        >
          {data.profileImage ? (
            <img
              src={data.profileImage}
              alt=""
              className="w-full h-full object-cover"
            />
          ) : (
            initials(data.firstName, data.lastName)
          )}
        </div>
      </div>

      {/* Name */}
      <div className="mt-10 text-center px-4 pb-3">
        <p className="text-[14px] font-black text-gray-900 leading-tight">{name}</p>
        {subtitle && (
          <p className="text-[10px] text-gray-500 mt-1 leading-snug">{subtitle}</p>
        )}
        {data.summary && (
          <p className="text-[9.5px] text-gray-400 mt-2 leading-snug line-clamp-2 px-2">
            {data.summary}
          </p>
        )}
      </div>

      {/* Quick actions */}
      {(phones.length > 0 || emails.length > 0 || websites.length > 0) && (
        <div className="flex justify-center gap-4 px-4 py-2">
          {phones[0] && (
            <QuickAction icon={<Phone size={13} />} label="Call" accent={accent} />
          )}
          {emails[0] && (
            <QuickAction icon={<Mail size={13} />} label="Email" accent={accent} />
          )}
          {websites[0] && (
            <QuickAction icon={<Globe size={13} />} label="Web" accent={accent} />
          )}
        </div>
      )}

      <div className="border-t border-gray-100 mx-4 mt-1" />

      {/* Contact fields */}
      {phones.map((p, i) => (
        <Row key={`p${i}`} icon={<Phone size={11} />} label={p.label} value={p.value} />
      ))}
      {emails.map((e, i) => (
        <Row key={`e${i}`} icon={<Mail size={11} />} label={e.label} value={e.value} />
      ))}
      {websites.map((w, i) => (
        <Row key={`w${i}`} icon={<Globe size={11} />} label={w.label} value={w.value} />
      ))}
      {location && <Row icon={<MapPin size={11} />} label="location" value={location} />}

      {/* Social */}
      {activeSocials.length > 0 && (
        <>
          <SectionHead title="Social Networks" />
          <div className="flex flex-wrap gap-1.5 px-4 py-2">
            {activeSocials.map(([net]) => (
              <SocialChip key={net} net={net} />
            ))}
          </div>
        </>
      )}

      {/* CTA */}
      <div className="mt-2 mb-5">
        <CTA label="＋  Save Contact" accent={accent} />
      </div>
    </div>
  )
}

function QuickAction({
  icon,
  label,
  accent,
}: {
  icon: React.ReactNode
  label: string
  accent: string
}) {
  return (
    <div className="flex flex-col items-center gap-1">
      <div
        className="w-10 h-10 rounded-full flex items-center justify-center text-white shadow-sm"
        style={{ background: accent }}
      >
        {icon}
      </div>
      <span className="text-[8px] text-gray-500">{label}</span>
    </div>
  )
}

/* --- Social media links --- */
function SocialPage({
  links,
  accent,
}: {
  links: Array<{ platform: string; url: string }>
  accent: string
}) {
  const filled = links.filter((l) => l.url)

  return (
    <div className="flex flex-col">
      <HeroBanner accent={accent}>
        <p className="text-white font-black text-[14px]">Social Profiles</p>
        <p className="text-white/70 text-[10px] mt-0.5">Tap to follow</p>
      </HeroBanner>

      <div className="py-3 space-y-1">
        {filled.length === 0 ? (
          <div className="text-center py-8 text-gray-300 text-[10px]">
            Add social links to preview
          </div>
        ) : (
          filled.map(({ platform, url }, i) => (
            <div
              key={i}
              className="mx-4 flex items-center gap-3 px-3 py-2.5 bg-white rounded-xl shadow-sm border border-gray-100"
            >
              <SocialIcon platform={platform} size={28} />
              <div className="min-w-0 flex-1">
                <p className="text-[8px] text-gray-400 capitalize font-medium">{platform}</p>
                <p className="text-[11px] font-semibold text-gray-800 truncate">
                  {url.startsWith("http") ? hostname(url) : url}
                </p>
              </div>
              <ChevronRight size={12} className="text-gray-300 shrink-0" />
            </div>
          ))
        )}
      </div>
    </div>
  )
}

/* --- Multi-link (links page) --- */
function LinksPage({
  title,
  items,
  accent,
}: {
  title: string
  items: Array<{ label: string; url: string; description?: string }>
  accent: string
}) {
  const filled = items.filter((l) => l.label || l.url)

  return (
    <div className="flex flex-col">
      <HeroBanner accent={accent}>
        <p className="text-white font-black text-[14px]">{title || "My Links"}</p>
      </HeroBanner>
      <div className="py-3">
        {filled.length === 0 ? (
          <div className="text-center py-8 text-gray-300 text-[10px]">
            Add links to see preview
          </div>
        ) : (
          filled.map((item, i) => (
            <div
              key={i}
              className="mx-4 my-1.5 flex flex-col rounded-xl px-3 py-2.5 shadow-sm border border-gray-100"
              style={{ background: tint(accent, 0.93) }}
            >
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-semibold truncate mr-2" style={{ color: accent }}>
                  {item.label || item.url}
                </span>
                <ChevronRight size={12} style={{ color: accent }} className="shrink-0" />
              </div>
              {item.description && (
                <p className="text-[9px] text-gray-500 mt-0.5 leading-snug">{item.description}</p>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  )
}

/* --- Business --- */
function BusinessPage({
  name,
  phone,
  email,
  website,
  address,
  hoursMap,
  socialLinks = [],
  accent,
}: {
  name: string
  phone: string
  email: string
  website: string
  address: string
  hoursMap: Record<string, string>
  socialLinks?: Array<{ platform: string; url: string }>
  accent: string
}) {
  const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]
  const hasHours = DAYS.some((d) => hoursMap[d])

  return (
    <div className="flex flex-col">
      <HeroBanner accent={accent}>
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center">
            <Building2 size={20} className="text-white" />
          </div>
          <p className="text-white font-black text-[14px] leading-tight">
            {name || "Business Name"}
          </p>
        </div>
      </HeroBanner>

      <Row icon={<Phone size={11} />} label="phone" value={phone} />
      <Row icon={<Mail size={11} />} label="email" value={email} />
      <Row icon={<Globe size={11} />} label="website" value={website} />
      <Row icon={<MapPin size={11} />} label="address" value={address} />

      {hasHours && (
        <>
          <SectionHead title="Opening Hours" />
          <div className="px-4 pb-3 space-y-0.5">
            {DAYS.map((day) =>
              hoursMap[day] ? (
                <div key={day} className="flex justify-between text-[9px] py-0.5">
                  <span className="text-gray-500">{day.slice(0, 3)}</span>
                  <span className="text-gray-800 font-medium">{hoursMap[day]}</span>
                </div>
              ) : null
            )}
          </div>
        </>
      )}

      {socialLinks.length > 0 && (
        <>
          <SectionHead title="Social Media" />
          <div className="flex flex-wrap gap-1.5 px-4 pb-3">
            {socialLinks.filter((l) => l.url).map((l, i) => (
              <SocialChip key={i} net={l.platform} />
            ))}
          </div>
        </>
      )}

      {phone && <CTA label="📞  Call Now" accent={accent} />}
    </div>
  )
}

/* --- App Download --- */
function AppPage({
  appName,
  iosUrl,
  androidUrl,
  description,
  accent,
}: {
  appName: string
  iosUrl: string
  androidUrl: string
  description: string
  accent: string
}) {
  return (
    <div className="flex flex-col items-center pt-8 px-5 text-center gap-3">
      <div
        className="w-20 h-20 rounded-3xl flex items-center justify-center shadow-lg"
        style={{ background: tint(accent, 0.82) }}
      >
        <Smartphone size={36} style={{ color: accent }} />
      </div>
      <p className="text-[14px] font-black text-gray-900 mt-1">
        {appName || "App Name"}
      </p>
      {description && (
        <p className="text-[9.5px] text-gray-500 line-clamp-2 px-2">{description}</p>
      )}
      <div className="flex items-center gap-1 mb-1">
        {Array.from({ length: 5 }).map((_, i) => (
          <span key={i} style={{ color: i < 4 ? "#f59e0b" : "#d1d5db", fontSize: 12 }}>
            ★
          </span>
        ))}
        <span className="text-[9px] text-gray-400 ml-1">4.8 · App Store</span>
      </div>

      <div className="w-full space-y-2">
        {(iosUrl || !androidUrl) && (
          <div
            className="flex items-center justify-center gap-2 rounded-xl py-2.5 text-white text-[11px] font-bold shadow"
            style={{ background: "#000" }}
          >
            <svg className="w-4 h-4 text-white" viewBox="0 0 24 24" fill="currentColor">
              <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98l-.09.06c-.22.14-2.2 1.28-2.18 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.77M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"/>
            </svg> Download on App Store
          </div>
        )}
        {(androidUrl || !iosUrl) && (
          <div
            className="flex items-center justify-center gap-2 rounded-xl py-2.5 text-white text-[11px] font-bold shadow"
            style={{ background: "#3DDC84" }}
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none">
              <path d="M3.609 1.814L13.792 12 3.61 22.186a.996.996 0 01-.61-.92V2.734a1 1 0 01.609-.92zm10.89 10.893l2.302 2.302-10.937 6.333 8.635-8.635zm3.199-1.303l-10.93-6.33 8.63 8.63 2.3-2.3zM17.398 12l2.302 1.328V10.67L17.398 12z" fill="#fff"/>
            </svg> Get it on Google Play
          </div>
        )}
      </div>
    </div>
  )
}

/* --- Coupon --- */
function CouponPage({
  title,
  discount,
  code,
  validUntil,
  terms,
  accent,
}: {
  title: string
  discount: string
  code: string
  validUntil: string
  terms: string
  accent: string
}) {
  return (
    <div className="flex flex-col">
      {/* Hero */}
      <div
        className="w-full py-7 flex flex-col items-center text-white"
        style={{ background: `linear-gradient(145deg, ${accent}, ${accent}99)` }}
      >
        <p className="text-[11px] font-semibold opacity-80 uppercase tracking-widest mb-1">
          Exclusive Offer
        </p>
        <p className="text-[32px] font-black leading-none">
          {discount || "XX%"}
        </p>
        <p className="text-[11px] font-medium opacity-90 mt-1">OFF</p>
        <p className="text-[13px] font-bold mt-3 text-center px-4 leading-tight">
          {title || "Coupon Title"}
        </p>
      </div>

      {/* Code */}
      <div className="mx-4 mt-4">
        <p className="text-[9px] text-gray-400 text-center mb-2 font-medium uppercase tracking-wide">
          Your Coupon Code
        </p>
        <div
          className="border-2 border-dashed rounded-xl py-3 text-center"
          style={{ borderColor: accent }}
        >
          <span
            className="text-[16px] font-black tracking-widest"
            style={{ color: accent }}
          >
            {code || "COUPON"}
          </span>
        </div>
      </div>

      {/* Validity */}
      {validUntil && (
        <p className="text-center text-[9px] text-gray-400 mt-3">
          Valid until {validUntil}
        </p>
      )}

      <CTA label="Claim Offer" accent={accent} />

      {terms && (
        <p className="mx-4 text-[8px] text-gray-400 text-center mb-4 leading-relaxed">
          {terms}
        </p>
      )}
    </div>
  )
}

/* --- Menu --- */
function MenuPage({
  restaurantName,
  sections,
  currency,
  accent,
}: {
  restaurantName: string
  sections: Array<{ category: string; items: Array<{ name: string; price: string }> }>
  currency: string
  accent: string
}) {
  const hasSections = sections.some((s) => s.category || s.items.some((it) => it.name))

  return (
    <div className="flex flex-col">
      <HeroBanner accent={accent}>
        <div className="flex items-center gap-2">
          <span className="text-2xl">🍽️</span>
          <div>
            <p className="text-white font-black text-[14px]">
              {restaurantName || "Restaurant Name"}
            </p>
            <p className="text-white/70 text-[9px]">Digital Menu</p>
          </div>
        </div>
      </HeroBanner>

      {!hasSections ? (
        <div className="text-center py-8 text-gray-300 text-[10px]">
          Fill in menu details to preview
        </div>
      ) : (
        <div className="pb-4 space-y-1 mt-2">
          {sections.map((section, si) => (
            <div key={si}>
              {section.category && (
                <div
                  className="mx-4 mt-3 mb-1 px-3 py-1.5 rounded-lg"
                  style={{ background: tint(accent, 0.88) }}
                >
                  <p className="text-[11px] font-bold" style={{ color: accent }}>
                    {section.category}
                  </p>
                </div>
              )}
              {section.items
                .filter((it) => it.name)
                .map((item, ii) => (
                  <div
                    key={ii}
                    className="flex items-center justify-between mx-4 px-2 py-2 border-b border-gray-100"
                  >
                    <p className="text-[11px] text-gray-800">{item.name}</p>
                    {item.price && (
                      <span
                        className="text-[11px] font-semibold shrink-0 ml-2"
                        style={{ color: accent }}
                      >
                        {currency}{item.price}
                      </span>
                    )}
                  </div>
                ))}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

/* --- File types (PDF / Video / MP3 / Gallery) --- */
function FilePage({
  type,
  accent,
}: {
  type: "pdf" | "video" | "mp3" | "gallery"
  accent: string
}) {
  const META = {
    pdf: { icon: <FileText size={36} />, label: "PDF Document", cta: "View Document", emoji: "📄" },
    video: { icon: <Video size={36} />, label: "Video", cta: "Play Video", emoji: "🎬" },
    mp3: { icon: <Music size={36} />, label: "Audio / MP3", cta: "Play Audio", emoji: "🎵" },
    gallery: { icon: <ImageIcon size={36} />, label: "Image Gallery", cta: "View Gallery", emoji: "🖼️" },
  }[type]

  if (type === "pdf") {
    return (
      <div className="flex flex-col">
        <HeroBanner accent={accent}>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center">
              <FileText size={20} className="text-white" />
            </div>
            <div>
              <p className="text-white font-black text-[13px]">PDF Document</p>
              <p className="text-white/70 text-[9px]">Tap to open</p>
            </div>
          </div>
        </HeroBanner>
        <div className="px-5 py-4 flex flex-col items-center gap-3">
          {/* Stacked pages mockup */}
          <div className="relative" style={{ width: 120, height: 148 }}>
            {[2, 1, 0].map((offset) => (
              <div
                key={offset}
                className="absolute rounded-lg bg-white border border-gray-200"
                style={{ top: offset * 4, left: offset * 3, width: 120, height: 140, boxShadow: "0 1px 4px rgba(0,0,0,0.08)", zIndex: 3 - offset }}
              >
                {offset === 0 && (
                  <div className="p-3 space-y-1.5">
                    <div className="h-1.5 rounded-full bg-gray-200 w-full" />
                    <div className="h-1.5 rounded-full bg-gray-200 w-5/6" />
                    <div className="h-1.5 rounded-full bg-gray-200 w-full" />
                    <div className="h-1.5 rounded-full bg-gray-200 w-3/4" />
                    <div className="h-1.5 rounded-full bg-gray-200 w-full" />
                    <div className="mt-2 rounded" style={{ height: 36, background: tint(accent, 0.88) }} />
                    <div className="h-1.5 rounded-full bg-gray-200 w-full" />
                    <div className="h-1.5 rounded-full bg-gray-200 w-5/6" />
                    <div className="h-1.5 rounded-full bg-gray-200 w-2/3" />
                  </div>
                )}
              </div>
            ))}
          </div>
          <CTA label="📄  View Document" accent={accent} />
        </div>
      </div>
    )
  }

  if (type === "mp3") {
    return (
      <div className="flex flex-col items-center pt-8 px-5 gap-4">
        <div
          className="w-24 h-24 rounded-3xl flex items-center justify-center shadow-xl"
          style={{ background: `linear-gradient(145deg, ${accent}cc, ${accent}55)` }}
        >
          <span className="text-4xl">{META.emoji}</span>
        </div>
        <p className="text-[13px] font-bold text-gray-800">Music Track</p>
        {/* Player mockup */}
        <div className="w-full bg-white rounded-2xl shadow-md p-4 border border-gray-100">
          <div className="w-full h-1.5 rounded-full bg-gray-200 mb-3">
            <div
              className="h-1.5 rounded-full w-1/3"
              style={{ background: accent }}
            />
          </div>
          <div className="flex items-center justify-between text-[9px] text-gray-400 mb-3">
            <span>0:42</span><span>3:28</span>
          </div>
          <div className="flex justify-center gap-4 items-center">
            <span className="text-gray-400 text-lg">⏮</span>
            <div
              className="w-10 h-10 rounded-full flex items-center justify-center text-white shadow"
              style={{ background: accent }}
            >
              <span className="text-sm">▶</span>
            </div>
            <span className="text-gray-400 text-lg">⏭</span>
          </div>
        </div>
      </div>
    )
  }

  if (type === "gallery") {
    return (
      <div className="flex flex-col">
        <HeroBanner accent={accent}>
          <p className="text-white font-black text-[13px]">📷  Photo Gallery</p>
        </HeroBanner>
        <div className="grid grid-cols-2 gap-2 p-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="aspect-square rounded-xl flex items-center justify-center"
              style={{ background: tint(accent, 0.6 + i * 0.08) }}
            >
              <ImageIcon size={20} style={{ color: accent, opacity: 0.5 }} />
            </div>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col items-center pt-10 px-5 text-center gap-4">
      <div
        className="w-20 h-20 rounded-3xl flex items-center justify-center shadow-xl"
        style={{ background: tint(accent, 0.85) }}
      >
        <span style={{ color: accent }}>{META.icon}</span>
      </div>
      <p className="text-[12px] font-bold text-gray-700">{META.label}</p>
      <CTA label={META.cta} accent={accent} />
    </div>
  )
}

/* --- Fallback --- */
function FallbackPage({ type, accent }: { type: string; accent: string }) {
  return (
    <div className="flex flex-col items-center pt-12 px-5 text-center gap-3">
      <div
        className="w-16 h-16 rounded-2xl flex items-center justify-center shadow"
        style={{ background: tint(accent, 0.88) }}
      >
        <QrCode size={30} style={{ color: accent }} />
      </div>
      <p className="text-[12px] font-semibold text-gray-700 capitalize">{type} QR Code</p>
      <p className="text-[9.5px] text-gray-400 leading-snug">
        Fill in the content fields and this preview will update live.
      </p>
    </div>
  )
}

// ─── Main export ──────────────────────────────────────────────────────────────

export default function LandingPreview({
  type,
  control,
  vcardData,
  primaryColor,
  socialLinks = [],
  dynamicLinks = [],
  linksTitle = "",
  menuSections = [],
  menuCurrency = "₹",
  businessHoursMap = {},
  businessSocialLinks = [],
}: LandingPreviewProps) {
  // useWatch subscribes only to this component, not the parent — efficient re-renders
  const v = useWatch({ control }) as Record<string, string>
  const accent = primaryColor || "#7c3aed"

  function renderContent() {
    switch (type) {
      case "url":
        return <UrlPage url={s(v.url)} accent={accent} />

      case "wifi":
        return (
          <WifiPage
            ssid={s(v.ssid)}
            security={s(v.security) || "wpa2"}
            accent={accent}
          />
        )

      case "whatsapp":
        return (
          <WhatsappPage
            phone={s(v.phone)}
            message={s(v.message)}
            accent={accent}
          />
        )

      case "instagram":
        return (
          <InstagramPage username={s(v.instagram_username)} accent={accent} />
        )

      case "facebook":
        return <FacebookPage url={s(v.facebook_url)} accent={accent} />

      case "vcard":
        return <VCardPage data={vcardData} accent={accent} />

      case "social":
        return (
          <SocialPage
            links={socialLinks}
            accent={accent}
          />
        )

      case "links":
        return (
          <LinksPage
            title={linksTitle}
            items={dynamicLinks}
            accent={accent}
          />
        )

      case "business":
        return (
          <BusinessPage
            name={s(v.business_name)}
            phone={s(v.business_phone)}
            email={s(v.business_email)}
            website={s(v.business_website)}
            address={s(v.business_address)}
            hoursMap={businessHoursMap}
            socialLinks={businessSocialLinks}
            accent={accent}
          />
        )

      case "app":
        return (
          <AppPage
            appName={s(v.app_name)}
            iosUrl={s(v.ios_url)}
            androidUrl={s(v.android_url)}
            description={s(v.app_description)}
            accent={accent}
          />
        )

      case "coupon":
        return (
          <CouponPage
            title={s(v.coupon_title)}
            discount={s(v.coupon_discount)}
            code={s(v.coupon_code)}
            validUntil={s(v.coupon_valid_until)}
            terms={s(v.coupon_terms)}
            accent={accent}
          />
        )

      case "menu":
        return (
          <MenuPage
            restaurantName={s(v.restaurant_name)}
            sections={menuSections}
            currency={menuCurrency}
            accent={accent}
          />
        )

      case "pdf":
        return <FilePage type="pdf" accent={accent} />
      case "video":
        return <FilePage type="video" accent={accent} />
      case "mp3":
        return <FilePage type="mp3" accent={accent} />
      case "gallery":
        return <FilePage type="gallery" accent={accent} />

      default:
        return <FallbackPage type={type} accent={accent} />
    }
  }

  return (
    <PhoneShell>
      {renderContent()}
    </PhoneShell>
  )
}
