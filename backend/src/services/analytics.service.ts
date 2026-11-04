import { maskIp } from "../utils/mask-ip.util.js"
import { prisma } from "../db/prisma.js"
import { AppError } from "../middleware/error.middleware.js"

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
  /** Every scan, repeats included. */
  totalScans: number
  /** One per device per dedup window. */
  uniqueScans: number
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
    scanCounts,
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
    // Both counters come from the denormalised columns (fast). scanCount is every
    // scan; uniqueScanCount counts one per device per dedup window.
    prisma.qRCode.findUnique({
      where: { id: qrId },
      select: { scanCount: true, uniqueScanCount: true },
    }).then((r) => ({ total: r?.scanCount ?? 0, unique: r?.uniqueScanCount ?? 0 })),

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
    totalScans: scanCounts.total,
    uniqueScans: scanCounts.unique,
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
      ip: maskIp(s.ip), // shown to every viewer — never the full address
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

// ─── Scan log (every scan of one code, with its exact time) ──────────────────

export interface ScanLogEntry extends RecentScan {
  countryCode: string | null
  isUnique: boolean
  placeName: string | null
}

/**
 * One page of a code's scans, newest first, optionally between two instants.
 * The analytics page shows each with its exact date and time (in the viewer's
 * timezone) — "3h ago" alone was no use to a marketer reading a campaign.
 * Caller must verify ownership.
 */
export async function listScans(
  qrId: string,
  opts: { page: number; limit: number; from?: Date; to?: Date },
): Promise<{ data: ScanLogEntry[]; pagination: { total: number; page: number; limit: number; totalPages: number } }> {
  const where = {
    qrId,
    ...((opts.from || opts.to) && { scannedAt: { ...(opts.from && { gte: opts.from }), ...(opts.to && { lt: opts.to }) } }),
  }
  const [total, rows] = await Promise.all([
    prisma.qRScan.count({ where }),
    prisma.qRScan.findMany({
      where,
      orderBy: { scannedAt: "desc" },
      skip: (opts.page - 1) * opts.limit,
      take: opts.limit,
      select: {
        id: true, scannedAt: true, ip: true, country: true, countryCode: true, city: true, region: true,
        deviceType: true, os: true, browser: true, referrer: true, isUnique: true, place: { select: { name: true } },
      },
    }),
  ])
  return {
    data: rows.map(({ place, ...s }) => ({
      ...s,
      scannedAt: s.scannedAt.toISOString(),
      ip: maskIp(s.ip),
      placeName: place?.name ?? null,
    })),
    pagination: { total, page: opts.page, limit: opts.limit, totalPages: Math.max(1, Math.ceil(total / opts.limit)) },
  }
}

// ─── Global analytics (aggregate across all of a user's QRs) ─────────────────

export interface GlobalAnalyticsResult {
  /** Every scan, repeats included. */
  totalScans: number
  /** One per device per dedup window. */
  uniqueScans: number
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
  /** With a place filter: scans AT that place per code, all time. */
  topQRs: Array<{ id: string; name: string; type: string; scanCount: number; isActive: boolean }>
  /** Places by scans in the range (no place filter only). */
  byPlace: PlaceBreakdown[]
  /** The place the figures are filtered to, if any. */
  place: { id: string; name: string; code: string | null; city: string | null } | null
}

export interface PlaceBreakdown {
  id: string
  name: string
  code: string | null
  city: string | null
  count: number
}

export async function getGlobalAnalytics(
  userId: string,
  days = 30,
  placeId?: string,
): Promise<GlobalAnalyticsResult> {
  if (placeId) return getPlaceAnalytics(userId, placeId, days)
  const rangeStart = daysAgo(days)
  const todayStart = startOfDayUTC(new Date())
  const weekStart = daysAgo(7)
  const monthStart = daysAgo(30)

  // Get all QR code IDs belonging to the user
  const userQRs = await prisma.qRCode.findMany({
    where: { userId },
    select: { id: true, name: true, type: true, scanCount: true, uniqueScanCount: true, isActive: true },
  })

  if (userQRs.length === 0) {
    return {
      totalScans: 0, uniqueScans: 0, scansToday: 0, scansThisWeek: 0, scansThisMonth: 0,
      totalQRs: 0, activeQRs: 0,
      timeline: buildFilledTimeline([], days),
      byDevice: [], byOS: [], byBrowser: [], byCountry: [], topQRs: [], byPlace: [], place: null,
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
    placeRows,
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
    prisma.qRScan.groupBy({
      by: ["placeId"],
      where: { qrId: { in: qrIds }, placeId: { not: null }, scannedAt: { gte: rangeStart } },
      _count: { id: true },
      orderBy: { _count: { id: "desc" } },
      take: 20,
    }),
  ])

  const timeline = buildFilledTimeline(dailyRows, days)
  const totalScans = userQRs.reduce((s, q) => s + q.scanCount, 0)
  const uniqueScans = userQRs.reduce((s, q) => s + q.uniqueScanCount, 0)

  return {
    totalScans,
    uniqueScans,
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
    byPlace: await withPlaceNames(placeRows),
    place: null,
  }
}

