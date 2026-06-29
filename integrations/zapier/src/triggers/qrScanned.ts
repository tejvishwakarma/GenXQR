import type { ZObject, Bundle } from "zapier-platform-core"
import { apiUrl, nexusRequest } from "../utils/api"
import { subscribeHook, unsubscribeHook, unwrapHookPayload } from "./common"

const EVENT = "qr.scanned"

/**
 * Sample fetch used by Zapier's "Find sample data" step.
 * Pulls the user's most recent QR, then its most recent scans.
 * Returns an empty list if the user has no QR codes yet.
 */
async function performList(z: ZObject, bundle: Bundle): Promise<Record<string, unknown>[]> {
  const qrList = await nexusRequest<Array<{ id: string; slug: string; name: string }>>(z, bundle, {
    url: apiUrl(z, "/v1/qr"),
    params: { page: 1, limit: 1, sort: "updatedAt" },
  })
  if (!qrList.length) return []
  const target = qrList[0]!
  const scans = await nexusRequest<Array<Record<string, unknown>>>(z, bundle, {
    url: apiUrl(z, `/v1/qr/${target.id}/scans`),
    params: { limit: 3 },
  })
  return scans.map((scan) => ({
    ...scan,
    event: EVENT,
    qrId: target.id,
    qrSlug: target.slug,
    qrName: target.name,
  }))
}

export default {
  key: "qr_scanned",
  noun: "Scan",
  display: {
    label: "New QR Scan",
    description: "Triggers when any of your QR codes is scanned.",
  },
  operation: {
    type: "hook" as const,
    perform: (_z: ZObject, bundle: Bundle) => unwrapHookPayload(bundle),
    performList,
    performSubscribe: (z: ZObject, bundle: Bundle) => subscribeHook(z, bundle, EVENT),
    performUnsubscribe: unsubscribeHook,
    sample: {
      id: "scan_01HPAX9K7XQYZ",
      event: EVENT,
      qrId: "qr_01HPAX9K7XABC",
      qrSlug: "product-brochure",
      qrName: "Product Brochure",
      scannedAt: "2026-04-17T10:30:00.000Z",
      country: "India",
      countryCode: "IN",
      city: "Mumbai",
      region: "Maharashtra",
      deviceType: "MOBILE",
      os: "iOS",
      browser: "Safari",
      referrer: null,
    },
    outputFields: [
      { key: "id", label: "Scan ID" },
      { key: "qrId", label: "QR Code ID" },
      { key: "qrSlug", label: "QR Code Slug" },
      { key: "qrName", label: "QR Code Name" },
      { key: "scannedAt", label: "Scanned At", type: "datetime" as const },
      { key: "country", label: "Country" },
      { key: "countryCode", label: "Country Code" },
      { key: "city", label: "City" },
      { key: "region", label: "Region" },
      { key: "deviceType", label: "Device Type" },
      { key: "os", label: "Operating System" },
      { key: "browser", label: "Browser" },
      { key: "referrer", label: "Referrer URL" },
    ],
  },
}
