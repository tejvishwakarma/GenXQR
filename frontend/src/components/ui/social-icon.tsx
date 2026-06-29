/**
 * SocialIcon — renders a brand-coloured square tile with the platform's
 * official SVG logo (via simple-icons) for 30+ social networks.
 *
 * Website / unknown platforms fall back to a globe outline icon.
 */
import {
  siInstagram, siX, siFacebook, siYoutube, siTiktok, siSnapchat,
  siPinterest, siGithub, siSpotify, siDiscord, siTwitch, siReddit,
  siWhatsapp, siTelegram, siBehance, siDribbble, siVimeo, siSoundcloud,
  siMedium, siSubstack, siPatreon, siThreads, siBluesky, siMastodon,
  siLine, siViber, siSignal, siSinaweibo, siKakaotalk,
} from "simple-icons"
import type { SimpleIcon } from "simple-icons"

// LinkedIn was removed from simple-icons — use the official SVG path directly
const LINKEDIN_PATH =
  "M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136" +
  " 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85" +
  " 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063" +
  "-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925" +
  " 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0" +
  " .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24" +
  " 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"

type Entry = { si?: SimpleIcon; path?: string; bg: string; fg: string }

const PLATFORM_MAP: Record<string, Entry> = {
  instagram:  { si: siInstagram,  bg: "linear-gradient(135deg,#f09433,#dc2743,#bc1888)", fg: "#fff" },
  twitter:    { si: siX,          bg: "#000000", fg: "#fff" },
  facebook:   { si: siFacebook,   bg: "#1877F2", fg: "#fff" },
  linkedin:   { path: LINKEDIN_PATH, bg: "#0A66C2", fg: "#fff" },
  youtube:    { si: siYoutube,    bg: "#FF0000", fg: "#fff" },
  tiktok:     { si: siTiktok,     bg: "#010101", fg: "#fff" },
  whatsapp:   { si: siWhatsapp,   bg: "#25D366", fg: "#fff" },
  telegram:   { si: siTelegram,   bg: "#26A5E4", fg: "#fff" },
  github:     { si: siGithub,     bg: "#333333", fg: "#fff" },
  spotify:    { si: siSpotify,    bg: "#1DB954", fg: "#fff" },
  discord:    { si: siDiscord,    bg: "#5865F2", fg: "#fff" },
  twitch:     { si: siTwitch,     bg: "#9146FF", fg: "#fff" },
  reddit:     { si: siReddit,     bg: "#FF4500", fg: "#fff" },
  pinterest:  { si: siPinterest,  bg: "#BD081C", fg: "#fff" },
  snapchat:   { si: siSnapchat,   bg: "#FFFC00", fg: "#000" },
  behance:    { si: siBehance,    bg: "#1769FF", fg: "#fff" },
  dribbble:   { si: siDribbble,   bg: "#EA4C89", fg: "#fff" },
  vimeo:      { si: siVimeo,      bg: "#1AB7EA", fg: "#fff" },
  soundcloud: { si: siSoundcloud, bg: "#FF5500", fg: "#fff" },
  medium:     { si: siMedium,     bg: "#000000", fg: "#fff" },
  substack:   { si: siSubstack,   bg: "#FF6719", fg: "#fff" },
  patreon:    { si: siPatreon,    bg: "#FF424D", fg: "#fff" },
  threads:    { si: siThreads,    bg: "#000000", fg: "#fff" },
  bluesky:    { si: siBluesky,    bg: "#0085FF", fg: "#fff" },
  mastodon:   { si: siMastodon,   bg: "#6364FF", fg: "#fff" },
  line:       { si: siLine,       bg: "#00B900", fg: "#fff" },
  viber:      { si: siViber,      bg: "#7360F2", fg: "#fff" },
  signal:     { si: siSignal,     bg: "#2592E9", fg: "#fff" },
  weibo:      { si: siSinaweibo,  bg: "#E6162D", fg: "#fff" },
  kakao:      { si: siKakaotalk,  bg: "#FAE100", fg: "#000" },
  // "website" intentionally omitted → falls through to globe fallback
}

export function SocialIcon({ platform, size = 28 }: { platform: string; size?: number }) {
  const entry  = PLATFORM_MAP[platform]
  const pad    = Math.max(4, Math.round(size * 0.2))
  const iSize  = size - pad * 2
  const radius = Math.round(size * 0.26)
  const svgPath = entry?.si?.path ?? entry?.path
  const fg = entry?.fg ?? "#fff"

  return (
    <div
      style={{
        width: size, height: size, minWidth: size,
        background: entry?.bg ?? "#6366f1",
        borderRadius: radius,
        display: "flex", alignItems: "center", justifyContent: "center",
        flexShrink: 0,
      }}
    >
      {svgPath ? (
        // Official brand SVG
        <svg
          viewBox="0 0 24 24"
          width={iSize}
          height={iSize}
          fill={fg}
          xmlns="http://www.w3.org/2000/svg"
          aria-hidden
        >
          <path d={svgPath} />
        </svg>
      ) : (
        // Globe outline for "website" and unknown platforms
        <svg
          viewBox="0 0 24 24"
          width={iSize}
          height={iSize}
          fill="none"
          stroke={fg}
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          xmlns="http://www.w3.org/2000/svg"
          aria-hidden
        >
          <circle cx="12" cy="12" r="10" />
          <line x1="2" y1="12" x2="22" y2="12" />
          <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
        </svg>
      )}
    </div>
  )
}
