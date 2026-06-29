import type { ZObject, Bundle } from "zapier-platform-core"
import { apiUrl } from "./utils/api"

/**
 * Custom auth: the user pastes an API key from GenXQR dashboard → API Keys.
 * The key is sent as `Authorization: Bearer nxqr_...` on every request.
 */
const authentication = {
  type: "custom" as const,
  test: async (z: ZObject, bundle: Bundle) => {
    const response = await z.request({
      url: apiUrl(z, "/v1/qr"),
      params: { page: 1, limit: 1 },
    })
    if (response.status === 401 || response.status === 403) {
      throw new z.errors.Error(
        "The API key is invalid. Generate one at genxqr.in/app/api-keys and paste it here.",
        "AuthenticationError",
        response.status,
      )
    }
    if (response.status >= 400) {
      throw new z.errors.Error(`GenXQR API returned ${response.status}`, "AuthenticationError", response.status)
    }
    // Return the connection label data — Zapier shows this as "Connected as ..."
    return { connected: true, label: bundle.authData["apiKey"]?.slice(0, 12) ?? "GenXQR" }
  },
  fields: [
    {
      key: "apiKey",
      label: "API Key",
      required: true,
      type: "string" as const,
      helpText:
        "Create an API key at [genxqr.in/app/api-keys](https://genxqr.in/app/api-keys). Requires a PRO plan or higher. The key starts with `nxqr_`.",
    },
  ],
  connectionLabel: "GenXQR ({{bundle.authData.label}})",
}

/**
 * Attach the bearer token to every outgoing request.
 */
export const includeBearerToken = (request: { headers?: Record<string, string> }, z: ZObject, bundle: Bundle) => {
  if (bundle.authData["apiKey"]) {
    request.headers = {
      ...request.headers,
      Authorization: `Bearer ${bundle.authData["apiKey"]}`,
    }
  }
  return request
}

export default authentication
