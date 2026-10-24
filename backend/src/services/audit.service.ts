/**
 * Audit Service — fire-and-forget audit log writer.
 * All calls are async and swallow errors to never block request handlers.
 */

import { prisma } from "../db/prisma.js"
import { logger } from "../logger/index.js"

export type AuditCategory = "auth" | "qr" | "billing" | "admin" | "team" | "apikey" | "system"

export interface AuditParams {
  userId?: string | null
  action: string
  category: AuditCategory
  entityId?: string | null
  entityType?: string | null
  metadata?: Record<string, unknown>
  ip?: string | null
  userAgent?: string | null
}

/**
 * Write an audit log entry. Never throws — failures are logged and silently dropped.
 */
export function logAudit(params: AuditParams): void {
  prisma.auditLog
    .create({
      data: {
        userId:     params.userId ?? null,
        action:     params.action,
        category:   params.category,
        entityId:   params.entityId ?? null,
        entityType: params.entityType ?? null,
        metadata:   params.metadata ? JSON.stringify(params.metadata) : undefined,
        ip:         params.ip ?? null,
        userAgent:  params.userAgent ?? null,
      },
    })
    .catch((err: unknown) => {
      logger.error("audit: failed to write log", {
        action: params.action,
        error: err instanceof Error ? err.message : String(err),
      })
    })
}

/**
 * The audit log is kept for this long and then deleted (decided 24 Oct 2026),
 * including entries of deleted accounts — long enough to investigate fraud,
 * abuse or a security incident, bounded so the IPs and emails it holds are not
 * kept forever. Stated in the Privacy policy (§6) and on the GDPR page.
 */
export const AUDIT_LOG_RETENTION_YEARS = 3

/** Deletes entries older than AUDIT_LOG_RETENTION_YEARS. Run from the expiry worker. */
export async function purgeExpiredAuditLogs(now = new Date()): Promise<number> {
  const cutoff = new Date(now)
  cutoff.setUTCFullYear(cutoff.getUTCFullYear() - AUDIT_LOG_RETENTION_YEARS)
  const { count } = await prisma.auditLog.deleteMany({ where: { createdAt: { lt: cutoff } } })
  if (count > 0) logger.info("Deleted audit log entries past retention", { count, olderThan: cutoff.toISOString() })
  return count
}
