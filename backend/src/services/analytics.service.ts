import { prisma } from "../db/prisma.js"

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface ScanTimelinePoint {
  date: string   // ISO date string  YYYY-MM-DD
  count: number
}

export interface GeoBreakdown {
  country: string
  countryCode: string | null
  count: number
}

export interface DeviceBreakdown {
  deviceType: string
  count: number
}

export interface OSBreakdown {
  os: string
  count: number
}

export interface BrowserBreakdown {
  browser: string
  count: number
}

export interface LocationBreakdown {
  city: string
  region: string | null
  country: string | null
  countryCode: string | null
  count: number
}

export interface RecentScan {
  id: string
  scannedAt: string
  ip: string
  country: string | null
  city: string | null
  region: string | null
  deviceType: string
  os: string | null
  browser: string | null
  referrer: string | null
}

export interface QRAnalyticsResult {
  totalScans: number
  scansToday: number
  scansThisWeek: number
  scansThisMonth: number
  timeline: ScanTimelinePoint[]
  byDevice: DeviceBreakdown[]
  byOS: OSBreakdown[]
  byBrowser: BrowserBreakdown[]
  byCountry: GeoBreakdown[]
  byCity: LocationBreakdown[]
  recentScans: RecentScan[]
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

function startOfDayUTC(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()))
}

function daysAgo(n: number): Date {
  const d = new Date()
  d.setUTCDate(d.getUTCDate() - n)
  return startOfDayUTC(d)
}

function formatDate(d: Date): string {
  return d.toISOString().split("T")[0] ?? ""
}

/** Builds a gap-free daily timeline for the last `days` days from sparse daily rows. */
function buildFilledTimeline(
  dailyRows: Array<{ date: Date; count: number }>,
  days: number,
): ScanTimelinePoint[] {
  const dailyMap = new Map<string, number>()
  for (const row of dailyRows) {
    const key = formatDate(row.date)
    dailyMap.set(key, (dailyMap.get(key) ?? 0) + row.count)
  }
  const timeline: ScanTimelinePoint[] = []
  for (let i = days - 1; i >= 0; i--) {
    const key = formatDate(daysAgo(i))
    timeline.push({ date: key, count: dailyMap.get(key) ?? 0 })
  }
  return timeline
}

/** Maps a Prisma groupBy count result to a DTO, falling back to "Unknown" for a null field. */
function withUnknownFallback<F extends string>(
  rows: Array<{ _count: { id: number } } & { [K in F]: string | null }>,
  field: F,
): Array<{ [K in F]: string } & { count: number }> {
  return rows.map((r) => {
    const value = (r as Record<string, unknown>)[field] as string | null
    return { [field]: value ?? "Unknown", count: r._count.id } as { [K in F]: string } & { count: number }
  })
}

/** Maps a Prisma groupBy country+countryCode count result to a GeoBreakdown DTO. */
function mapCountryRows(
  rows: Array<{ country: string | null; countryCode: string | null; _count: { id: number } }>,
): GeoBreakdown[] {
  return rows.map((r) => ({
    country: r.country ?? "Unknown",
    countryCode: r.countryCode ?? null,
    count: r._count.id,
  }))
}

// ─── Analytics queries ─────────────────────────────────────────────────────────

/**
 * Returns full analytics for a single QR code.
 * Caller must verify ownership before calling this function.
 */