async function withPlaceNames(rows: Array<{ placeId: string | null; _count: { id: number } }>): Promise<PlaceBreakdown[]> {
  const ids = rows.flatMap((r) => (r.placeId ? [r.placeId] : []))
  if (ids.length === 0) return []
  const places = await prisma.place.findMany({ where: { id: { in: ids } }, select: { id: true, name: true, code: true, city: true } })
  const byId = new Map(places.map((p) => [p.id, p]))
  return rows.flatMap((r) => {
    const p = r.placeId ? byId.get(r.placeId) : undefined
    return p ? [{ ...p, count: r._count.id }] : []
  })
}

/**
 * The global figures for ONE place: scans recorded at it (QRScan.placeId, the
 * code's place when scanned), whichever of the owner's codes they came from.
 */
async function getPlaceAnalytics(userId: string, placeId: string, days: number): Promise<GlobalAnalyticsResult> {
  const place = await prisma.place.findFirst({ where: { id: placeId, userId }, select: { id: true, name: true, code: true, city: true } })
  if (!place) throw new AppError(404, "Place not found")

  const rangeStart = daysAgo(days)
  const inRange = { placeId, scannedAt: { gte: rangeStart } }
  const [
    totalScans, uniqueScans, scansToday, scansThisWeek, scansThisMonth,
    dailyRows, deviceRows, osRows, browserRows, countryRows, codeRows, codesHere,
  ] = await Promise.all([
    prisma.qRScan.count({ where: { placeId } }),
    prisma.qRScan.count({ where: { placeId, isUnique: true } }),
    prisma.qRScan.count({ where: { placeId, scannedAt: { gte: startOfDayUTC(new Date()) } } }),
    prisma.qRScan.count({ where: { placeId, scannedAt: { gte: daysAgo(7) } } }),
    prisma.qRScan.count({ where: { placeId, scannedAt: { gte: daysAgo(30) } } }),
    // No daily rollup per place: count the raw rows by UTC day. scannedAt is a
    // UTC value in a timestamp WITHOUT time zone, and production's session zone
    // is Asia/Kolkata, so dates go in and out as plain text — never through a
    // timestamptz conversion, which would shift them by 5½ hours.
    prisma.$queryRaw<Array<{ day: string; count: bigint }>>`
      SELECT to_char("scannedAt", 'YYYY-MM-DD') AS day, COUNT(*)::bigint AS count
      FROM qr_scans WHERE "placeId" = ${placeId} AND "scannedAt" >= ${formatDate(rangeStart)}::timestamp
      GROUP BY 1`,
    prisma.qRScan.groupBy({ by: ["deviceType"], where: inRange, _count: { id: true }, orderBy: { _count: { id: "desc" } } }),
    prisma.qRScan.groupBy({ by: ["os"], where: inRange, _count: { id: true }, orderBy: { _count: { id: "desc" } } }),
    prisma.qRScan.groupBy({ by: ["browser"], where: inRange, _count: { id: true }, orderBy: { _count: { id: "desc" } } }),
    prisma.qRScan.groupBy({
      by: ["country", "countryCode"],
      where: { ...inRange, country: { not: null } },
      _count: { id: true },
      orderBy: { _count: { id: "desc" } },
      take: 20,
    }),
    prisma.qRScan.groupBy({ by: ["qrId"], where: { placeId }, _count: { id: true }, orderBy: { _count: { id: "desc" } }, take: 10 }),
    prisma.qRCode.findMany({ where: { userId, placeId }, select: { isActive: true } }),
  ])

  const codes = await prisma.qRCode.findMany({
    where: { id: { in: codeRows.map((r) => r.qrId) }, userId },
    select: { id: true, name: true, type: true, isActive: true },
  })
  const codeById = new Map(codes.map((c) => [c.id, c]))

  return {
    totalScans,
    uniqueScans,
    scansToday,
    scansThisWeek,
    scansThisMonth,
    totalQRs: codesHere.length,
    activeQRs: codesHere.filter((c) => c.isActive).length,
    timeline: buildFilledTimeline(dailyRows.map((r) => ({ date: new Date(`${r.day}T00:00:00Z`), count: Number(r.count) })), days),
    byDevice: withUnknownFallback(deviceRows, "deviceType"),
    byOS: withUnknownFallback(osRows, "os"),
    byBrowser: withUnknownFallback(browserRows, "browser"),
    byCountry: mapCountryRows(countryRows),
    topQRs: codeRows.flatMap((r) => {
      const c = codeById.get(r.qrId)
      return c ? [{ ...c, scanCount: r._count.id }] : []
    }),
    byPlace: [],
    place,
  }
}
