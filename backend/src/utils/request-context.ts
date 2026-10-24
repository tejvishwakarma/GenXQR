import { AsyncLocalStorage } from "node:async_hooks"

/**
 * Per-request facts that code far from the route needs without threading them
 * through every call. Today: which admin, if any, is impersonating — so every
 * audit row written during that request names them (db/prisma.ts).
 */
export interface RequestContext {
  /** Admin user id behind an impersonation session (the token's `act` claim). */
  impersonatedBy?: string
}

export const requestContext = new AsyncLocalStorage<RequestContext>()
