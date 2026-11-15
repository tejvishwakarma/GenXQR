/**
 * Display names for the social network ids the editors store (CreateQRPage's
 * SOCIAL_NETWORKS, VCardEditor's list). Scan pages use this, with SocialIcon,
 * so every network an owner can pick is shown properly — the social media page
 * used to style 9 of them and print the raw id ("github 🔗") for the rest.
 */
export const SOCIAL_LABELS: Record<string, string> = {
  instagram: "Instagram", twitter: "X (Twitter)", facebook: "Facebook", linkedin: "LinkedIn",
  youtube: "YouTube", tiktok: "TikTok", snapchat: "Snapchat", pinterest: "Pinterest",
  github: "GitHub", spotify: "Spotify", discord: "Discord", twitch: "Twitch", reddit: "Reddit",
  website: "Website", whatsapp: "WhatsApp", telegram: "Telegram", behance: "Behance",
  dribbble: "Dribbble", vimeo: "Vimeo", soundcloud: "SoundCloud", medium: "Medium",
  substack: "Substack", patreon: "Patreon", threads: "Threads", bluesky: "Bluesky",
  mastodon: "Mastodon", line: "LINE", viber: "Viber", signal: "Signal", weibo: "Weibo", kakao: "KakaoTalk",
}

export function socialLabel(id: string): string {
  return SOCIAL_LABELS[id.toLowerCase()] ?? "Link"
}

/** Owner-supplied links render on a public page: http(s) only; a bare domain gets https://. */
export function safeHttpUrl(raw: unknown): string | null {
  if (typeof raw !== "string" || !raw.trim()) return null
  const v = raw.trim()
  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(v) ? v : `https://${v}`
  try {
    const u = new URL(withScheme)
    return u.protocol === "http:" || u.protocol === "https:" ? u.href : null
  } catch {
    return null
  }
}

/** [{platform, url}] from either stored shape: an array of links, or an object of id → url. */
export function socialLinksOf(value: unknown): { platform: string; url: string }[] {
  const raw: { platform: string; url: unknown }[] = Array.isArray(value)
    ? value.map((l) => ({ platform: String((l as { platform?: unknown })?.platform ?? "website"), url: (l as { url?: unknown })?.url }))
    : value && typeof value === "object"
      ? Object.entries(value as Record<string, unknown>).map(([platform, url]) => ({ platform, url }))
      : []
  return raw.flatMap((l) => {
    const url = safeHttpUrl(l.url)
    return url ? [{ platform: l.platform.toLowerCase(), url }] : []
  })
}
