import type { ZObject, Bundle, HttpRequestOptions } from "zapier-platform-core"

/**
 * The base URL for the GenXQR developer REST API.
 * Overridable via the Zapier app's environment variable `GenXQR_API_URL`,
 * which lets us point at staging during review without rebuilding.
 */
export function apiBaseUrl(z: ZObject): string {
  const override = (z as unknown as { process?: { env?: Record<string, string | undefined> } })
    .process?.env?.["GenXQR_API_URL"]
  return override ?? "https://genxqr.com"
}

export function apiUrl(z: ZObject, path: string): string {
  const base = apiBaseUrl(z).replace(/\/$/, "")
  return `${base}${path.startsWith("/") ? path : `/${path}`}`
}

/**
 * Wrapper around z.request that throws a consistent error on non-2xx responses.
 * Zapier's default behaviour surfaces HTTP errors as task history entries; this
 * normalises the message so users see the API's error string rather than raw JSON.
 */
export async function genxqrRequest<T = unknown>(
  z: ZObject,
  bundle: Bundle,
  options: HttpRequestOptions & { url: string },
): Promise<T> {
  const response = await z.request({
    ...options,
    headers: {
      Accept: "application/json",
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...options.headers,
    },
  })

  if (response.status >= 400) {
    const payload = response.data as { error?: string; message?: string } | undefined
    const message = payload?.error ?? payload?.message ?? `HTTP ${response.status}`
    throw new z.errors.Error(`GenXQR: ${message}`, "GenXQRApiError", response.status)
  }

  const body = response.data as { success?: boolean; data?: T } | T
  if (body && typeof body === "object" && "success" in body && "data" in body) {
    return (body as { data: T }).data
  }
  return body as T
}
