import type { ZObject, Bundle } from "zapier-platform-core"
import { apiUrl, genxqrRequest } from "../utils/api"
import { subscribeHook, unsubscribeHook, unwrapHookPayload } from "./common"

const EVENT = "qr.updated"

async function performList(z: ZObject, bundle: Bundle): Promise<Record<string, unknown>[]> {
  const qrs = await genxqrRequest<Array<Record<string, unknown>>>(z, bundle, {
    url: apiUrl(z, "/v1/qr"),
    params: { page: 1, limit: 3, sort: "updatedAt" },
  })
  return qrs.map((qr) => ({ ...qr, event: EVENT, id: `${qr["id"]}-${qr["updatedAt"]}` }))
}

export default {
  key: "qr_updated",
  noun: "QR Code",
  display: {
    label: "QR Code Updated",
    description: "Triggers when a QR code's destination or settings are updated.",
  },
  operation: {
    type: "hook" as const,
    perform: (_z: ZObject, bundle: Bundle) => unwrapHookPayload(bundle),
    performList,
    performSubscribe: (z: ZObject, bundle: Bundle) => subscribeHook(z, bundle, EVENT),
    performUnsubscribe: unsubscribeHook,
    sample: {
      id: "qr_01HPAX9K7XABC-2026-04-17T10:30:00.000Z",
      event: EVENT,
      qrId: "qr_01HPAX9K7XABC",
      name: "Product Brochure",
      slug: "product-brochure",
      isActive: true,
      updatedAt: "2026-04-17T10:30:00.000Z",
    },
    outputFields: [
      { key: "qrId", label: "QR Code ID" },
      { key: "name", label: "Name" },
      { key: "slug", label: "Slug" },
      { key: "isActive", label: "Active", type: "boolean" as const },
      { key: "updatedAt", label: "Updated At", type: "datetime" as const },
    ],
  },
}
