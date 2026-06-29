import { useEffect, useState } from "react"
import { apiFetch } from "@/lib/api"

export interface PlatformStats {
  qrCodesGenerated: number
  activeBusinesses: number
  totalScans: number
  /** 0–100 float, e.g. 99.9 */
  uptimeSla: number
}

/** Fallback shown while loading or if the API is unavailable. */
const FALLBACK: PlatformStats = {
  qrCodesGenerated: 10_000_000,
  activeBusinesses: 50_000,
  totalScans: 500_000_000,
  uptimeSla: 99.9,
}

interface UsePlatformStatsResult {
  stats: PlatformStats
  loading: boolean
}

/**
 * Fetches live platform statistics from GET /api/public/stats.
 * Falls back to static values if the request fails so the page
 * always renders meaningful numbers.
 */
export function usePlatformStats(): UsePlatformStatsResult {
  const [stats, setStats] = useState<PlatformStats>(FALLBACK)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false

    apiFetch<PlatformStats>("/api/public/stats")
      .then((data) => {
        if (!cancelled) setStats(data)
      })
      .catch(() => {
        // API not yet available — keep fallback values silently
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [])

  return { stats, loading }
}
