import { parse as parseCSV } from "csv-parse/sync"
import archiver from "archiver"
import type { Response } from "express"
import { prisma } from "../db/prisma.js"
import { AppError } from "../middleware/error.middleware.js"
import { getUserPlanLimits } from "./billing.service.js"

// Max rows allowed per plan
const BULK_LIMITS: Record<string, number> = {
  FREE: 0,
  STARTER: 10,
  PRO: 100,
  BUSINESS: 5000,
  ENTERPRISE: 10000,
}

const REQUIRED_COLS = ["name", "url"] as const

interface CsvRow {
  name: string
  url: string
  tag?: string
  description?: string
}

interface BulkResult {
  row: number
  name: string
  url: string
  status: "created" | "error"
  qrId?: string
  slug?: string
  error?: string
}

/**
 * Download a sample CSV template as a stream.
 */
export function streamCsvTemplate(res: Response): void {
  const header = "name,url,tag,description\n"
  const sample = [
    "Restaurant Menu Spring,https://menu.example.com/spring,food,Spring menu QR",
    "Office WiFi,https://wifi.example.com/office,internal,",
    "Product Launch,https://launch.example.com,marketing,",
  ].join("\n")

  res.setHeader("Content-Type", "text/csv")
  res.setHeader("Content-Disposition", 'attachment; filename="GenXQR_bulk_template.csv"')
  res.send(header + sample)
}

/**
 * Parse and validate a CSV buffer.
 * Returns an array of validated rows or throws AppError with details.
 */
function parseBulkCsv(buffer: Buffer): CsvRow[] {
  let records: Record<string, string>[]
  try {
    records = parseCSV(buffer, {
      columns: (header: string[]) =>
        header.map((h) => h.replace(/^\uFEFF/, "").trim().toLowerCase()),
      skip_empty_lines: true,
      trim: true,
    }) as Record<string, string>[]
  } catch {
    throw new AppError(422, "Could not parse CSV file. Ensure it is valid UTF-8 CSV with a header row.")
  }

  // Validate required columns are present
  if (records.length === 0) throw new AppError(422, "CSV file is empty")
  const cols = Object.keys(records[0]!)
  const missing = REQUIRED_COLS.filter((c) => !cols.includes(c))
  if (missing.length > 0) {
    throw new AppError(422, `CSV must contain columns: ${REQUIRED_COLS.join(", ")}. Missing: ${missing.join(", ")}`)
  }

  return records.map((r) => ({
    name: (r["name"] ?? "").trim(),
    url: (r["url"] ?? "").trim(),
    tag: (r["tag"] ?? "").trim() || undefined,
    description: (r["description"] ?? "").trim() || undefined,
  }))
}

function generateSlug(): string {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789"
  return Array.from({ length: 8 }, () => chars[Math.floor(Math.random() * chars.length)]).join("")
}

function isValidUrl(url: string): boolean {
  try {
    const parsed = new URL(url)
    return ["http:", "https:"].includes(parsed.protocol)
  } catch {
    return false
  }
}

/**
 * Process a bulk CSV upload: parse rows, enforce plan limits, create QR codes.
 * Returns results per row including created QR IDs and any per-row errors.
 */
