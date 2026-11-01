import type { ZObject, Bundle } from "zapier-platform-core"
import { apiUrl } from "./utils/api"

/**
 * Custom auth: the user pastes an API key from GenXQR dashboard → API Keys.
 * The key is sent as `Authorization: Bearer gxqr_...` on every request.
 */
const authentication = {
  type: "custom" as const,
  test: async (z: ZObject, bundle: Bundle) => {
    const response = await z.request({
      url: apiUrl(z, "/v1/qr"),
      params: { page: 1, limit: 1 },
      // Since SDK v18, z.request throws on any 4xx before the checks below run,
      // and users saw a raw stack trace instead of these messages.
      skipThrowForStatus: true,
    })
    if (response.status === 401) {
      throw new z.errors.Error(
        "GenXQR didn't accept this API key. Create one on genxqr.com → API Keys (a key from a test or local site won't work) and paste only that key here.",
        "AuthenticationError",
        response.status,
      )
    }
    if (response.status === 403) {
      // Plan without API access, or a suspended account — the API says which.
      const reason = (response.data as { error?: string } | undefined)?.error
      throw new z.errors.Error(
        `GenXQR refused this account: ${reason ?? "access denied"}. Zapier needs the Pro plan or higher.`,
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
        "Create an API key at [genxqr.com/app/api-keys](https://genxqr.com/app/api-keys). Requires a PRO plan or higher. The key starts with `gxqr_`.",
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
