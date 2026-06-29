/**
 * Limit Notification Service
 *
 * Sends one-time email alerts when a user's plan usage reaches 80% (warning)
 * or 100% (exhausted) for each limit type: QR codes, monthly scans, file
 * storage, and API calls.
 *
 * Deduplication: a LimitAlert row is written before sending. The @@unique
 * constraint guarantees at-most-once delivery per (user, limitType, threshold,
 * periodKey). Failures are logged but never surface as user-facing errors.
 */

import { prisma } from "../db/prisma.js"
import { sendEmail } from "./email.service.js"
import { env } from "../config/env.js"
import { logger } from "../logger/index.js"

// ─── Types ─────────────────────────────────────────────────────────────────────

export type LimitType = "qr_codes" | "scans" | "storage" | "api_calls"

interface LimitMeta {
  label: string          // Human-readable limit name
  unit: string           // e.g. "QR codes", "scans", "GB"
  upgradeReason: string  // One-liner explaining what upgrade unlocks
}

const LIMIT_META: Record<LimitType, LimitMeta> = {
  qr_codes: {
    label:         "Dynamic QR Codes",
    unit:          "QR codes",
    upgradeReason: "Create more dynamic QR codes and track their performance.",
  },
  scans: {
    label:         "Monthly Scans",
    unit:          "scans",
    upgradeReason: "Handle more scans and keep your QR codes fully operational.",
  },
  storage: {
    label:         "File Storage",
    unit:          "GB",
    upgradeReason: "Upload more files — PDFs, videos, audio, and image galleries.",
  },
  api_calls: {
    label:         "Monthly API Calls",
    unit:          "API calls",
    upgradeReason: "Make more API calls and keep your integrations running.",
  },
}

// ─── Period key helpers ────────────────────────────────────────────────────────

/**
 * Monthly limits (scans, api_calls) → "YYYY-MM"; resets each calendar month.
 * Cumulative limits (qr_codes, storage) → the plan name; resets on upgrade.
 */