export async function processBulkCsv(
  userId: string,
  buffer: Buffer,
): Promise<{ results: BulkResult[]; created: number; failed: number }> {
  const limits = await getUserPlanLimits(userId)

  if (!limits.limits.bulkGeneration) {
    throw new AppError(403, "Bulk generation requires PRO plan or higher")
  }

  const planName = limits.planName
  const maxRows = BULK_LIMITS[planName] ?? 0
  if (maxRows === 0) throw new AppError(403, "Bulk generation is not available on the Free plan")

  const rows = parseBulkCsv(buffer)
  if (rows.length > maxRows) {
    throw new AppError(400, `Your ${planName} plan allows up to ${maxRows} rows per batch. Uploaded ${rows.length} rows.`)
  }

  // Check remaining QR slot capacity
  const currentCount = await prisma.qRCode.count({ where: { userId } })
  const available = limits.limits.dynamicQRLimit === -1
    ? rows.length
    : Math.max(0, limits.limits.dynamicQRLimit - currentCount)

  const results: BulkResult[] = []
  let created = 0
  let failed = 0

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]!
    const rowNum = i + 1

    if (!row.name.trim()) {
      results.push({ row: rowNum, name: row.name, url: row.url, status: "error", error: "Name is required" })
      failed++
      continue
    }
    if (!isValidUrl(row.url)) {
      results.push({ row: rowNum, name: row.name, url: row.url, status: "error", error: "Invalid URL (must start with http:// or https://)" })
      failed++
      continue
    }
    if (created >= available) {
      results.push({ row: rowNum, name: row.name, url: row.url, status: "error", error: "QR code limit reached for your plan" })
      failed++
      continue
    }

    // Generate a unique slug (retry up to 5 times on collision)
    let slug = ""
    for (let attempt = 0; attempt < 5; attempt++) {
      const candidate = generateSlug()
      const exists = await prisma.qRCode.findUnique({ where: { slug: candidate } })
      if (!exists) { slug = candidate; break }
    }
    if (!slug) {
      results.push({ row: rowNum, name: row.name, url: row.url, status: "error", error: "Slug generation failed" })
      failed++
      continue
    }

    try {
      const qr = await prisma.qRCode.create({
        data: {
          userId,
          name: row.name.trim().slice(0, 200),
          type: "URL",
          category: "DYNAMIC",
          slug,
          tags: row.tag ? [row.tag.trim().slice(0, 50)] : [],
          content: {
            create: {
              data: { url: row.url.trim(), description: row.description?.trim() ?? "" },
            },
          },
          design: { create: {} }, // default design
        },
        select: { id: true, slug: true },
      })
      results.push({ row: rowNum, name: row.name, url: row.url, status: "created", qrId: qr.id, slug: qr.slug })
      created++
    } catch {
      results.push({ row: rowNum, name: row.name, url: row.url, status: "error", error: "Database error creating QR code" })
      failed++
    }
  }

  return { results, created, failed }
}

/**
 * Stream a ZIP archive containing per-QR metadata JSON files for the given job results.
 * Callers write the results into the archive; the function handles streaming to the response.
 */
export async function streamResultsZip(
  userId: string,
  results: BulkResult[],
  res: Response,
): Promise<void> {
  const created = results.filter((r) => r.status === "created")
  if (created.length === 0) {
    throw new AppError(400, "No successfully created QR codes to export")
  }

  const ids = created.map((r) => r.qrId!).filter(Boolean)
  const qrs = await prisma.qRCode.findMany({
    where: { id: { in: ids }, userId },
    select: { id: true, name: true, slug: true, type: true, createdAt: true, content: { select: { data: true } } },
  })

  const FRONTEND_URL = process.env["FRONTEND_URL"] ?? "https://genxqr.com"

  res.setHeader("Content-Type", "application/zip")
  res.setHeader("Content-Disposition", 'attachment; filename="GenXQR_bulk_export.zip"')

  const archive = archiver("zip", { zlib: { level: 6 } })
  archive.pipe(res)

  // Add a summary CSV
  const csvLines = [
    "name,slug,qr_url,scan_url,created_at",
    ...qrs.map((q) => {
      const scanUrl = `${FRONTEND_URL}/r/${q.slug}`
      const qrUrl = `${FRONTEND_URL}/api/qr/${q.id}/image`
      return `"${q.name.replace(/"/g, '""')}",${q.slug},${qrUrl},${scanUrl},${q.createdAt.toISOString()}`
    }),
  ]
  archive.append(csvLines.join("\n"), { name: "qr_codes.csv" })

  // Add individual JSON metadata files
  for (const qr of qrs) {
    const meta = {
      id: qr.id,
      name: qr.name,
      slug: qr.slug,
      type: qr.type,
      scanUrl: `${FRONTEND_URL}/r/${qr.slug}`,
      content: qr.content?.data,
      createdAt: qr.createdAt.toISOString(),
    }
    archive.append(JSON.stringify(meta, null, 2), { name: `qr_${qr.slug}.json` })
  }

  await archive.finalize()
}