export async function getQRAnalytics(
  qrId: string,
  days = 30,
): Promise<QRAnalyticsResult> {
  const rangeStart = daysAgo(days)
  const todayStart = startOfDayUTC(new Date())
  const weekStart = daysAgo(7)
  const monthStart = daysAgo(30)

  // Run all queries in parallel for performance
  const [
    totalScans,
    scansToday,
    scansThisWeek,
    scansThisMonth,
    dailyRows,
    deviceRows,
    osRows,
    browserRows,
    countryRows,
    cityRows,
    recentScanRows,
  ] = await Promise.all([
    // Total scan count from the denormalised column (fast)
    prisma.qRCode.findUnique({
      where: { id: qrId },
      select: { scanCount: true },
    }).then((r) => r?.scanCount ?? 0),

    // Scans today
    prisma.qRScan.count({
      where: { qrId, scannedAt: { gte: todayStart } },
    }),

    // Scans this week
    prisma.qRScan.count({
      where: { qrId, scannedAt: { gte: weekStart } },
    }),

    // Scans this month
    prisma.qRScan.count({
      where: { qrId, scannedAt: { gte: monthStart } },
    }),

    // Daily timeline (aggregated table is cheaper than raw scans)
    prisma.qRScanDaily.findMany({
      where: { qrId, date: { gte: rangeStart } },
      orderBy: { date: "asc" },
      select: { date: true, count: true },
    }),

    // Device breakdown
    prisma.qRScan.groupBy({
      by: ["deviceType"],
      where: { qrId, scannedAt: { gte: rangeStart } },
      _count: { id: true },
      orderBy: { _count: { id: "desc" } },
    }),

    // OS breakdown (null grouped as "Unknown")
    prisma.qRScan.groupBy({
      by: ["os"],
      where: { qrId, scannedAt: { gte: rangeStart } },
      _count: { id: true },
      orderBy: { _count: { id: "desc" } },
    }),

    // Browser breakdown
    prisma.qRScan.groupBy({
      by: ["browser"],
      where: { qrId, scannedAt: { gte: rangeStart } },
      _count: { id: true },
      orderBy: { _count: { id: "desc" } },
    }),

    // Country breakdown
    prisma.qRScan.groupBy({
      by: ["country", "countryCode"],
      where: { qrId, country: { not: null }, scannedAt: { gte: rangeStart } },
      _count: { id: true },
      orderBy: { _count: { id: "desc" } },
      take: 20,
    }),

    // City / location breakdown — the actual place a QR was scanned
    prisma.qRScan.groupBy({
      by: ["city", "region", "country", "countryCode"],
      where: { qrId, city: { not: null }, scannedAt: { gte: rangeStart } },
      _count: { id: true },
      orderBy: { _count: { id: "desc" } },
      take: 20,
    }),

    // Recent scans (last 50)
    prisma.qRScan.findMany({
      where: { qrId },
      orderBy: { scannedAt: "desc" },
      take: 50,
      select: {
        id: true,
        scannedAt: true,
        ip: true,
        country: true,
        city: true,
        region: true,
        deviceType: true,
        os: true,
        browser: true,
        referrer: true,
      },
    }),
  ])

  const timeline = buildFilledTimeline(dailyRows, days)

  return {
    totalScans: typeof totalScans === "number" ? totalScans : 0,
    scansToday,
    scansThisWeek,
    scansThisMonth,
    timeline,
    byDevice: withUnknownFallback(deviceRows, "deviceType"),
    byOS: withUnknownFallback(osRows, "os"),
    byBrowser: withUnknownFallback(browserRows, "browser"),
    byCountry: mapCountryRows(countryRows),
    byCity: cityRows.map((r) => ({
      city: r.city ?? "Unknown",
      region: r.region ?? null,
      country: r.country ?? null,
      countryCode: r.countryCode ?? null,
      count: r._count.id,
    })),
    recentScans: recentScanRows.map((s) => ({
      id: s.id,
      scannedAt: s.scannedAt.toISOString(),
      ip: s.ip,
      country: s.country,
      city: s.city,
      region: s.region,
      deviceType: s.deviceType,
      os: s.os,
      browser: s.browser,
      referrer: s.referrer,
    })),
  }
}

// ─── Global analytics (aggregate across all of a user's QRs) ─────────────────

