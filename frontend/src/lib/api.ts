/**
 * Thin API client. All requests go through here so auth headers,
 * base URL, and error handling are centralised.
 */

const BASE_URL = (import.meta.env.VITE_API_URL as string | undefined) ?? ""

/**
 * Returns the base origin to embed inside QR codes.
 * When VITE_PUBLIC_BASE_URL is set (e.g. "https://192.168.1.15:5173") that value
 * is used so scans work from any device on the local network.  Falls back to
 * window.location.origin for production / default dev usage.
 */
export function getQrBaseUrl(): string {
  return (import.meta.env.VITE_PUBLIC_BASE_URL as string | undefined)?.replace(/\/$/, "") || window.location.origin
}

export class ApiError extends Error {
  readonly status: number
  constructor(status: number, message: string) {
    super(message)
    this.name = "ApiError"
    this.status = status
  }
}

const IMPERSONATION_STORAGE_KEY = "impersonation_context"

interface ImpersonationContext {
  adminAccessToken: string
  adminUser: AuthUser
  targetUser: AuthUser
  startedAt: string
  expiresInSeconds: number
}

function getStoredUser(): AuthUser | null {
  try {
    const raw = localStorage.getItem("user")
    return raw ? (JSON.parse(raw) as AuthUser) : null
  } catch {
    return null
  }
}

export function clearClientSession(): void {
  localStorage.removeItem("access_token")
  localStorage.removeItem("user")
  localStorage.removeItem(IMPERSONATION_STORAGE_KEY)
}

export function startImpersonationSession(params: {
  token: string
  targetUser: AuthUser
  expiresInSeconds: number
}): void {
  const adminAccessToken = localStorage.getItem("access_token")
  const adminUser = getStoredUser()

  if (!adminAccessToken || !adminUser) {
    throw new Error("Cannot impersonate without an active admin session")
  }

  const context: ImpersonationContext = {
    adminAccessToken,
    adminUser,
    targetUser: params.targetUser,
    startedAt: new Date().toISOString(),
    expiresInSeconds: params.expiresInSeconds,
  }

  localStorage.setItem(IMPERSONATION_STORAGE_KEY, JSON.stringify(context))
  localStorage.setItem("access_token", params.token)
  localStorage.setItem("user", JSON.stringify(params.targetUser))
}

function getImpersonationContext(): ImpersonationContext | null {
  try {
    const raw = localStorage.getItem(IMPERSONATION_STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<ImpersonationContext>
    if (
      typeof parsed.adminAccessToken !== "string"
      || typeof parsed.expiresInSeconds !== "number"
      || !parsed.adminUser
      || !parsed.targetUser
    ) {
      return null
    }
    return parsed as ImpersonationContext
  } catch {
    return null
  }
}

export function isImpersonatingSessionActive(): boolean {
  return getImpersonationContext() !== null
}

export function stopImpersonationSession(): boolean {
  const context = getImpersonationContext()
  if (!context) return false
  localStorage.setItem("access_token", context.adminAccessToken)
  localStorage.setItem("user", JSON.stringify(context.adminUser))
  localStorage.removeItem(IMPERSONATION_STORAGE_KEY)
  return true
}

// ─── Silent token refresh ─────────────────────────────────────────────────────
// Deduplicated: if multiple concurrent requests fail with 401, only one refresh
// call is made and all waiters share the result.

let _refreshPromise: Promise<string | null> | null = null

async function silentRefresh(): Promise<string | null> {
  if (_refreshPromise) return _refreshPromise
  _refreshPromise = fetch(`${BASE_URL}/api/auth/refresh`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
  })
    .then(async (r) => {
      if (!r.ok) return null
      const body = (await r.json()) as { data: { accessToken: string } }
      const token = body.data.accessToken
      localStorage.setItem("access_token", token)
      return token
    })
    .catch(() => null)
    .finally(() => { _refreshPromise = null })
  return _refreshPromise
}

async function parseErrorBody(res: Response): Promise<string> {
  const fallback = `Request failed (${res.status})`
  try {
    const body = await res.clone().json() as { message?: string; error?: string; details?: Record<string, string[]> }
    if (body.message) return body.message
    // Check field-level details before the generic `error` string — the
    // backend's Zod validation errors always set error: "Validation failed"
    // alongside details, so checking `error` first meant the specific field
    // message (e.g. "FB Pixel ID must be numeric") was never reachable.
    if (body.details) {
      const first = Object.values(body.details).flat()[0]
      if (first) return first
    }
    if (body.error) return body.error
  } catch { /* ignore parse errors */ }
  return fallback
}

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    credentials: "include",
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
  })

  // 401 on a protected route: attempt silent token refresh, then retry once.
  // Only hard-redirect to /login if the refresh also fails.
  if (res.status === 401 && !path.startsWith("/api/auth/")) {
    if (isImpersonatingSessionActive()) {
      const restored = stopImpersonationSession()
      if (restored) {
        window.location.href = "/admin"
        throw new ApiError(401, "Impersonation session expired. Returned to admin session.")
      }
      clearClientSession()
      window.location.href = "/login"
      throw new ApiError(401, "Session expired. Please log in again.")
    }

    const newToken = await silentRefresh()
    if (newToken) {
      const retryRes = await fetch(`${BASE_URL}${path}`, {
        credentials: "include",
        ...init,
        headers: {
          "Content-Type": "application/json",
          ...(init?.headers as Record<string, string> | undefined),
          Authorization: `Bearer ${newToken}`,
        },
      })
      if (retryRes.ok) return retryRes.json() as Promise<T>
      if (retryRes.status === 401) {
        clearClientSession()
        window.location.href = "/login"
        throw new ApiError(401, "Session expired. Please log in again.")
      }
      throw new ApiError(retryRes.status, await parseErrorBody(retryRes))
    }
    // Refresh token also expired — full logout
    clearClientSession()
    window.location.href = "/login"
    throw new ApiError(401, "Session expired. Please log in again.")
  }

  if (!res.ok) {
    throw new ApiError(res.status, await parseErrorBody(res))
  }

  return res.json() as Promise<T>
}

// ─── Auth helpers ─────────────────────────────────────────────────────────────

export interface AuthUser {
  id: string
  email: string
  name: string
  role: "USER" | "ADMIN" | "SUPER_ADMIN"
  avatarUrl?: string | null
}

export interface LoginResponse {
  success: boolean
  data: { accessToken: string; user: AuthUser }
}

export function login(email: string, password: string) {
  return apiFetch<LoginResponse>("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  })
}

export function resendVerificationEmail(email: string) {
  return apiFetch<{ success: boolean; message: string }>("/api/auth/resend-verification", {
    method: "POST",
    body: JSON.stringify({ email }),
  })
}


/**
 * Exchanges a one-time OAuth code (issued by the Google callback) for an access token.
 * Must be called within 60 seconds of the redirect. Single-use.
 */
export async function exchangeOAuthCode(code: string): Promise<string> {
  const res = await fetch(`${BASE_URL}/api/auth/oauth-token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ code }),
  })
  if (!res.ok) {
    throw new Error("OAuth code exchange failed")
  }
  const json = await res.json() as { success: boolean; data: { accessToken: string } }
  return json.data.accessToken
}

export function getCurrentUser() {
  const token = localStorage.getItem("access_token") ?? ""
  return apiFetch<{ success: boolean; data: AuthUser }>("/api/auth/me", {
    headers: { Authorization: `Bearer ${token}` },
  })
}

export async function uploadAvatar(file: File): Promise<{ avatarUrl: string }> {
  let token = localStorage.getItem("access_token") ?? ""
  const form = new FormData()
  form.append("avatar", file)

  const doRequest = (bearerToken: string) =>
    fetch(`${BASE_URL}/api/auth/me/avatar`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${bearerToken}` },
      credentials: "include",
      body: form,
    })

  let res = await doRequest(token)

  if (res.status === 401) {
    const newToken = await silentRefresh()
    if (newToken) {
      res = await doRequest(newToken)
    } else {
      clearClientSession()
      window.location.href = "/login"
      throw new ApiError(401, "Session expired. Please log in again.")
    }
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as { message?: string; error?: string }
    throw new ApiError(res.status, body.message ?? body.error ?? "Avatar upload failed")
  }
  const json = await res.json() as { success: boolean; data: { avatarUrl: string } }
  return json.data
}

