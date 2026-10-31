import type { DeviceType } from "@prisma/client"

/**
 * A rough device / OS / browser from a User-Agent string. Used for scans
 * (scan.worker.ts) and to describe sessions in the activity log.
 */

export interface UAInfo {
  deviceType: DeviceType
  os: string | null
  browser: string | null
}

export function parseUA(ua: string | undefined): UAInfo {
  if (!ua) return { deviceType: "UNKNOWN", os: null, browser: null }

  const lower = ua.toLowerCase()

  // Device type
  let deviceType: DeviceType = "DESKTOP"
  if (/tablet|ipad/.test(lower)) {
    deviceType = "TABLET"
  } else if (/mobile|android.*mobile|iphone|ipod|blackberry|windows phone/.test(lower)) {
    deviceType = "MOBILE"
  }

  // OS detection
  let os: string | null = null
  if (/iphone|ipad|ipod/.test(lower)) {
    os = "iOS"
  } else if (/android/.test(lower)) {
    os = "Android"
  } else if (/windows nt/.test(lower)) {
    os = "Windows"
  } else if (/macintosh|mac os x/.test(lower)) {
    os = "macOS"
  } else if (/linux/.test(lower)) {
    os = "Linux"
  }

  // Browser detection (order matters — check Edge before Chrome)
  let browser: string | null = null
  if (/edg\/|edge\//.test(lower)) {
    browser = "Edge"
  } else if (/opr\/|opera\//.test(lower)) {
    browser = "Opera"
  } else if (/samsung/.test(lower)) {
    browser = "Samsung Browser"
  } else if (/firefox\//.test(lower)) {
    browser = "Firefox"
  } else if (/chrome\//.test(lower)) {
    browser = "Chrome"
  } else if (/safari\//.test(lower)) {
    browser = "Safari"
  }

  return { deviceType, os, browser }
}
