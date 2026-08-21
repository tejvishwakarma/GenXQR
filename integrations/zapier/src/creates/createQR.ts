import type { ZObject, Bundle } from "zapier-platform-core"
import { apiUrl, genxqrRequest } from "../utils/api"

const URL_TYPES = ["URL", "WHATSAPP", "INSTAGRAM", "FACEBOOK"] as const

async function perform(z: ZObject, bundle: Bundle): Promise<Record<string, unknown>> {
  const { name, type, destinationUrl, tags } = bundle.inputData as {
    name: string
    type: string
    destinationUrl: string
    tags?: string
  }

  const tagList = tags
    ? tags.split(",").map((t) => t.trim()).filter(Boolean).slice(0, 10)
    : []

  const body = {
    name,
    type,
    category: "DYNAMIC",
    tags: tagList,
    content: { data: { url: destinationUrl } },
  }

  return genxqrRequest<Record<string, unknown>>(z, bundle, {
    method: "POST",
    url: apiUrl(z, "/v1/qr"),
    body,
  })
}

export default {
  key: "create_qr",
  noun: "QR Code",
  display: {
    label: "Create QR Code",
    description: "Creates a dynamic QR code that redirects to the given URL. You can edit the destination later without reprinting.",
  },
  operation: {
    perform,
    inputFields: [
      { key: "name", label: "Name", required: true, type: "string" as const, helpText: "Internal label for this QR code." },
      {
        key: "type",
        label: "Type",
        required: true,
        type: "string" as const,
        default: "URL",
        choices: URL_TYPES.reduce<Record<string, string>>((acc, t) => {
          acc[t] = t.charAt(0) + t.slice(1).toLowerCase()
          return acc
        }, {}),
        helpText: "The content type. For non-URL types (PDF, vCard, WiFi, etc.) use the GenXQR dashboard.",
      },
      {
        key: "destinationUrl",
        label: "Destination URL",
        required: true,
        type: "string" as const,
        helpText: "The URL users will be redirected to when they scan this QR code.",
      },
      {
        key: "tags",
        label: "Tags",
        required: false,
        type: "string" as const,
        helpText: "Comma-separated tags (max 10).",
      },
    ],
    sample: {
      id: "qr_01HPAX9K7XABC",
      name: "Product Brochure",
      slug: "product-brochure",
      type: "URL",
      category: "DYNAMIC",
      isActive: true,
      shortUrl: "https://genxqr.com/r/product-brochure",
    },
  },
}
