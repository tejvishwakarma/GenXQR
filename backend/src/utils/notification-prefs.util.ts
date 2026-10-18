/**
 * Email notification preferences (User.notificationPrefs, a Json column).
 *
 * Until 18 Oct 2026 the value was saved as JSON.stringify(prefs) — a JSON
 * *string* inside the Json column — while the reader validated it as an
 * *object*, so every saved preference read back as the defaults and none was
 * ever honoured. Writes now store the object; readPrefs() accepts both shapes,
 * so preferences saved under the old code are recovered rather than lost.
 */
import { z } from "zod"

export const NotificationPrefsSchema = z.object({
  scanMilestoneAlerts: z.boolean(),
  weeklyAnalyticsDigest: z.boolean(),
  billingReminders: z.boolean(),
  productUpdates: z.boolean(),
})

export type NotificationPrefs = z.infer<typeof NotificationPrefsSchema>

export const DEFAULT_NOTIFICATION_PREFS: NotificationPrefs = {
  scanMilestoneAlerts: true,
  weeklyAnalyticsDigest: true,
  billingReminders: true,
  productUpdates: true,
}

/** The stored preferences, or the defaults if none (or unreadable) are stored. */
export function readPrefs(raw: unknown): NotificationPrefs {
  let value = raw
  if (typeof value === "string") {
    try {
      value = JSON.parse(value)
    } catch {
      return DEFAULT_NOTIFICATION_PREFS
    }
  }
  const parsed = NotificationPrefsSchema.partial().safeParse(value)
  return parsed.success ? { ...DEFAULT_NOTIFICATION_PREFS, ...parsed.data } : DEFAULT_NOTIFICATION_PREFS
}
