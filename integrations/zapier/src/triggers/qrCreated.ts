import type { ZObject, Bundle } from "zapier-platform-core"
import { apiUrl, genxqrRequest } from "../utils/api"
import { subscribeHook, unsubscribeHook, unwrapHookPayload } from "./common"

const EVENT = "qr.created"

async function performList(z: ZObject, bundle: Bundle): Promise<Record<string, unknown>[]> {
  const qrs = await genxqrRequest<Array<Record<string, unknown>>>(z, bundle, {
    url: apiUrl(z, "/v1/qr"),
    params: { page: 1, limit: 3, sort: "createdAt" },
  })
  return qrs.map((qr) => ({ ...qr, event: EVENT }))
}

export default {
  key: "qr_created",
  noun: "QR Code",
  display: {
    label: "New QR Code",
    description: "Triggers when a new QR code is created in your account.",
  },
  operation: {
    type: "hook" as const,
    perform: (_z: ZObject, bundle: Bundle) => unwrapHookPayload(bundle),
    performList,
    performSubscribe: (z: ZObject, bundle: Bundle) => subscribeHook(z, bundle, EVENT),
    performUnsubscribe: unsubscribeHook,
    sample: {
      id: "qr_01HPAX9K7XABC",
      event: EVENT,
      name: "Product Brochure",
      slug: "product-brochure",
      type: "PDF",
      category: "DYNAMIC",
      isActive: true,
      redirectUrl: "https://genxqr.in/r/product-brochure",
      shortUrl: "https://genxqr.in/r/product-brochure",
      createdAt: "2026-04-17T10:30:00.000Z",
    },
    outputFields: [
      { key: "id", label: "QR Code ID" },
      { key: "name", label: "Name" },
      { key: "slug", label: "Slug" },
      { key: "type", label: "Type" },
      { key: "category", label: "Category" },
      { key: "isActive", label: "Active", type: "boolean" as const },
      { key: "redirectUrl", label: "Redirect URL" },
      { key: "shortUrl", label: "Short URL" },
      { key: "createdAt", label: "Created At", type: "datetime" as const },
    ],
  },
}
