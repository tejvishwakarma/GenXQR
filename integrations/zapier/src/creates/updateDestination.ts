import type { ZObject, Bundle } from "zapier-platform-core"
import { apiUrl, nexusRequest } from "../utils/api"

async function listQRsDropdown(z: ZObject, bundle: Bundle): Promise<Array<Record<string, unknown>>> {
  return nexusRequest<Array<Record<string, unknown>>>(z, bundle, {
    url: apiUrl(z, "/v1/qr"),
    params: { page: 1, limit: 50, sort: "updatedAt" },
  })
}

async function perform(z: ZObject, bundle: Bundle): Promise<Record<string, unknown>> {
  const { qrId, destinationUrl } = bundle.inputData as { qrId: string; destinationUrl: string }
  return nexusRequest<Record<string, unknown>>(z, bundle, {
    method: "PATCH",
    url: apiUrl(z, `/v1/qr/${encodeURIComponent(qrId)}`),
    body: { content: { data: { url: destinationUrl } } },
  })
}

export default {
  key: "update_destination",
  noun: "QR Destination",
  display: {
    label: "Update QR Destination",
    description: "Changes where a dynamic QR code redirects to. The printed QR stays the same.",
  },
  operation: {
    perform,
    inputFields: [
      {
        key: "qrId",
        label: "QR Code",
        required: true,
        type: "string" as const,
        dynamic: "qr_list.id.name",
        helpText: "The QR code to update.",
      },
      {
        key: "destinationUrl",
        label: "New Destination URL",
        required: true,
        type: "string" as const,
      },
    ],
    sample: {
      id: "qr_01HPAX9K7XABC",
      name: "Product Brochure",
      slug: "product-brochure",
      isActive: true,
    },
  },
  // Not exported as a user-facing trigger — only used as a dropdown source.
  listQRsDropdown,
}

export const qrListHidden = {
  key: "qr_list",
  noun: "QR Code",
  display: { label: "List QR Codes", description: "Hidden.", hidden: true },
  operation: {
    perform: listQRsDropdown,
    canPaginate: false,
    sample: { id: "qr_01HPAX9K7XABC", name: "Product Brochure" },
  },
}
