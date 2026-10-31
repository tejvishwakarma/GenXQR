/**
 * Cloudflare for SaaS client — custom hostnames on the genxqr.com zone.
 *
 * A customer's domain (qr.brand.com) is CNAMEd to CUSTOM_DOMAIN_TARGET, the
 * zone's fallback origin. Registering it here makes Cloudflare accept traffic
 * for it, issue its HTTPS certificate (HTTP validation, which works once the
 * CNAME is in place) and proxy it to our origin like genxqr.com itself.
 *
 * Docs: https://developers.cloudflare.com/cloudflare-for-platforms/cloudflare-for-saas/
 *   POST   /zones/{zone}/custom_hostnames
 *   GET    /zones/{zone}/custom_hostnames/{id}
 *   DELETE /zones/{zone}/custom_hostnames/{id}
 */

import { env } from "../config/env.js"
import { AppError } from "../middleware/error.middleware.js"
import { logger } from "../logger/index.js"

const API = "https://api.cloudflare.com/client/v4"
const REQUEST_TIMEOUT_MS = 15_000

export interface CloudflareCustomHostname {
  id: string
  hostname: string
  /** pending | active | moved | deleted | blocked | … */
  status: string
  ssl?: {
    status?: string
    validation_errors?: Array<{ message?: string }>
  }
  verification_errors?: string[]
}

export function isCloudflareSaasConfigured(): boolean {
  return Boolean(env.CLOUDFLARE_API_TOKEN && env.CLOUDFLARE_ZONE_ID && env.CUSTOM_DOMAIN_TARGET)
}

async function cfRequest<T>(method: "GET" | "POST" | "DELETE", path: string, body?: unknown): Promise<{ status: number; result: T | null }> {
  if (!isCloudflareSaasConfigured()) {
    throw new AppError(503, "Custom domains are not available yet. Please try again later.")
  }
  let response: Response
  try {
    response = await fetch(`${API}/zones/${encodeURIComponent(env.CLOUDFLARE_ZONE_ID!)}${path}`, {
      method,
      headers: { Authorization: `Bearer ${env.CLOUDFLARE_API_TOKEN}`, "Content-Type": "application/json" },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    })
  } catch (err) {
    logger.error("Cloudflare request failed", { method, path, error: err instanceof Error ? err.message : String(err) })
    throw new AppError(502, "Could not reach our domain provider. Please try again.")
  }

  const parsed = (await response.json().catch(() => null)) as
    | { success?: boolean; result?: T; errors?: Array<{ code?: number; message?: string }> }
    | null

  if (response.status === 404) return { status: 404, result: null }
  if (!response.ok || !parsed?.success) {
    logger.error("Cloudflare API error", { method, path, status: response.status, errors: parsed?.errors })
    // 409 from Cloudflare = the hostname is already registered (on this zone or another).
    if (response.status === 409 || parsed?.errors?.some((e) => e.code === 1406)) {
      throw new AppError(409, "This domain is already connected to another service. Remove it there first.")
    }
    throw new AppError(502, "Our domain provider rejected the request. Please try again or contact support.")
  }
  return { status: response.status, result: parsed.result ?? null }
}

export async function createCustomHostname(hostname: string): Promise<CloudflareCustomHostname> {
  const { result } = await cfRequest<CloudflareCustomHostname>("POST", "/custom_hostnames", {
    hostname,
    ssl: { method: "http", type: "dv", settings: { min_tls_version: "1.2" } },
  })
  if (!result) throw new AppError(502, "Our domain provider returned an empty response.")
  return result
}

/** Null when Cloudflare no longer has it. */
export async function getCustomHostname(id: string): Promise<CloudflareCustomHostname | null> {
  const { result } = await cfRequest<CloudflareCustomHostname>("GET", `/custom_hostnames/${encodeURIComponent(id)}`)
  return result
}

/** Idempotent: a hostname Cloudflare already forgot counts as deleted. */
export async function deleteCustomHostname(id: string): Promise<void> {
  await cfRequest("DELETE", `/custom_hostnames/${encodeURIComponent(id)}`)
}
