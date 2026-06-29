import type { ZObject, Bundle } from "zapier-platform-core"
import { apiUrl, nexusRequest } from "../utils/api"

async function perform(z: ZObject, bundle: Bundle): Promise<Record<string, unknown>> {
  const { qrId } = bundle.inputData as { qrId: string }
  return nexusRequest<Record<string, unknown>>(z, bundle, {
    method: "PATCH",
    url: apiUrl(z, `/v1/qr/${encodeURIComponent(qrId)}/toggle`),
  })
}

export default {
  key: "toggle_qr",
  noun: "QR Code",
  display: {
    label: "Activate / Deactivate QR Code",
    description: "Flips a QR code between active and inactive. Inactive QR codes show the fallback URL when scanned.",
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
      },
    ],
    sample: { id: "qr_01HPAX9K7XABC", isActive: false },
  },
}