export function buildPeriodKey(limitType: LimitType, planName: string): string {
  if (limitType === "scans" || limitType === "api_calls") {
    const now = new Date()
    return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`
  }
  return planName
}

// ─── Email templates ──────────────────────────────────────────────────────────

function buildLimitEmail(opts: {
  name: string
  email: string
  limitType: LimitType
  threshold: 80 | 100
  used: number
  limit: number
  planName: string
}): { subject: string; html: string } {
  const { name, limitType, threshold, used, limit, planName } = opts
  const meta = LIMIT_META[limitType]
  const upgradeUrl = `${env.FRONTEND_URL}/app/billing`
  const isExhausted = threshold === 100
  const pct = Math.round((used / Math.max(limit, 1)) * 100)

  // Format numbers nicely
  const fmt = (n: number) => n.toLocaleString("en-IN")

  // Display strings
  const usedDisplay = limitType === "storage" ? `${used} GB` : fmt(used)
  const limitDisplay = limitType === "storage" ? `${limit} GB` : fmt(limit)

  const subject = isExhausted
    ? `[GenXQR] Your ${meta.label} limit has been reached`
    : `[GenXQR] You've used ${pct}% of your ${meta.label}`

  const accentColor = isExhausted ? "#ef4444" : "#f59e0b"
  const iconEmoji    = isExhausted ? "🚫" : "⚠️"
  const headlineVerb = isExhausted ? "Limit reached" : `${pct}% used`

  const headlineText = isExhausted
    ? `Your ${meta.label} limit is exhausted`
    : `You've used ${pct}% of your ${meta.label}`

  const bodyText = isExhausted
    ? `You've used all <strong>${limitDisplay} ${meta.unit}</strong> on your <strong>${planName}</strong> plan.
       New ${meta.unit === "QR codes" ? "dynamic QR codes cannot be created" : meta.unit === "scans" ? "scans will be blocked" : meta.unit === "API calls" ? "API calls will be rejected" : "file uploads will be blocked"} until you upgrade or the period resets.`
    : `You've used <strong>${usedDisplay}</strong> of your <strong>${limitDisplay} ${meta.unit}</strong> allowance
       on the <strong>${planName}</strong> plan (${pct}%). Upgrade now to avoid disruption.`

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="color-scheme" content="light dark">
  <title>${subject}</title>
  <style>
    * { box-sizing: border-box; }
    body, table, td, a { -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%; }
    @media (prefers-color-scheme: dark) {
      .body-wrap  { background-color: #09090b !important; }
      .card       { background-color: #18181b !important; border-color: #27272a !important; }
      .footer-row { background-color: #111113 !important; border-color: #27272a !important; }
      .logo-text  { color: #a5b4fc !important; }
      .footer-txt { color: #52525b !important; }
      .card-heading { color: #f4f4f5 !important; }
      .card-body    { color: #a1a1aa !important; }
      .stat-box     { background-color: #27272a !important; border-color: #3f3f46 !important; }
      .stat-label   { color: #71717a !important; }
      .stat-value   { color: #e4e4e7 !important; }
      .bar-bg       { background-color: #3f3f46 !important; }
    }
  </style>
</head>
<body class="body-wrap" style="margin:0;padding:0;background-color:#f0f1f5;-webkit-font-smoothing:antialiased">

  <div style="display:none;max-height:0;overflow:hidden;font-size:1px;color:#f0f1f5">${subject}</div>

  <table class="body-wrap" width="100%" cellpadding="0" cellspacing="0" role="presentation" style="background-color:#f0f1f5">
    <tr>
      <td align="center" style="padding:48px 16px 40px">

        <!-- Logo -->
        <table width="560" cellpadding="0" cellspacing="0" role="presentation" style="max-width:560px;width:100%;margin-bottom:20px">
          <tr>
            <td align="center">
              <table cellpadding="0" cellspacing="0" role="presentation">
                <tr>
                  <td width="36" height="36" align="center" valign="middle"
                    style="background:linear-gradient(135deg,#6366f1 0%,#818cf8 100%);border-radius:9px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:17px;font-weight:800;color:#ffffff;line-height:36px;text-align:center">
                    N
                  </td>
                  <td width="10"></td>
                  <td valign="middle">
                    <span class="logo-text" style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:19px;font-weight:700;color:#4f46e5;letter-spacing:-0.4px;line-height:1">GenXQR</span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>

        <!-- Card -->
        <table class="card" width="560" cellpadding="0" cellspacing="0" role="presentation"
          style="max-width:560px;width:100%;background-color:#ffffff;border-radius:16px;border:1px solid #e4e4e7;overflow:hidden">

          <!-- Accent bar -->
          <tr>
            <td height="3" style="height:3px;font-size:0;line-height:0;background:${accentColor}">&#8203;</td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:36px 40px 32px">

              <!-- Icon + status pill -->
              <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="margin-bottom:20px">
                <tr>
                  <td>
                    <span style="font-size:32px;line-height:1">${iconEmoji}</span>
                  </td>
                  <td align="right">
                    <span style="display:inline-block;padding:4px 10px;background-color:${accentColor}1a;color:${accentColor};border:1px solid ${accentColor}33;border-radius:20px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:11px;font-weight:600;letter-spacing:0.5px;text-transform:uppercase">${headlineVerb}</span>
                  </td>
                </tr>
              </table>

              <!-- Headline -->
              <h1 class="card-heading" style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:22px;font-weight:700;color:#0f0f11;margin:0 0 12px;line-height:1.35;letter-spacing:-0.4px">
                Hi ${name},
              </h1>
              <p class="card-body" style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:15px;color:#3f3f46;line-height:1.75;margin:0 0 24px">
                ${bodyText}
              </p>

              <!-- Usage stats box -->
              <table class="stat-box" width="100%" cellpadding="0" cellspacing="0" role="presentation"
                style="background-color:#f9f9f9;border:1px solid #e4e4e7;border-radius:12px;margin-bottom:24px">
                <tr>
                  <td style="padding:20px 24px">
                    <table width="100%" cellpadding="0" cellspacing="0" role="presentation">
                      <tr>
                        <td width="50%" style="padding-bottom:12px">
                          <div class="stat-label" style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:11px;color:#71717a;font-weight:600;text-transform:uppercase;letter-spacing:0.6px;margin-bottom:3px">Used</div>
                          <div class="stat-value" style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:20px;font-weight:700;color:#0f0f11">${usedDisplay}</div>
                        </td>
                        <td width="50%" style="padding-bottom:12px">
                          <div class="stat-label" style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:11px;color:#71717a;font-weight:600;text-transform:uppercase;letter-spacing:0.6px;margin-bottom:3px">Limit</div>
                          <div class="stat-value" style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:20px;font-weight:700;color:#0f0f11">${limitDisplay}</div>
                        </td>
                      </tr>
                      <tr>
                        <td colspan="2">
                          <!-- Progress bar -->
                          <div class="bar-bg" style="background-color:#e4e4e7;border-radius:100px;height:8px;width:100%;overflow:hidden">
                            <div style="background-color:${accentColor};height:8px;width:${Math.min(pct, 100)}%;border-radius:100px"></div>
                          </div>
                          <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:12px;color:#71717a;margin-top:6px;text-align:right">${pct}% of ${limitDisplay} used</div>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>

              <!-- Upgrade reason -->
              <p class="card-body" style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:14px;color:#52525b;line-height:1.7;margin:0 0 24px">
                ${meta.upgradeReason}
              </p>

              <!-- CTA -->
              <table cellpadding="0" cellspacing="0" role="presentation">
                <tr>
                  <td style="border-radius:9px;background-color:#6366f1">
                    <a href="${upgradeUrl}"
                      style="display:inline-block;padding:14px 32px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;letter-spacing:0.1px;border-radius:9px">
                      Upgrade your plan →
                    </a>
                  </td>
                </tr>
              </table>

            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td class="footer-row" style="background-color:#fafafa;border-top:1px solid #e4e4e7;padding:18px 40px">
              <p class="footer-txt" style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:12px;color:#71717a;line-height:1.6;margin:0;text-align:center">
                You're on the <strong>${planName}</strong> plan.
                <a href="${upgradeUrl}" style="color:#6366f1;text-decoration:none">Compare plans</a> to find the right fit.
                <br>© ${new Date().getFullYear()} GenXQR. All rights reserved.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`

  return { subject, html }
}

// ─── Core notification function ────────────────────────────────────────────────

/**
 * Check if a threshold has been crossed and send a one-time email alert.
 *
 * @param userId      Owner of the resource
 * @param limitType   Which limit to evaluate
 * @param currentUsed Current usage value
 * @param limit       Plan cap value (-1 = unlimited, skip)
 * @param planName    Plan name string for dedup key + email copy
 */
export async function checkAndNotifyLimit(
  userId: string,
  limitType: LimitType,
  currentUsed: number,
  limit: number,
  planName: string,
): Promise<void> {
  // Unlimited plans never trigger notifications
  if (limit <= 0) return

  const pct = (currentUsed / limit) * 100

  // Determine which threshold was crossed (if any)
  let threshold: 80 | 100 | null = null
  if (pct >= 100) {
    threshold = 100
  } else if (pct >= 80) {
    threshold = 80
  }

  if (threshold === null) return

  const periodKey = buildPeriodKey(limitType, planName)

  // Attempt atomic insert — if row already exists the unique constraint fires
  // and we skip sending without any extra SELECT round-trip.
  try {
    await prisma.limitAlert.create({
      data: { userId, limitType, threshold, periodKey },
    })
  } catch {
    // Unique constraint violation → already sent, bail out
    return
  }

  // Fetch user email + name for the email
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { email: true, name: true },
  })
  if (!user) return

  const { subject, html } = buildLimitEmail({
    name:      user.name,
    email:     user.email,
    limitType,
    threshold,
    used:      currentUsed,
    limit,
    planName,
  })

  try {
    await sendEmail({ to: user.email, subject, html })
    logger.info("Limit alert sent", { userId, limitType, threshold, periodKey })
  } catch (err) {
    // Email failure must not propagate — delete the dedup row so we retry next time
    await prisma.limitAlert.deleteMany({
      where: { userId, limitType, threshold, periodKey },
    }).catch(() => undefined)
    logger.error("Failed to send limit alert email", {
      userId,
      limitType,
      threshold,
      error: String(err),
    })
  }
}