export interface GlobalAnalyticsResult {
  totalScans: number
  scansToday: number
  scansThisWeek: number
  scansThisMonth: number
  totalQRs: number
  activeQRs: number
  timeline: ScanTimelinePoint[]
  byDevice: DeviceBreakdown[]
  byOS: OSBreakdown[]
  byBrowser: BrowserBreakdown[]
  byCountry: GeoBreakdown[]
  topQRs: Array<{ id: string; name: string; type: string; scanCount: number; isActive: boolean }>
}

export async function getGlobalAnalytics(
  userId: string,
  days = 30,
): Promise<GlobalAnalyticsResult> {
  const rangeStart = daysAgo(days)
  const todayStart = startOfDayUTC(new Date())
  const weekStart = daysAgo(7)
  const monthStart = daysAgo(30)

  // Get all QR code IDs belonging to the user
  const userQRs = await prisma.qRCode.findMany({
    where: { userId },
    select: { id: true, name: true, type: true, scanCount: true, isActive: true },
  })

  if (userQRs.length === 0) {
    return {
      totalScans: 0, scansToday: 0, scansThisWeek: 0, scansThisMonth: 0,
      totalQRs: 0, activeQRs: 0,
      timeline: buildFilledTimeline([], days),
      byDevice: [], byOS: [], byBrowser: [], byCountry: [], topQRs: [],
    }
  }

  const qrIds = userQRs.map((q) => q.id)

  const [
    scansToday,
    scansThisWeek,
    scansThisMonth,
    dailyRows,
    deviceRows,
    osRows,
    browserRows,
    countryRows,
  ] = await Promise.all([
    prisma.qRScan.count({ where: { qrId: { in: qrIds }, scannedAt: { gte: todayStart } } }),
    prisma.qRScan.count({ where: { qrId: { in: qrIds }, scannedAt: { gte: weekStart } } }),
    prisma.qRScan.count({ where: { qrId: { in: qrIds }, scannedAt: { gte: monthStart } } }),
    prisma.qRScanDaily.findMany({
      where: { qrId: { in: qrIds }, date: { gte: rangeStart } },
      orderBy: { date: "asc" },
      select: { date: true, count: true },
    }),
    prisma.qRScan.groupBy({
      by: ["deviceType"],
      where: { qrId: { in: qrIds }, scannedAt: { gte: rangeStart } },
      _count: { id: true },
      orderBy: { _count: { id: "desc" } },
    }),
    prisma.qRScan.groupBy({
      by: ["os"],
      where: { qrId: { in: qrIds }, scannedAt: { gte: rangeStart } },
      _count: { id: true },
      orderBy: { _count: { id: "desc" } },
    }),
    prisma.qRScan.groupBy({
      by: ["browser"],
      where: { qrId: { in: qrIds }, scannedAt: { gte: rangeStart } },
      _count: { id: true },
      orderBy: { _count: { id: "desc" } },
    }),
    prisma.qRScan.groupBy({
      by: ["country", "countryCode"],
      where: { qrId: { in: qrIds }, country: { not: null }, scannedAt: { gte: rangeStart } },
      _count: { id: true },
      orderBy: { _count: { id: "desc" } },
      take: 20,
    }),
  ])

  const timeline = buildFilledTimeline(dailyRows, days)
  const totalScans = userQRs.reduce((s, q) => s + q.scanCount, 0)

  return {
    totalScans,
    scansToday,
    scansThisWeek,
    scansThisMonth,
    totalQRs: userQRs.length,
    activeQRs: userQRs.filter((q) => q.isActive).length,
    timeline,
    byDevice: withUnknownFallback(deviceRows, "deviceType"),
    byOS: withUnknownFallback(osRows, "os"),
    byBrowser: withUnknownFallback(browserRows, "browser"),
    byCountry: mapCountryRows(countryRows),
    topQRs: [...userQRs]
      .sort((a, b) => b.scanCount - a.scanCount)
      .slice(0, 10)
      .map((q) => ({ id: q.id, name: q.name, type: q.type, scanCount: q.scanCount, isActive: q.isActive })),
  }
}
