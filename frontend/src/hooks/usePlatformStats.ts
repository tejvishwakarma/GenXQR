import { useEffect, useState } from "react"
import { apiFetch } from "@/lib/api"

export interface PlatformStats {
  qrCodesGenerated: number
  activeBusinesses: number
  totalScans: number
}

interface UsePlatformStatsResult {
  /** Real numbers from the API, or null until they arrive (and if they never do). */
  stats: PlatformStats | null
  loading: boolean
  failed: boolean
}

/**
 * Fetches live platform statistics from GET /api/public/stats.
 *
 * There is deliberately no numeric fallback: the UI must never show an invented
 * figure, so while loading (and in the prerendered HTML, where effects never
 * run) `stats` is null, and if the request fails it stays null. Consumers render
 * a neutral placeholder or nothing in that case.
 */
export function usePlatformStats(): UsePlatformStatsResult {
  const [stats, setStats] = useState<PlatformStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let cancelled = false

    apiFetch<PlatformStats>("/api/public/stats")
      .then((data) => {
        if (!cancelled) setStats(data)
      })
      .catch(() => {
        if (!cancelled) setFailed(true)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [])

  return { stats, loading, failed }
}
