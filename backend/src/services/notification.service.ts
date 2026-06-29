import { prisma } from "../db/prisma.js"

export type NotificationType = "SYSTEM" | "FEATURE" | "BILLING" | "LIMIT" | "TEAM"
export const NOTIFICATION_PAGE_LIMIT = 20

// ─── Types ────────────────────────────────────────────────────────────────────

export interface CreateNotificationInput {
  userId: string
  type?: NotificationType
  title: string
  body: string
  actionUrl?: string
}

export interface BroadcastNotificationInput {
  segment: "all" | "free" | "paid" | "trialing" | "past_due" | string
  type: NotificationType
  title: string
  body: string
  actionUrl?: string
}

// ─── Create a single notification ────────────────────────────────────────────

export async function createNotification(input: CreateNotificationInput) {
  const notification = await prisma.notification.create({
    data: {
      userId:    input.userId,
      type:      input.type ?? "SYSTEM",
      title:     input.title,
      body:      input.body,
      actionUrl: input.actionUrl ?? null,
    },
  })
  return notification
}

// ─── Broadcast to a user segment ─────────────────────────────────────────────

export async function broadcastNotification(input: BroadcastNotificationInput): Promise<{ created: number }> {
  const userIds = await resolveSegmentUserIds(input.segment)
  if (userIds.length === 0) return { created: 0 }

  const rows = userIds.map((userId) => ({
    userId,
    type:      input.type,
    title:     input.title,
    body:      input.body,
    actionUrl: input.actionUrl ?? null,
  }))

  // Insert in chunks to avoid huge parameter lists
  const CHUNK = 500
  let created = 0
  for (let i = 0; i < rows.length; i += CHUNK) {
    const result = await prisma.notification.createMany({
      data: rows.slice(i, i + CHUNK),
    })
    created += result.count
  }

  return { created }
}

// ─── Get notifications for a user (paginated) ────────────────────────────────

export async function getUserNotifications(
  userId: string,
  limit  = NOTIFICATION_PAGE_LIMIT,
  offset = 0,
) {
  const [items, totalRows, unreadRows] = await Promise.all([
    prisma.notification.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: limit,
      skip: offset,
    }),
    prisma.notification.count({ where: { userId } }),
    prisma.notification.count({ where: { userId, isRead: false } }),
  ])
  return { items, total: totalRows, unread: unreadRows }
}

// ─── Get unread count only ────────────────────────────────────────────────────

export async function getUnreadCount(userId: string): Promise<number> {
  return prisma.notification.count({ where: { userId, isRead: false } })
}

// ─── Mark a single notification as read ──────────────────────────────────────

export async function markNotificationRead(userId: string, notificationId: string) {
  const notification = await prisma.notification.findFirst({
    where: { id: notificationId, userId },
    select: { id: true }
  })

  if (!notification) return null

  const updated = await prisma.notification.update({
    where: { id: notificationId },
    data: { isRead: true, readAt: new Date() },
  })
  return updated
}

// ─── Mark all notifications as read for a user ───────────────────────────────

export async function markAllNotificationsRead(userId: string): Promise<number> {
  const result = await prisma.notification.updateMany({
    where: { userId, isRead: false },
    data: { isRead: true, readAt: new Date() },
  })
  return result.count
}

// ─── Delete a single notification ────────────────────────────────────────────

export async function deleteNotification(userId: string, notificationId: string): Promise<boolean> {
  const notification = await prisma.notification.findFirst({
    where: { id: notificationId, userId },
    select: { id: true }
  })

  if (!notification) return false
  await prisma.notification.delete({ where: { id: notificationId } })
  return true
}

// ─── Clear all read notifications for a user ─────────────────────────────────

export async function clearReadNotifications(userId: string): Promise<number> {
  const result = await prisma.notification.deleteMany({
    where: { userId, isRead: true },
  })
  return result.count
}

// ─── Clear ALL notifications for a user ──────────────────────────────────────

export async function clearAllNotifications(userId: string): Promise<number> {
  const result = await prisma.notification.deleteMany({
    where: { userId },
  })
  return result.count
}

// ─── Segment resolver ────────────────────────────────────────────────────────

async function resolveSegmentUserIds(segment: string): Promise<string[]> {
  const isUserId = segment.length > 10 && !["all", "free", "paid", "trialing", "past_due"].includes(segment)
  if (isUserId) {
    const user = await prisma.user.findUnique({
      where: { id: segment },
      select: { id: true }
    })
    return user ? [user.id] : []
  }

  if (segment === "all") {
    const rows = await prisma.user.findMany({
      select: { id: true }
    })
    return rows.map((u: any) => u.id)
  }

  if (segment === "free") {
    // Users with no subscription or FREE plan subscription
    const freePlanRows = await prisma.subscription.findMany({
      where: { plan: { name: "FREE" } },
      select: { userId: true }
    })

    const freePlanUserIds = freePlanRows.map((r: any) => r.userId)

    const subsUserIds = (await prisma.subscription.findMany({
      select: { userId: true }
    })).map((r: any) => r.userId)

    // Users with no subscription at all
    const allUsersRows = await prisma.user.findMany({
      select: { id: true }
    })
    const noSubUserIds = allUsersRows
      .map((u: any) => u.id)
      .filter((id: string) => !subsUserIds.includes(id))

    return [...new Set([...freePlanUserIds, ...noSubUserIds])]
  }

  if (segment === "paid") {
    const paidPlanNames = ["STARTER", "PRO", "BUSINESS", "ENTERPRISE"] as const
    const rows = await prisma.subscription.findMany({
      where: {
        status: "ACTIVE",
        plan: { name: { in: paidPlanNames as any } }
      },
      select: { userId: true }
    })
    return rows.map((r: any) => r.userId)
  }

  if (segment === "trialing") {
    const rows = await prisma.subscription.findMany({
      where: { status: "TRIALING" },
      select: { userId: true }
    })
    return rows.map((r: any) => r.userId)
  }

  if (segment === "past_due") {
    const rows = await prisma.subscription.findMany({
      where: { status: "PAST_DUE" },
      select: { userId: true }
    })
    return rows.map((r: any) => r.userId)
  }

  return []
}
