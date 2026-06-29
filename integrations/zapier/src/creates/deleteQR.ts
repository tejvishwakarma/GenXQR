import type { ZObject, Bundle } from "zapier-platform-core"
import { apiUrl } from "../utils/api"

async function perform(z: ZObject, bundle: Bundle): Promise<{ deleted: true; id: string }> {
  const { qrId } = bundle.inputData as { qrId: string }
  const response = await z.request({
    method: "DELETE",
    url: apiUrl(z, `/v1/qr/${encodeURIComponent(qrId)}`),
  })
  if (response.status >= 400 && response.status !== 404) {
    const payload = response.data as { error?: string } | undefined
    throw new z.errors.Error(payload?.error ?? `HTTP ${response.status}`, "GenXQRApiError", response.status)
  }
  return { deleted: true, id: qrId }
}

export default {
  key: "delete_qr",
  noun: "QR Code",
  display: {
    label: "Delete QR Code",
    description: "Permanently deletes a QR code. This cannot be undone — the slug is also released.",
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
    sample: { deleted: true, id: "qr_01HPAX9K7XABC" },
  },
}
