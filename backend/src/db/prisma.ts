import { PrismaClient } from "@prisma/client"
import { requestContext } from "../utils/request-context.js"

declare global {
  // eslint-disable-next-line no-var
  var __prisma: PrismaClient | undefined
}

/**
 * Singleton Prisma client.
 * uses globalThis in dev to survive hot-reloads without exhausting connections.
 */
export const prisma: PrismaClient =
  globalThis.__prisma ??
  new PrismaClient({
    log:
      process.env.NODE_ENV === "production"
        ? ["error"]
        : ["warn", "error"],
  })

if (process.env.NODE_ENV !== "production") {
  globalThis.__prisma = prisma
}

/**
 * Every audit row written during an admin impersonation session records that
 * admin in metadata.impersonatedBy — whichever of the ~40 audit call sites
 * wrote it. Before, actions taken while impersonating looked like the
 * customer's own (audit, 24 Oct 2026). Registered once per client.
 */
const AUDIT_HOOK = Symbol.for("genxqr.auditImpersonationHook")
const client = prisma as PrismaClient & { [AUDIT_HOOK]?: true }
if (!client[AUDIT_HOOK]) {
  client[AUDIT_HOOK] = true
  prisma.$use(async (params, next) => {
    const impersonatedBy = requestContext.getStore()?.impersonatedBy
    if (impersonatedBy && params.model === "AuditLog" && (params.action === "create" || params.action === "createMany")) {
      const stamp = (data: Record<string, unknown>) => ({
        ...data,
        metadata: { ...((data.metadata as Record<string, unknown> | null) ?? {}), impersonatedBy },
      })
      const data = params.args?.data
      params.args.data = Array.isArray(data) ? data.map(stamp) : stamp(data ?? {})
    }
    return next(params)
  })
}
