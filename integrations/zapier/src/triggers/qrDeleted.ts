import type { ZObject, Bundle } from "zapier-platform-core"
import { subscribeHook, unsubscribeHook, unwrapHookPayload } from "./common"

const EVENT = "qr.deleted"

/**
 * Deletion events are pure hooks — there's nothing to poll for since the
 * records are gone. We return an empty list for Zapier's sample fetch and
 * rely on the static `sample` for UI preview.
 */
async function performList(): Promise<Record<string, unknown>[]> {
  return []
}

export default {
  key: "qr_deleted",
  noun: "QR Code",
  display: {
    label: "QR Code Deleted",
    description: "Triggers when a QR code is deleted from your account.",
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
      qrId: "qr_01HPAX9K7XABC",
      name: "Product Brochure",
      slug: "product-brochure",
      deletedAt: "2026-04-17T10:30:00.000Z",
    },
    outputFields: [
      { key: "qrId", label: "QR Code ID" },
      { key: "name", label: "Name" },
      { key: "slug", label: "Slug" },
      { key: "deletedAt", label: "Deleted At", type: "datetime" as const },
    ],
  },
}