export async function removeAvatar(): Promise<void> {
  let token = localStorage.getItem("access_token") ?? ""

  const doRequest = (bearerToken: string) =>
    fetch(`${BASE_URL}/api/auth/me/avatar`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${bearerToken}` },
      credentials: "include",
    })

  let res = await doRequest(token)

  if (res.status === 401) {
    const newToken = await silentRefresh()
    if (newToken) {
      res = await doRequest(newToken)
    } else {
      clearClientSession()
      window.location.href = "/login"
      throw new ApiError(401, "Session expired. Please log in again.")
    }
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as { message?: string; error?: string }
    throw new ApiError(res.status, body.message ?? body.error ?? "Failed to remove avatar")
  }
}

export interface RegisterResponse {
  success: boolean
  message: string
  data: { id: string; email: string; name: string }
}

export function register(name: string, email: string, password: string) {
  return apiFetch<RegisterResponse>("/api/auth/register", {
    method: "POST",
    body: JSON.stringify({ name, email, password }),
  })
}

export interface NotificationPreferences {
  scanMilestoneAlerts: boolean
  weeklyAnalyticsDigest: boolean
  billingReminders: boolean
  productUpdates: boolean
}

export interface NotificationPreferencesResponse {
  success: boolean
  data: { notifications: NotificationPreferences }
  message?: string
}

export function getNotificationPreferences() {
  const token = localStorage.getItem("access_token") ?? ""
  return apiFetch<NotificationPreferencesResponse>("/api/auth/preferences", {
    headers: { Authorization: `Bearer ${token}` },
  })
}

export function updateNotificationPreferences(notifications: NotificationPreferences) {
  const token = localStorage.getItem("access_token") ?? ""
  return apiFetch<NotificationPreferencesResponse>("/api/auth/preferences", {
    method: "PATCH",
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({ notifications }),
  })
}

export function forgotPassword(email: string) {
  return apiFetch<{ success: boolean; message: string }>("/api/auth/forgot-password", {
    method: "POST",
    body: JSON.stringify({ email }),
  })
}

export function resetPassword(token: string, password: string) {
  return apiFetch<{ success: boolean; message: string }>("/api/auth/reset-password", {
    method: "POST",
    body: JSON.stringify({ token, password }),
  })
}

export function deleteAccount(password: string) {
  const token = localStorage.getItem("access_token") ?? ""
  return apiFetch<{ success: boolean; message: string }>("/api/auth/me", {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({ password }),
  })
}

// ─── Notifications ────────────────────────────────────────────────────────────

export type NotificationType = "SYSTEM" | "FEATURE" | "BILLING" | "LIMIT" | "TEAM"

export interface AppNotification {
  id:        string
  type:      NotificationType
  title:     string
  body:      string
  actionUrl: string | null
  isRead:    boolean
  readAt:    string | null
  createdAt: string
}

export interface NotificationList {
  items:  AppNotification[]
  total:  number
  unread: number
}

export function getNotifications(limit = 20, offset = 0) {
  return apiFetch<{ success: boolean; data: NotificationList }>(
    `/api/notifications?limit=${limit}&offset=${offset}`,
    { headers: authHeader() },
  )
}

export function getUnreadNotificationCount() {
  return apiFetch<{ success: boolean; data: { count: number } }>(
    "/api/notifications/unread-count",
    { headers: authHeader() },
  )
}

export function markNotificationRead(id: string) {
  return apiFetch<{ success: boolean; data: AppNotification }>(`/api/notifications/${id}/read`, {
    method: "PATCH",
    headers: authHeader(),
  })
}

export function markAllNotificationsRead() {
  return apiFetch<{ success: boolean; data: { markedRead: number } }>("/api/notifications/read-all", {
    method: "PATCH",
    headers: authHeader(),
  })
}

export function deleteNotification(id: string) {
  return apiFetch<{ success: boolean; message: string }>(`/api/notifications/${id}`, {
    method: "DELETE",
    headers: authHeader(),
  })
}

export function clearReadNotifications() {
  return apiFetch<{ success: boolean; data: { deleted: number } }>("/api/notifications/clear-read", {
    method: "DELETE",
    headers: authHeader(),
  })
}

export function clearAllNotifications() {
  return apiFetch<{ success: boolean; data: { deleted: number } }>("/api/notifications", {
    method: "DELETE",
    headers: authHeader(),
  })
}

export function adminBroadcastNotification(params: {
  segment:   string
  type:      NotificationType
  title:     string
  body:      string
  actionUrl?: string
}) {
  return adminFetch<{ success: boolean; data: { created: number } }>("/admin-api/notifications/broadcast", {
    method: "POST",
    body: JSON.stringify(params),
  })
}

// ─── Admin API ────────────────────────────────────────────────────────────────

/**
 * Decode the role claim from the stored JWT (client-side only, no verification).
 * Verification is enforced by the server on every request.
 */
export function getTokenRole(): "USER" | "ADMIN" | "SUPER_ADMIN" | null {
  const token = localStorage.getItem("access_token")
  if (!token) return null
  try {
    const [, payload] = token.split(".")
    const decoded = JSON.parse(atob(payload)) as { role?: string }
    const role = decoded.role
    if (role === "ADMIN" || role === "SUPER_ADMIN" || role === "USER") return role
    return null
  } catch {
    return null
  }
}

function adminFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const token = localStorage.getItem("access_token") ?? ""
  return apiFetch<T>(path, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(init?.headers ?? {}) },
  })
}

// Admin — Dashboard
export interface AdminRecentSignup {
  id: string; name: string; email: string; createdAt: string
  subscription: { plan: { name: string; displayName: string } } | null
}
export interface AdminMetrics {
  totalUsers: number
  activeSubscriptions: number
  totalQRCodes: number
  scansToday: number
  totalScans: number
  mrr: number
  storageGB: number
  recentSignups: AdminRecentSignup[]
}
export const fetchAdminDashboard = () =>
  adminFetch<{ success: boolean; data: AdminMetrics }>("/admin-api/dashboard")

// Admin — System Health (SUPER_ADMIN only)
export interface SystemHealthProbe { status: "up" | "down"; latencyMs: number | null }
export interface SystemHealth {
  overall: "healthy" | "degraded" | "down"
  database: SystemHealthProbe
  redis: SystemHealthProbe
  queue: { status: "up" | "down"; waiting: number; active: number; failed: number; delayed: number }
  process: {
    uptimeSec: number
    memoryMB: { rss: number; heapUsed: number; heapTotal: number }
    nodeVersion: string
    environment: string
  }
  checkedAt: string
}
export const fetchAdminSystemHealth = () =>
  adminFetch<{ success: boolean; data: SystemHealth }>("/admin-api/system-health")

// Admin — Users
export interface AdminUser {
  id: string; name: string; email: string; role: string
  emailVerified: boolean; createdAt: string; lastLoginAt: string | null
  subscription: { status: string; plan: { name: string } } | null
  _count: { qrCodes: number }
}
export interface AdminUserDetail extends AdminUser {
  avatarUrl: string | null; googleId: string | null; updatedAt: string
  subscription: {
    status: string; trialEndsAt: string | null
    currentPeriodStart: string; currentPeriodEnd: string; cancelAtPeriodEnd: boolean
    plan: { name: string; displayName: string }
  } | null
  invoices: { id: string; amount: number; currency: string; status: string; planName: string; createdAt: string }[]
  _count: { qrCodes: number; apiKeys: number }
}
export type AdminMeta = { total: number; page: number; limit: number; pages: number }
export type AdminPlanName = "FREE" | "STARTER" | "PRO" | "BUSINESS" | "ENTERPRISE"

export const fetchAdminUsers = (page = 1, limit = 20, q = "") =>
  adminFetch<{ success: boolean; data: AdminUser[]; meta: AdminMeta }>(
    `/admin-api/users?page=${page}&limit=${limit}${q ? `&q=${encodeURIComponent(q)}` : ""}`,
  )
export const fetchAdminUser = (id: string) =>
  adminFetch<{ success: boolean; data: AdminUserDetail }>(`/admin-api/users/${id}`)
export const updateAdminUser = (id: string, body: { role?: string; name?: string }) =>
  adminFetch<{ success: boolean; data: AdminUser }>(`/admin-api/users/${id}`, {
    method: "PATCH",
    body: JSON.stringify(body),
  })
export const deleteAdminUser = (id: string) =>
  adminFetch<{ success: boolean; message: string }>(`/admin-api/users/${id}`, { method: "DELETE" })
export const changeAdminUserPlan = (id: string, planName: AdminPlanName) =>
  adminFetch<{ success: boolean; data: { userId: string; plan: { name: AdminPlanName; displayName: string } } }>(
    `/admin-api/users/${id}/plan`,
    {
      method: "PATCH",
      body: JSON.stringify({ planName }),
    },
  )
export const impersonateUser = (id: string) =>
  adminFetch<{ success: boolean; data: { token: string; expiresInSeconds: number } }>(
    `/admin-api/users/${id}/impersonate`,
    { method: "POST" },
  )
export const changeAdminUserPassword = (id: string, password: string) =>
  adminFetch<{ success: boolean; message: string }>(`/admin-api/users/${id}/password`, {
    method: "POST",
    body: JSON.stringify({ password }),
  })
export const verifyAdminUserEmail = (id: string) =>
  adminFetch<{ success: boolean; message: string }>(`/admin-api/users/${id}/verify-email`, {
    method: "POST",
  })

// Admin — QR Codes
export interface AdminQRCode {
  id: string; name: string; slug: string; type: string; category: string
  isActive: boolean; scanCount: number; createdAt: string
  user: { id: string; name: string; email: string } | null
}
export const fetchAdminQRCodes = (page = 1, limit = 20, q = "") =>
  adminFetch<{ success: boolean; data: AdminQRCode[]; meta: AdminMeta }>(
    `/admin-api/qr-codes?page=${page}&limit=${limit}${q ? `&q=${encodeURIComponent(q)}` : ""}`,
  )
export const deactivateAdminQR = (id: string) =>
  adminFetch<{ success: boolean; message: string }>(`/admin-api/qr-codes/${id}/deactivate`, { method: "PATCH" })
export const deleteAdminQR = (id: string) =>
  adminFetch<{ success: boolean; message: string }>(`/admin-api/qr-codes/${id}`, { method: "DELETE" })

// Admin — Analytics
export interface TrendPoint { date: string; count: number }
export interface StaticQRTypeStat { type: string; count: number }
export interface StaticQRStats { series: StaticQRTypeStat[]; total: number; days: number }
export interface RevenueTrendPoint { date: string; amount: number }
export interface PlanBreakdownEntry { planName: string; displayName: string; count: number }

export const fetchAdminSignups = (days = 30) =>
  adminFetch<{ success: boolean; data: TrendPoint[] }>(`/admin-api/analytics/signups?days=${days}`)
export const fetchAdminScans = (days = 30) =>
  adminFetch<{ success: boolean; data: TrendPoint[] }>(`/admin-api/analytics/scans?days=${days}`)
export const fetchAdminStaticQRStats = (days = 30) =>
  adminFetch<{ success: boolean; data: StaticQRStats }>(`/admin-api/analytics/static-qr?days=${days}`)
export const fetchAdminRevenueTrend = (days = 90) =>
  adminFetch<{ success: boolean; data: RevenueTrendPoint[] }>(`/admin-api/analytics/revenue-trend?days=${days}`)
export const fetchAdminPlanBreakdown = () =>
  adminFetch<{ success: boolean; data: PlanBreakdownEntry[] }>("/admin-api/analytics/plan-breakdown")


// Admin — Revenue
export interface AdminRevenue {
  mrr: number; arr: number
  invoices: { id: string; amount: number; currency: string; status: string; planName: string; billingCycle: string; createdAt: string; user: { id: string; name: string; email: string } }[]
}
export const fetchAdminRevenue = (page = 1, limit = 20) =>
  adminFetch<{ success: boolean; data: AdminRevenue; meta: AdminMeta }>(
    `/admin-api/revenue?page=${page}&limit=${limit}`,
  )

// Admin — Storage
export interface AdminStorage {
  totalBytes: number; totalGB: number
  byType: { type: string; count: number; bytes: number }[]
  topQRsByStorage: { qrId: string; bytes: number }[]
}
export const fetchAdminStorage = () =>
  adminFetch<{ success: boolean; data: AdminStorage }>("/admin-api/storage")
export const cleanupOrphans = () =>
  adminFetch<{ success: boolean; data: { deleted: number } }>("/admin-api/storage/cleanup-orphans", { method: "POST" })

// Admin — Audit
export interface AuditEntry {
  id: string
  action: string
  category: string
  entityId: string | null
  entityType: string | null
  metadata: unknown
  ip: string | null
  userAgent: string | null
  createdAt: string
  user: { id: string; name: string; email: string } | null
}

export interface AuditFilters {
  q?: string
  category?: string
  userId?: string
  userEmail?: string
  dateFrom?: string
  dateTo?: string
  ip?: string
}

export const fetchAdminAudit = (page = 1, limit = 20, filters: AuditFilters = {}) => {
  const params = new URLSearchParams({ page: String(page), limit: String(limit) })
  if (filters.q)         params.set("q",         filters.q)
  if (filters.category)  params.set("category",  filters.category)
  if (filters.userId)    params.set("userId",     filters.userId)
  if (filters.userEmail) params.set("userEmail",  filters.userEmail)
  if (filters.dateFrom)  params.set("dateFrom",   filters.dateFrom)
  if (filters.dateTo)    params.set("dateTo",     filters.dateTo)
  if (filters.ip)        params.set("ip",         filters.ip)
  return adminFetch<{ success: boolean; data: AuditEntry[]; meta: AdminMeta }>(
    `/admin-api/audit?${params.toString()}`,
  )
}

// Admin — Subscriptions
export interface AdminSubscription {
  id: string; status: string; trialEndsAt: string | null
  currentPeriodStart: string; currentPeriodEnd: string; cancelAtPeriodEnd: boolean
  createdAt: string; updatedAt: string
  plan: { name: string; displayName: string; priceMonthlyINR: number }
  user: { id: string; name: string; email: string }
  lastReminder: { reminderType: string; sentAt: string; status: string } | null
}
export const fetchAdminSubscriptions = (page = 1, limit = 20, status = "", plan = "") =>
  adminFetch<{ success: boolean; data: AdminSubscription[]; meta: AdminMeta }>(
    `/admin-api/subscriptions?page=${page}&limit=${limit}${status ? `&status=${status}` : ""}${plan ? `&plan=${plan}` : ""}`,
  )

export interface SendRemindersResult {
  sent: number; skipped: number; failed: number
  results: { subscriptionId: string; status: string; error?: string }[]
}
export const sendRenewalReminders = (subscriptionIds: string[]) =>
  adminFetch<{ success: boolean } & SendRemindersResult>(
    "/admin-api/subscriptions/send-reminders",
    { method: "POST", body: JSON.stringify({ subscriptionIds }) },
  )

export const sendUserPaymentReminder = (userId: string) =>
  adminFetch<{ success: boolean; message: string }>(
    `/admin-api/users/${userId}/send-reminder`,
    { method: "POST" },
  )

// Admin — Payments
export interface AdminPayment {
  id: string; amount: number; currency: string; status: string
  planName: string; billingCycle: string; periodStart: string; periodEnd: string
  createdAt: string; payuPaymentId: string | null; payuTxnId: string | null
  user: { id: string; name: string; email: string }
}
export const fetchAdminPayments = (page = 1, limit = 20, status = "") =>
  adminFetch<{ success: boolean; data: AdminPayment[]; meta: AdminMeta }>(
    `/admin-api/payments?page=${page}&limit=${limit}${status ? `&status=${status}` : ""}`,
  )

// Admin — Abuse
export interface AbuseReport {
  id: string
  reason: string
  url: string | null
  reportedBy: string | null
  isResolved: boolean
  adminNotes: string | null
  resolvedAt: string | null
  resolvedBy: string | null
  createdAt: string
  qrCode: { id: string; name: string; slug: string; isActive: boolean; userId: string | null }
  reporter: { id: string; name: string; email: string } | null
  qrOwner: { id: string; name: string; email: string } | null
  resolvedByUser: { id: string; name: string; email: string } | null
}
export interface BlocklistEntry {
  id: string; type: string; value: string; reason: string | null
  addedBy: string | null; isActive: boolean; createdAt: string
  blockCount: number; isPermanent: boolean
}
export const fetchAbuseReports = (page = 1, limit = 20, resolved?: boolean) =>
  adminFetch<{ success: boolean; data: AbuseReport[]; meta: AdminMeta }>(
    `/admin-api/abuse/reports?page=${page}&limit=${limit}${resolved !== undefined ? `&resolved=${resolved}` : ""}`,
  )
export const resolveAbuseReport = (id: string, adminNotes?: string) =>
  adminFetch<{ success: boolean }>(`/admin-api/abuse/reports/${id}/resolve`, {
    method: "POST", body: JSON.stringify({ adminNotes }),
  })
export const fetchUnresolvedAbuseCount = () =>
  adminFetch<{ success: boolean; meta: AdminMeta }>("/admin-api/abuse/reports?page=1&limit=1&resolved=false")
    .then((r) => r.meta.total)
export const fetchBlocklist = (page = 1, limit = 20, type = "") =>
  adminFetch<{ success: boolean; data: BlocklistEntry[]; meta: AdminMeta }>(
    `/admin-api/abuse/blocklist?page=${page}&limit=${limit}${type ? `&type=${type}` : ""}`,
  )
export const addToBlocklist = (type: string, value: string, reason?: string) =>
  adminFetch<{ success: boolean; data: BlocklistEntry }>("/admin-api/abuse/blocklist", {
    method: "POST", body: JSON.stringify({ type, value, reason }),
  })
export const removeFromBlocklist = (id: string) =>
  adminFetch<{ success: boolean }>(`/admin-api/abuse/blocklist/${id}`, { method: "DELETE" })

// User — Abuse Reports
export type ReportReason = "SPAM" | "PHISHING" | "INAPPROPRIATE" | "COPYRIGHT" | "ILLEGAL" | "OTHER"

export interface MyQRReport {
  id: string
  reason: string
  isResolved: boolean
  adminNotes: string | null
  resolvedAt: string | null
  createdAt: string
  qrCode: { id: string; name: string; slug: string; isActive: boolean }
}

export function submitAbuseReport(payload: { qrSlug?: string; qrId?: string; reason: ReportReason; details?: string }) {
  return apiFetch<{ success: boolean; message: string }>("/api/report", {
    method: "POST",
    headers: { ...authHeader(), "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  })
}

export function getMyQRReports() {
  return apiFetch<{ success: boolean; data: MyQRReport[] }>("/api/report/my-qrs", {
    headers: authHeader(),
  })
}

// Admin — Email Logs
export interface EmailLogEntry {
  id: string; to: string; subject: string; template: string
  status: string; error: string | null; provider: string; sentAt: string
}
export const fetchEmailLogs = (page = 1, limit = 20, status = "", q = "") =>
  adminFetch<{ success: boolean; data: EmailLogEntry[]; meta: AdminMeta }>(
    `/admin-api/email/logs?page=${page}&limit=${limit}${status ? `&status=${status}` : ""}${q ? `&q=${encodeURIComponent(q)}` : ""}`,
  )
export const sendBroadcast = (subject: string, body: string, segment: string, testEmail?: string, bodyFormat: "text" | "html" = "text") =>
  adminFetch<{ success: boolean; sent: number; total?: number; preview?: boolean }>("/admin-api/email/broadcast", {
    method: "POST", body: JSON.stringify({ subject, body, segment, testEmail, bodyFormat }),
  })

// Admin — Platform Settings
export const fetchPlatformSettings = () =>
  adminFetch<{ success: boolean; data: Record<string, string> }>("/admin-api/settings")
export const updatePlatformSettings = (updates: Record<string, string>) =>
  adminFetch<{ success: boolean; data: Record<string, string> }>("/admin-api/settings", {
    method: "PATCH", body: JSON.stringify(updates),
  })

// Admin — Support Tickets
export interface SupportTicket {
  id: string; subject: string; status: string; priority: string
  assignedTo: string | null; createdAt: string; updatedAt: string
  user: { id: string; name: string; email: string }
}
export interface SupportTicketDetail extends SupportTicket {
  message: string; adminNotes: string | null; resolvedAt: string | null
}
export const fetchSupportTickets = (page = 1, limit = 20, status = "", priority = "", q = "") =>
  adminFetch<{ success: boolean; data: SupportTicket[]; meta: AdminMeta }>(
    `/admin-api/support/tickets?page=${page}&limit=${limit}${status ? `&status=${status}` : ""}${priority ? `&priority=${priority}` : ""}${q ? `&q=${encodeURIComponent(q)}` : ""}`,
  )
export const fetchSupportTicket = (id: string) =>
  adminFetch<{ success: boolean; data: SupportTicketDetail }>(`/admin-api/support/tickets/${id}`)
export const updateSupportTicket = (id: string, data: Partial<{ status: string; priority: string; assignedTo: string; adminNotes: string }>) =>
  adminFetch<{ success: boolean; data: SupportTicketDetail }>(`/admin-api/support/tickets/${id}`, {
    method: "PATCH", body: JSON.stringify(data),
  })
/** Returns count of OPEN tickets for the admin sidebar badge */
export const fetchOpenSupportTicketCount = (): Promise<number> =>
  adminFetch<{ success: boolean; data: { count: number } }>("/admin-api/support/tickets/count")
    .then((res) => res.data.count)

// ─── Job Postings ─────────────────────────────────────────────────────────────

export type JobStatus = "OPEN" | "PAUSED" | "FILLED" | "CLOSED"

export interface JobPosting {
  id:          string
  title:       string
  department:  string | null
  location:    string | null
  type:        string
  description: string
  status:      JobStatus
  postedAt:    string
  updatedAt:   string
}

export interface CreateJobInput {
  title:       string
  department?: string
  location?:   string
  type:        string
  description: string
  status?:     JobStatus
}

/** Public: fetch only OPEN jobs for the careers page */
export const fetchPublicJobs = () =>
  apiFetch<{ success: boolean; data: JobPosting[] }>("/api/careers/jobs")

/** Admin: fetch ALL jobs regardless of status */
export const fetchAdminJobs = () =>
  adminFetch<{ success: boolean; data: JobPosting[] }>("/admin-api/careers/jobs")

/** Admin: create a new job posting */
export const createJob = (data: CreateJobInput) =>
  adminFetch<{ success: boolean; data: JobPosting }>("/admin-api/careers/jobs", {
    method: "POST", body: JSON.stringify(data),
  })

/** Admin: update a job posting (any field including status) */
export const updateJob = (id: string, data: Partial<CreateJobInput>) =>
  adminFetch<{ success: boolean; data: JobPosting }>(`/admin-api/careers/jobs/${id}`, {
    method: "PATCH", body: JSON.stringify(data),
  })

/** Admin: permanently delete a job posting */
export const deleteJob = (id: string) =>
  adminFetch<{ success: boolean }>(`/admin-api/careers/jobs/${id}`, { method: "DELETE" })

// ─── Job Applications ─────────────────────────────────────────────────────────

export type ApplicationStatus = "NEW" | "REVIEWING" | "SHORTLISTED" | "REJECTED" | "HIRED"

export interface JobApplication {
  id:          string
  jobTitle:    string
  name:        string
  email:       string
  phone:       string | null
  linkedin:    string | null
  experience:  string | null
  cvFilename:  string
  coverLetter: string
  status:      ApplicationStatus
  notes:       string | null
  createdAt:   string
  job:         { id: string; title: string; status: string } | null
}

export interface ApplicationsResponse {
  success: boolean
  data:    JobApplication[]
  meta:    { total: number; page: number; limit: number; pages: number }
}

export const fetchAdminApplications = (page = 1, status = "", q = "") =>
  adminFetch<ApplicationsResponse>(
    `/admin-api/careers/applications?page=${page}&limit=20${status ? `&status=${status}` : ""}${q ? `&q=${encodeURIComponent(q)}` : ""}`,
  )

export const updateApplication = (id: string, data: { status?: ApplicationStatus; notes?: string }) =>
  adminFetch<{ success: boolean; data: JobApplication }>(`/admin-api/careers/applications/${id}`, {
    method: "PATCH", body: JSON.stringify(data),
  })

export const deleteApplication = (id: string) =>
  adminFetch<{ success: boolean }>(`/admin-api/careers/applications/${id}`, { method: "DELETE" })

/** Count of NEW (unreviewed) applications — drives sidebar + tab badge */
export const fetchNewApplicationCount = (): Promise<number> =>
  adminFetch<{ success: boolean; data: { count: number } }>("/admin-api/careers/applications/count")
    .then((r) => r.data.count)

/**
 * Returns the URL to download the CV for a given application.
 * The admin must be authenticated — the browser sends the session cookie automatically
 * when navigating to this URL, so we just use window.open() / an <a> href.
 */
export const getCvDownloadUrl = (applicationId: string): string =>
  `/admin-api/careers/applications/${applicationId}/cv`

// ─── QR Types ─────────────────────────────────────────────────────────────────

export interface QRFile {
  id: string
  fileType: string
  fileName: string
  fileUrl: string
  mimeType: string
  sizeBytes: number
  uploadedAt: string
}

export interface QRDesign {
  primaryColor: string
  secondaryColor: string
  backgroundColor: string
  dotStyle: string
  cornerSquareStyle: string
  cornerDotStyle: string
  gradientEnabled: boolean
  gradientType: string | null
  gradientColor1: string | null
  gradientColor2: string | null
  logoUrl: string | null
  logoSize: number
  logoMargin: number
  hideBackgroundDots: boolean
  frameStyle: string | null
  frameText: string | null
  frameColor: string | null
  foregroundColor: string
}

export interface QRCode {
  id: string
  name: string
  type: string
  category: string
  slug: string
  tags: string[]
  isActive: boolean
  scanCount: number
  isPasswordProtected: boolean
  activeFrom: string | null
  activeUntil: string | null
  scanLimit: number | null
  fallbackUrl: string | null
  abTestEnabled: boolean
  abTestSplitPct: number
  fbPixelId: string | null
  gaId: string | null
  gtmId: string | null
  createdAt: string
  updatedAt: string
  lastScannedAt: string | null
  content: { data: Record<string, unknown> } | null
  design: QRDesign | null
  files: QRFile[]
}

export interface ListQRsResponse {
  success: boolean
  data: QRCode[]
  pagination: {
    total: number
    page: number
    limit: number
    totalPages: number
    hasNext: boolean
    hasPrev: boolean
  }
}

export interface UploadedFileInfo {
  tempUrl: string
  fileName: string
  mimeType: string
  sizeBytes: number
  fileType: string
}

export interface CreateQRPayload {
  name: string
  type: string
  category: "DYNAMIC" | "STATIC"
  content: { data: Record<string, unknown> }
  design?: {
    primaryColor?: string
    backgroundColor?: string
    dotStyle?: string
    cornerSquareStyle?: string
    cornerDotStyle?: string
    frameStyle?: string
    frameText?: string
    frameBgColor?: string
    logoUrl?: string
    logoSize?: number
  }
  tags?: string[]
  uploadedFiles?: UploadedFileInfo[]
  isPasswordProtected?: boolean
  password?: string
  settings?: {
    activeFrom?: string | null
    activeUntil?: string | null
    scanLimit?: number | null
    fallbackUrl?: string | null
    password?: string
    fbPixelId?: string | null
    gaId?: string | null
    gtmId?: string | null
  }
}

// ─── QR helpers ───────────────────────────────────────────────────────────────

function authHeader(): Record<string, string> {
  const token = localStorage.getItem("access_token") ?? ""
  return { Authorization: `Bearer ${token}` }
}

export function createQR(payload: CreateQRPayload) {
  return apiFetch<{ success: boolean; data: QRCode }>("/api/qr", {
    method: "POST",
    headers: authHeader(),
    body: JSON.stringify(payload),
  })
}

export function listQRs(params?: { page?: number; limit?: number; search?: string }) {
  const query = new URLSearchParams()
  if (params?.page != null) query.set("page", String(params.page))
  if (params?.limit != null) query.set("limit", String(params.limit))
  if (params?.search) query.set("search", params.search)
  const qs = query.toString() ? `?${query.toString()}` : ""
  return apiFetch<ListQRsResponse>(`/api/qr${qs}`, { headers: authHeader() })
}

export function getQR(id: string) {
  return apiFetch<{ success: boolean; data: QRCode }>(`/api/qr/${id}`, {
    headers: authHeader(),
  })
}

/**
 * Download the QR code as an SVG file.
 * Fetches the SVG bytes from the server and triggers a browser file download.
 */
export async function downloadQRSvg(id: string, name: string): Promise<void> {
  const token = localStorage.getItem("access_token")
  const res = await fetch(`/api/qr/${id}/download?format=svg`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  })
  if (!res.ok) throw new Error("Download failed")
  const blob = await res.blob()
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = `${name.replace(/[^a-z0-9_-]/gi, "_").slice(0, 64) || "qr"}.svg`
  a.click()
  URL.revokeObjectURL(url)
}

export function updateQR(id: string, payload: Partial<CreateQRPayload>) {
  return apiFetch<{ success: boolean; data: QRCode }>(`/api/qr/${id}`, {
    method: "PUT",
    headers: authHeader(),
    body: JSON.stringify(payload),
  })
}

export function deleteQR(id: string) {
  return apiFetch<{ success: boolean; message: string }>(`/api/qr/${id}`, {
    method: "DELETE",
    headers: authHeader(),
  })
}

export function toggleQR(id: string) {
  return apiFetch<{ success: boolean; data: { isActive: boolean } }>(`/api/qr/${id}/toggle`, {
    method: "PATCH",
    headers: authHeader(),
  })
}

export function duplicateQR(id: string) {
  return apiFetch<{ success: boolean; data: QRCode }>(`/api/qr/${id}/duplicate`, {
    method: "POST",
    headers: authHeader(),
  })
}

export async function uploadFile(
  file: File,
  type: "pdf" | "video" | "mp3" | "image"
): Promise<UploadedFileInfo> {
  const formData = new FormData()
  formData.append("file", file)
  const res = await fetch(`${BASE_URL}/api/upload/${type}`, {
    method: "POST",
    credentials: "include",
    // No Content-Type — let the browser set multipart/form-data with boundary
    headers: authHeader(),
    body: formData,
  })
  if (!res.ok) {
    let message = `Upload failed (${res.status})`
    try {
      const body = await res.clone().json() as { message?: string; error?: string }
      if (body.message) message = body.message
      else if (body.error) message = body.error
    } catch { /* ignore parse errors */ }
    throw new ApiError(res.status, message)
  }
  const json = await res.json() as { success: boolean; data: UploadedFileInfo }
  return json.data
}

// ─── Public QR (no auth, for landing pages) ───────────────────────────────────

export interface PublicQRFile {
  id: string
  fileType: string
  fileName: string
  fileUrl: string
  mimeType: string
}

export interface PublicQRData {
  id: string
  type: string
  name: string
  slug: string
  isActive: boolean
  content: Record<string, unknown>
  design: Record<string, unknown>
  files: PublicQRFile[]
}

export function getPublicQR(slug: string) {
  return apiFetch<{ success: boolean; data: PublicQRData }>(`/api/public/qr/${slug}`)
}

export interface PublicChangelogEntry {
  version: string
  date: string
  title: string
  items: string[]
  icon?: string
}

export interface PublicCareerRole {
  title: string
  type: string
  desc: string
}

export interface PublicSiteContentResponse {
  success: boolean
  data: {
    changelog: PublicChangelogEntry[]
    careers: PublicCareerRole[]
  }
}

export function fetchPublicSiteContent() {
  return apiFetch<PublicSiteContentResponse>("/api/public/site-content")
}

export function verifyQRPassword(slug: string, password: string) {
  return apiFetch<{ success: boolean; data: { destination: string } }>(`/r/${slug}/password`, {
    method: "POST",
    body: JSON.stringify({ password }),
  })
}

// ─── Analytics ────────────────────────────────────────────────────────────────

export interface ScanTimelinePoint { date: string; count: number }
export interface GeoBreakdown { country: string; countryCode: string | null; count: number }
export interface DeviceBreakdown { deviceType: string; count: number }
export interface OSBreakdown { os: string; count: number }
export interface BrowserBreakdown { browser: string; count: number }
export interface LocationBreakdown {
  city: string
  region: string | null
  country: string | null
  countryCode: string | null
  count: number
}
export interface RecentScan {
  id: string
  scannedAt: string
  ip: string
  country: string | null
  countryCode: string | null
  city: string | null
  region: string | null
  deviceType: string
  os: string | null
  browser: string | null
  referrer: string | null
}

export interface QRAnalytics {
  totalScans: number
  scansToday: number
  scansThisWeek: number
  scansThisMonth: number
  timeline: ScanTimelinePoint[]
  byDevice: DeviceBreakdown[]
  byOS: OSBreakdown[]
  byBrowser: BrowserBreakdown[]
  byCountry: GeoBreakdown[]
  byCity: LocationBreakdown[]
  recentScans: RecentScan[]
}

export function getQRAnalytics(qrId: string, days = 30) {
  return apiFetch<{ success: boolean; data: QRAnalytics }>(
    `/api/analytics/${qrId}?days=${days}`,
    { headers: authHeader() },
  )
}

export interface GlobalAnalytics {
  totalScans: number
  scansToday: number
  scansThisWeek: number
  scansThisMonth: number
  totalQRs: number
  activeQRs: number
  timeline: ScanTimelinePoint[]
  byDevice: DeviceBreakdown[]
  byOS: OSBreakdown[]
  byBrowser: BrowserBreakdown[]
  byCountry: GeoBreakdown[]
  topQRs: Array<{ id: string; name: string; type: string; scanCount: number; isActive: boolean }>
}

export function getGlobalAnalytics(days = 30) {
  return apiFetch<{ success: boolean; data: GlobalAnalytics }>(
    `/api/analytics/global?days=${days}`,
    { headers: authHeader() },
  )
}

/**
 * Downloads scan data as a CSV file and triggers a browser download.
 */
export async function downloadScanCSV(qrId: string, qrName: string): Promise<void> {
  const BASE_URL = (import.meta.env.VITE_API_URL as string | undefined) ?? ""
  const token = localStorage.getItem("access_token") ?? ""
  const res = await fetch(`${BASE_URL}/api/analytics/${qrId}/csv`, {
    credentials: "include",
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) throw new Error(`CSV export failed (${res.status})`)
  const blob = await res.blob()
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = `${qrName.replace(/[^a-zA-Z0-9_-]/g, "_")}_scans.csv`
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

// ─── Smart Routing ────────────────────────────────────────────────────────────

export interface SmartRoutingRule {
  id: string
  qrId: string
  priority: number
  conditionType: "device" | "time" | "geo"
  conditionValue: Record<string, unknown>
  targetUrl: string
  isActive: boolean
  createdAt: string
}

export interface SmartRoutePayload {
  conditionType: "device" | "time" | "geo"
  conditionValue: Record<string, unknown>
  targetUrl: string
  priority: number
  isActive?: boolean
}

export function getSmartRoutes(qrId: string) {
  return apiFetch<{ success: boolean; data: SmartRoutingRule[] }>(
    `/api/qr/${qrId}/smart-routes`,
    { headers: authHeader() },
  )
}

export function createSmartRoute(qrId: string, payload: SmartRoutePayload) {
  return apiFetch<{ success: boolean; data: SmartRoutingRule }>(
    `/api/qr/${qrId}/smart-routes`,
    { method: "POST", headers: { ...authHeader(), "Content-Type": "application/json" }, body: JSON.stringify(payload) },
  )
}

export function updateSmartRoute(qrId: string, ruleId: string, payload: SmartRoutePayload) {
  return apiFetch<{ success: boolean; data: SmartRoutingRule }>(
    `/api/qr/${qrId}/smart-routes/${ruleId}`,
    { method: "PUT", headers: { ...authHeader(), "Content-Type": "application/json" }, body: JSON.stringify(payload) },
  )
}

export function deleteSmartRoute(qrId: string, ruleId: string) {
  return apiFetch<{ success: boolean }>(
    `/api/qr/${qrId}/smart-routes/${ruleId}`,
    { method: "DELETE", headers: authHeader() },
  )
}

// ─── A/B Testing ─────────────────────────────────────────────────────────────

export interface ABVariant {
  id: string
  qrId: string
  name: string
  targetUrl: string
  splitPct: number
  scanCount: number
  createdAt: string
}

export interface ABVariantPayload {
  name: string
  targetUrl: string
  splitPct: number
}

export function getABVariants(qrId: string) {
  return apiFetch<{ success: boolean; data: ABVariant[] }>(
    `/api/qr/${qrId}/ab-variants`,
    { headers: authHeader() },
  )
}

export function createABVariant(qrId: string, payload: ABVariantPayload) {
  return apiFetch<{ success: boolean; data: ABVariant }>(
    `/api/qr/${qrId}/ab-variants`,
    { method: "POST", headers: { ...authHeader(), "Content-Type": "application/json" }, body: JSON.stringify(payload) },
  )
}

export function updateABVariant(qrId: string, variantId: string, payload: ABVariantPayload) {
  return apiFetch<{ success: boolean; data: ABVariant }>(
    `/api/qr/${qrId}/ab-variants/${variantId}`,
    { method: "PUT", headers: { ...authHeader(), "Content-Type": "application/json" }, body: JSON.stringify(payload) },
  )
}

export function deleteABVariant(qrId: string, variantId: string) {
  return apiFetch<{ success: boolean }>(
    `/api/qr/${qrId}/ab-variants/${variantId}`,
    { method: "DELETE", headers: authHeader() },
  )
}

export function patchABTestSettings(qrId: string, abTestEnabled: boolean, abTestSplitPct: number) {
  return apiFetch<{ success: boolean; data: { id: string; abTestEnabled: boolean; abTestSplitPct: number } }>(
    `/api/qr/${qrId}/ab-test`,
    {
      method: "PATCH",
      headers: { ...authHeader(), "Content-Type": "application/json" },
      body: JSON.stringify({ abTestEnabled, abTestSplitPct }),
    },
  )
}

// ─── Pixel / Tracking ─────────────────────────────────────────────────────────

export interface PixelSettings {
  fbPixelId?: string | null
  gaId?: string | null
  gtmId?: string | null
}

export function updatePixelSettings(qrId: string, pixels: PixelSettings) {
  return apiFetch<{ success: boolean }>(
    `/api/qr/${qrId}`,
    {
      method: "PUT",
      headers: { ...authHeader(), "Content-Type": "application/json" },
      body: JSON.stringify({ settings: pixels }),
    },
  )
}

// ─── Billing ──────────────────────────────────────────────────────────────────

export type PlanName = "FREE" | "STARTER" | "PRO" | "BUSINESS" | "ENTERPRISE"
export type SubscriptionStatus = "ACTIVE" | "CANCELLED" | "PAST_DUE" | "TRIALING" | "PAUSED"

export interface PlanLimits {
  dynamicQRLimit: number
  scanLimitPerMonth: number
  fileStorageGB: number
  teamSeatsLimit: number
  apiCallsLimit: number
  analyticsRetentionDays: number
  bulkGeneration: boolean
  apiAccess: boolean
  customDomains: boolean
  whiteLabel: boolean
  prioritySupport: boolean
  abTesting: boolean
  smartRouting: boolean
  qrExpiry: boolean
}

export interface Plan {
  id: string
  name: PlanName
  displayName: string
  priceMonthlyINR: number
  priceYearlyINR: number
  priceMonthlyUSD: number
  priceYearlyUSD: number
  dynamicQRLimit: number
  scanLimit: number
  fileStorageGB: number
  teamSeatsLimit: number
  apiCallsLimit: number
  features: Record<string, unknown>
  limits: PlanLimits
}

export interface SubscriptionInfo {
  planName: PlanName
  limits: PlanLimits
  isTrialing: boolean
  trialEndsAt: string | null
  subscriptionStatus: SubscriptionStatus
  subscription: {
    id: string
    status: SubscriptionStatus
    planId: string
    planName: PlanName
    planDisplayName: string
    trialEndsAt: string | null
    currentPeriodStart: string
    currentPeriodEnd: string
    cancelAtPeriodEnd: boolean
  }
}

export interface Invoice {
  id: string
  payuPaymentId: string | null
  payuTxnId: string | null
  amount: number // paise
  currency: string
  status: string
  planName: PlanName
  billingCycle: string
  periodStart: string
  periodEnd: string
  createdAt: string
}

export interface BillingUsage {
  planName: PlanName
  qrCodes: { used: number; limit: number }
  scans: { used: number; limit: number }
  storageGB: { used: number; limit: number }
  apiCalls: { used: number; limit: number }
}

export interface PayUOrderParams {
  key: string
  txnid: string
  amount: string
  productinfo: string
  firstname: string
  email: string
  phone: string
  surl: string          // backend endpoint — PayU POSTs here after success
  furl: string          // backend endpoint — PayU POSTs here after failure
  hash: string
  udf1: string          // planName
  udf2: string          // billingCycle
  udf3: string          // userId — included in hash; echoed back by PayU in callback
  baseUrl: string       // https://test.payu.in/_payment or https://secure.payu.in/_payment
}

export function getPlans() {
  return apiFetch<{ success: boolean; data: Plan[] }>("/api/billing/plans")
}

export function getSubscription() {
  return apiFetch<{ success: boolean; data: SubscriptionInfo }>("/api/billing/subscription", {
    headers: authHeader(),
  })
}

export function getBillingUsage() {
  return apiFetch<{ success: boolean; data: BillingUsage }>("/api/billing/usage", {
    headers: authHeader(),
  })
}

export function getInvoices() {
  return apiFetch<{ success: boolean; data: Invoice[] }>("/api/billing/invoices", {
    headers: authHeader(),
  })
}

export async function downloadInvoice(invoiceId: string, invoiceNumber: string): Promise<void> {
  const token = localStorage.getItem("access_token") ?? ""
  const res = await fetch(`/api/billing/invoices/${invoiceId}/download`, {
    headers: { Authorization: `Bearer ${token}` },
    credentials: "include",
  })
  if (!res.ok) throw new ApiError(res.status, "Failed to download invoice")
  const blob = await res.blob()
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = `${invoiceNumber}.pdf`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

export function createPaymentOrder(planName: PlanName, billingCycle: "monthly" | "yearly", phone?: string) {
  return apiFetch<{ success: boolean; data: PayUOrderParams }>("/api/billing/create-order", {
    method: "POST",
    headers: authHeader(),
    body: JSON.stringify({ planName, billingCycle, ...(phone ? { phone } : {}) }),
  })
}
// Note: verifyPayment is no longer needed — the backend /api/billing/payu-success
// endpoint handles hash verification and subscription activation server-to-server.

export function cancelSubscription() {
  return apiFetch<{ success: boolean; message: string }>("/api/billing/cancel", {
    method: "POST",
    headers: authHeader(),
  })
}

export function downgradeSubscription(planName: PlanName) {
  return apiFetch<{ success: boolean; message: string }>("/api/billing/downgrade", {
    method: "POST",
    headers: authHeader(),
    body: JSON.stringify({ planName }),
  })
}

// ─── Team ────────────────────────────────────────────────────────────────────

export type TeamRole = "admin" | "editor" | "viewer"

export interface TeamMember {
  id: string
  name: string
  email: string
  role: TeamRole
  joined: string
  lastActive: string | null
}

export interface TeamPendingInvite {
  id: string
  email: string
  role: TeamRole
  invitedAt: string
  lastSentAt: string
  resendCount: number
}

export interface TeamOverview {
  members: TeamMember[]
  pendingInvites: TeamPendingInvite[]
  seats: {
    used: number
    limit: number
  }
}

export interface TeamInvitePreview {
  owner: {
    name: string
    email: string
  }
  invite: {
    email: string
    role: TeamRole
    invitedAt: string
  }
}

export function getTeamOverview() {
  return apiFetch<{ success: boolean; data: TeamOverview }>("/api/team", {
    headers: authHeader(),
  })
}

export function sendTeamInvite(email: string, role: TeamRole) {
  return apiFetch<{ success: boolean; message: string; data: TeamPendingInvite }>("/api/team/invites", {
    method: "POST",
    headers: authHeader(),
    body: JSON.stringify({ email, role }),
  })
}

export function resendTeamInvite(inviteId: string) {
  return apiFetch<{ success: boolean; message: string; data: TeamPendingInvite }>(`/api/team/invites/${inviteId}/resend`, {
    method: "POST",
    headers: authHeader(),
  })
}

export function cancelTeamInvite(inviteId: string) {
  return apiFetch<{ success: boolean; message: string }>(`/api/team/invites/${inviteId}`, {
    method: "DELETE",
    headers: authHeader(),
  })
}

export function getTeamInvitePreview(token: string) {
  return apiFetch<{ success: boolean; data: TeamInvitePreview }>(`/api/team/invites/token/${encodeURIComponent(token)}`)
}

export function acceptTeamInvite(token: string) {
  return apiFetch<{ success: boolean; message: string; data: { owner: { name: string; email: string }; role: TeamRole } }>(
    `/api/team/invites/token/${encodeURIComponent(token)}/accept`,
    {
      method: "POST",
      headers: authHeader(),
    },
  )
}

export function removeTeamMember(userId: string) {
  return apiFetch<{ success: boolean; message: string }>(`/api/team/members/${userId}`, {
    method: "DELETE",
    headers: authHeader(),
  })
}


// ─── API Keys ─────────────────────────────────────────────────────────────────

export interface ApiKeyRecord {
  id: string
  name: string
  prefix: string
  lastUsedAt: string | null
  callCount: number
  isActive: boolean
  expiresAt: string | null
  createdAt: string
  /** Only present on initial creation response */
  rawKey?: string
}

export function listApiKeys() {
  return apiFetch<{ success: boolean; data: ApiKeyRecord[] }>("/api/apikeys", {
    headers: authHeader(),
  })
}

export function createApiKey(name: string, expiresInDays?: number) {
  return apiFetch<{ success: boolean; data: ApiKeyRecord }>("/api/apikeys", {
    method: "POST",
    headers: authHeader(),
    body: JSON.stringify({ name, expiresInDays }),
  })
}

export function revokeApiKey(id: string) {
  return apiFetch<{ success: boolean; message: string }>(`/api/apikeys/${id}/revoke`, {
    method: "PATCH",
    headers: authHeader(),
  })
}

export function deleteApiKey(id: string) {
  return apiFetch<{ success: boolean; message: string }>(`/api/apikeys/${id}`, {
    method: "DELETE",
    headers: authHeader(),
  })
}

// ─── Webhooks ─────────────────────────────────────────────────────────────────

export interface WebhookRecord {
  id: string
  name: string
  url: string
  events: string[]
  isActive: boolean
  createdAt: string
  deliveryCount: number
}

export interface WebhookDelivery {
  id: string
  event: string
  statusCode: number | null
  success: boolean
  attemptedAt: string
  responseBody: string | null
}

export function listWebhooks() {
  return apiFetch<{ success: boolean; data: WebhookRecord[] }>("/api/webhooks", {
    headers: authHeader(),
  })
}

export function getWebhookEvents() {
  return apiFetch<{ success: boolean; data: string[] }>("/api/webhooks/events", {
    headers: authHeader(),
  })
}

export function createWebhook(name: string, url: string, events: string[]) {
  return apiFetch<{ success: boolean; data: WebhookRecord }>("/api/webhooks", {
    method: "POST",
    headers: authHeader(),
    body: JSON.stringify({ name, url, events }),
  })
}

export function updateWebhook(id: string, patch: { name?: string; url?: string; events?: string[]; isActive?: boolean }) {
  return apiFetch<{ success: boolean; data: WebhookRecord }>(`/api/webhooks/${id}`, {
    method: "PATCH",
    headers: authHeader(),
    body: JSON.stringify(patch),
  })
}

export function deleteWebhook(id: string) {
  return apiFetch<{ success: boolean; message: string }>(`/api/webhooks/${id}`, {
    method: "DELETE",
    headers: authHeader(),
  })
}

export function testWebhook(id: string) {
  return apiFetch<{ success: boolean; data: { success: boolean; statusCode: number | null } }>(`/api/webhooks/${id}/test`, {
    method: "POST",
    headers: authHeader(),
  })
}

export function getWebhookDeliveries(id: string) {
  return apiFetch<{ success: boolean; data: WebhookDelivery[] }>(`/api/webhooks/${id}/deliveries`, {
    headers: authHeader(),
  })
}

// ─── Bulk Generation ──────────────────────────────────────────────────────────

export interface BulkResult {
  row: number
  name: string
  url: string
  status: "created" | "error"
  qrId?: string
  slug?: string
  error?: string
}

export interface BulkUploadResponse {
  results: BulkResult[]
  summary: { total: number; created: number; failed: number }
}

export function getBulkTemplate(): string {
  const base = (import.meta.env.VITE_API_URL as string | undefined) ?? ""
  return `${base}/api/bulk/template`
}

export async function uploadBulkCSV(file: File): Promise<{ success: boolean; data: BulkUploadResponse }> {
  const base = (import.meta.env.VITE_API_URL as string | undefined) ?? ""
  const form = new FormData()
  form.append("file", file)
  let token = localStorage.getItem("access_token") ?? ""
  let res = await fetch(`${base}/api/bulk/csv`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    credentials: "include",
    body: form,
  })

  if (res.status === 401) {
    const refreshed = await silentRefresh()
    if (refreshed) {
      token = refreshed
      res = await fetch(`${base}/api/bulk/csv`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        credentials: "include",
        body: form,
      })
    }
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as { message?: string; error?: string }
    throw new ApiError(res.status, body.message ?? body.error ?? "Bulk upload failed")
  }
  return res.json()
}

export async function downloadBulkZip(results: BulkResult[]): Promise<void> {
  const base = (import.meta.env.VITE_API_URL as string | undefined) ?? ""
  let token = localStorage.getItem("access_token") ?? ""
  let res = await fetch(`${base}/api/bulk/download`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    credentials: "include",
    body: JSON.stringify({ results }),
  })

  if (res.status === 401) {
    const refreshed = await silentRefresh()
    if (refreshed) {
      token = refreshed
      res = await fetch(`${base}/api/bulk/download`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        credentials: "include",
        body: JSON.stringify({ results }),
      })
    }
  }

  if (!res.ok) throw new ApiError(res.status, "ZIP download failed")
  const blob = await res.blob()
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = "GenXQR_bulk.zip"
  a.click()
  URL.revokeObjectURL(url)
}

// ─── Google Drive ─────────────────────────────────────────────────────────────

export function getDriveStatus() {
  return apiFetch<{ success: boolean; data: { connected: boolean; folderId: string | null } }>("/api/gdrive/status", {
    headers: authHeader(),
  })
}

export function getDriveAuthUrl() {
  return apiFetch<{ success: boolean; data: { url: string } }>("/api/gdrive/auth-url", {
    headers: authHeader(),
  })
}

export function disconnectDrive() {
  return apiFetch<{ success: boolean; message: string }>("/api/gdrive/disconnect", {
    method: "POST",
    headers: authHeader(),
  })
}

export function exportQRsToDrive(qrIds?: string[]) {
  return apiFetch<{ success: boolean; data: Array<{ fileId: string; fileName: string; webViewLink: string }> }>("/api/gdrive/export", {
    method: "POST",
    headers: authHeader(),
    body: JSON.stringify({ qrIds }),
  })
}

// ─── User Support Tickets ─────────────────────────────────────────────────────

export type SupportTicketCategory = "billing" | "technical" | "feature_request" | "other"

export interface MyTicket {
  id: string
  subject: string
  category: string
  status: string
  priority: string
  createdAt: string
  updatedAt: string
}

export interface CreateTicketInput {
  subject: string
  message: string
  category: SupportTicketCategory
}

export function createSupportTicket(input: CreateTicketInput) {
  return apiFetch<{ success: boolean; message: string; data: MyTicket & { shortId: string } }>(
    "/api/support/tickets",
    {
      method: "POST",
      headers: authHeader(),
      body: JSON.stringify(input),
    },
  )
}

export function listMyTickets(page = 1, limit = 10) {
  return apiFetch<{ success: boolean; data: MyTicket[]; meta: { total: number; page: number; limit: number; pages: number } }>(
    `/api/support/tickets?page=${page}&limit=${limit}`,
    { headers: authHeader() },
  )
}





