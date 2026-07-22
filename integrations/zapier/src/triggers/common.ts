import type { ZObject, Bundle } from "zapier-platform-core"
import { apiUrl, genxqrRequest } from "../utils/api"

/**
 * Shared REST Hook subscribe/unsubscribe helpers.
 * Each trigger subscribes to a single event (subscription-per-event model on the backend).
 */

export async function subscribeHook(z: ZObject, bundle: Bundle, event: string): Promise<{ id: string }> {
  const hook = await genxqrRequest<{ id: string }>(z, bundle, {
    method: "POST",
    url: apiUrl(z, "/v1/webhooks"),
    body: {
      url: bundle.targetUrl,
      event,
      source: "zapier",
      name: `Zapier — ${event}`,
    },
  })
  return { id: hook.id }
}

export async function unsubscribeHook(z: ZObject, bundle: Bundle): Promise<{ ok: true }> {
  const id = bundle.subscribeData?.["id"] as string | undefined
  if (!id) return { ok: true }
  await z.request({
    method: "DELETE",
    url: apiUrl(z, `/v1/webhooks/${id}`),
  })
  return { ok: true }
}

/**
 * REST Hook perform: the webhook payload is wrapped as `{ event, timestamp, data }`
 * by the backend (see webhook.service.ts). Zapier needs the flat record, so we unwrap.
 * We also inject a stable `id` field — Zapier dedupes on it.
 */
export function unwrapHookPayload(bundle: Bundle): Record<string, unknown>[] {
  const request = bundle.cleanedRequest as { data?: Record<string, unknown>; event?: string; timestamp?: string } | undefined
  if (!request?.data) return []
  const record: Record<string, unknown> = {
    ...request.data,
    event: request.event,
    timestamp: request.timestamp,
  }
  if (!record["id"]) {
    record["id"] = `${request.event ?? "event"}-${request.timestamp ?? Date.now()}`
  }
  return [record]
}
