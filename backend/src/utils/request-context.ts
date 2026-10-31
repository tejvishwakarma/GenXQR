import { AsyncLocalStorage } from "node:async_hooks"

/**
 * Per-request facts that code far from the route needs without threading them
 * through every call. Today: which admin, if any, is impersonating — so every
 * audit row written during that request names them (db/prisma.ts).
 */
export interface RequestContext {
  /** Admin user id behind an impersonation session (the token's `act` claim). */
  impersonatedBy?: string
  /**
   * The workspace owner this request acts for (withWorkspace). Audit rows
   * written during the request belong to this account's activity log, even
   * when a team member is the one acting (db/prisma.ts).
   */
  workspaceOwnerId?: string
}

export const requestContext = new AsyncLocalStorage<RequestContext>()
