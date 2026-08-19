import nodemailer from "nodemailer"
import { Resend } from "resend"
import { env } from "../config/env.js"
import { logger } from "../logger/index.js"

// Prefer Resend if API key provided, otherwise fall back to SMTP
let resendClient: Resend | null = null
let smtpTransporter: nodemailer.Transporter | null = null

if (env.RESEND_API_KEY) {
  resendClient = new Resend(env.RESEND_API_KEY)
} else if (env.SMTP_HOST) {
  const port = env.SMTP_PORT ?? 587
  smtpTransporter = nodemailer.createTransport({
    host: env.SMTP_HOST,
    port,
    secure: port === 465, // SSL for port 465, STARTTLS for 587
    auth:
      env.SMTP_USER && env.SMTP_PASS
        ? { user: env.SMTP_USER, pass: env.SMTP_PASS }
        : undefined,
  })
}

interface EmailAttachment {
  filename: string
  content: Buffer
  contentType: string
}

interface SendEmailOptions {
  to: string
  subject: string
  html: string
  /**
   * Address replies should go to, when it differs from EMAIL_FROM. The contact
   * form sets this to the visitor so support can reply straight to them, rather
   * than to our own no-reply sender.
   */
  replyTo?: string
  text?: string
  attachments?: EmailAttachment[]
}

export async function sendEmail(opts: SendEmailOptions): Promise<void> {
  if (resendClient) {
    const { error } = await resendClient.emails.send({
      from:        env.EMAIL_FROM,
      to:          opts.to,
      subject:     opts.subject,
      html:        opts.html,
      ...(opts.replyTo ? { replyTo: opts.replyTo } : {}),
      text:        opts.text,
      attachments: opts.attachments?.map((a) => ({
        filename:    a.filename,
        content:     a.content.toString("base64"),
      })),
    })
    if (error) throw new Error(`Resend error: ${error.message}`)
    return
  }

  if (smtpTransporter) {
    await smtpTransporter.sendMail({
      from:        env.EMAIL_FROM,
      to:          opts.to,
      subject:     opts.subject,
      html:        opts.html,
      ...(opts.replyTo ? { replyTo: opts.replyTo } : {}),
      text:        opts.text,
      attachments: opts.attachments?.map((a) => ({
        filename:    a.filename,
        content:     a.content,
        contentType: a.contentType,
      })),
    })
    return
  }

  // No transport — log in dev, throw in production
  if (env.NODE_ENV === "development") {
    // Extract any URL from the HTML so it's easy to click in the terminal
    const urlMatch = opts.html.match(/href="(https?:\/\/[^"]+)"/)
    logger.info(
      `[Email - no transport configured]\n  To: ${opts.to}\n  Subject: ${opts.subject}${urlMatch ? `\n  Link: ${urlMatch[1]}` : ""}`,
    )
    return
  }

  throw new Error("No email transport configured. Set RESEND_API_KEY or SMTP_* variables.")
}

// ─── Shared email shell ───────────────────────────────────────────────────────

/**
 * Wraps inner HTML content in the GenXQR branded email shell.
 * All transactional and broadcast emails use this shell for visual consistency.
 */
function buildEmailShell(subject: string, innerHtml: string): string {
  const year = new Date().getFullYear()

  return `<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="x-apple-disable-message-reformatting">
  <meta name="color-scheme" content="light dark">
  <meta name="supported-color-schemes" content="light dark">
  <title>${subject}</title>
  <!--[if mso]><noscript><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml></noscript><![endif]-->
  <style>
    * { box-sizing: border-box; }
    body, table, td, a { -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%; }
    table, td { mso-table-lspace: 0pt; mso-table-rspace: 0pt; }
    img { border: 0; outline: none; text-decoration: none; -ms-interpolation-mode: bicubic; }

    /* ── Typography helpers used in all email types ── */
    .email-body h1 { font-size: 22px; font-weight: 700; color: #0f0f11; margin: 0 0 16px; line-height: 1.35; letter-spacing: -0.4px; }
    .email-body h2 { font-size: 18px; font-weight: 600; color: #18181b; margin: 24px 0 10px; line-height: 1.4; }
    .email-body h3 { font-size: 15px; font-weight: 600; color: #27272a; margin: 20px 0 8px; }
    .email-body p  { font-size: 15px; color: #3f3f46; line-height: 1.75; margin: 0 0 16px; }
    .email-body a  { color: #6366f1; text-decoration: underline; font-weight: 500; }
    .email-body ul,
    .email-body ol { padding-left: 22px; margin: 0 0 16px; color: #3f3f46; font-size: 15px; line-height: 1.75; }
    .email-body li { margin-bottom: 6px; }
    .email-body blockquote {
      margin: 0 0 16px; padding: 14px 20px;
      border-left: 3px solid #6366f1;
      background: #f5f3ff; border-radius: 0 8px 8px 0;
      color: #4338ca; font-style: italic; font-size: 15px; line-height: 1.7;
    }
    .email-body code {
      background: #f4f4f5; border: 1px solid #e4e4e7;
      border-radius: 4px; padding: 2px 6px;
      font-family: 'SF Mono', Menlo, Monaco, 'Courier New', monospace;
      font-size: 13px; color: #6366f1;
    }
    .email-body pre {
      background: #18181b; border-radius: 10px;
      padding: 18px 22px; overflow-x: auto; margin: 0 0 16px;
    }
    .email-body pre code { background: none; border: none; color: #a5b4fc; font-size: 13px; padding: 0; }
    .email-body hr { border: none; border-top: 1px solid #e4e4e7; margin: 24px 0; }
    .email-body img { max-width: 100%; height: auto; border-radius: 8px; }

    /* Callout box — use <div class="callout"> in HTML mode */
    .email-body .callout {
      background: #f5f3ff; border: 1px solid #ddd6fe;
      border-radius: 10px; padding: 16px 20px; margin: 0 0 16px;
      color: #4338ca; font-size: 14px; line-height: 1.65;
    }
    /* CTA button — use <a class="btn" href="…"> in HTML mode */
    .email-body .btn {
      display: inline-block; padding: 13px 30px;
      background: #6366f1; color: #ffffff !important;
      text-decoration: none !important; font-weight: 600;
      font-size: 14px; border-radius: 9px; letter-spacing: 0.1px;
      margin: 4px 0;
    }
    .email-body .btn-outline {
      display: inline-block; padding: 12px 29px;
      background: transparent; color: #6366f1 !important;
      text-decoration: none !important; font-weight: 600;
      font-size: 14px; border-radius: 9px;
      border: 1.5px solid #6366f1; margin: 4px 0;
    }

    /* ── Dark mode ── */
    @media (prefers-color-scheme: dark) {
      .body-wrap  { background-color: #09090b !important; }
      .card       { background-color: #18181b !important; border-color: #27272a !important; }
      .footer-row { background-color: #111113 !important; border-color: #27272a !important; }
      .logo-text  { color: #a5b4fc !important; }
      .footer-txt { color: #52525b !important; }
      .footer-lnk { color: #818cf8 !important; }
      .email-body h1  { color: #f4f4f5 !important; }
      .email-body h2  { color: #e4e4e7 !important; }
      .email-body h3  { color: #d4d4d8 !important; }
      .email-body p   { color: #a1a1aa !important; }
      .email-body ul,
      .email-body ol  { color: #a1a1aa !important; }
      .email-body blockquote { background: #1e1b3a !important; color: #a5b4fc !important; border-color: #6366f1 !important; }
      .email-body .callout   { background: #1e1b3a !important; border-color: #3730a3 !important; color: #a5b4fc !important; }
      .email-body code       { background: #27272a !important; border-color: #3f3f46 !important; color: #a5b4fc !important; }
      .email-body pre        { background: #0f0f11 !important; }
      .email-body hr         { border-color: #27272a !important; }
    }
  </style>
</head>
<body class="body-wrap" style="margin:0;padding:0;background-color:#f0f1f5;-webkit-font-smoothing:antialiased;mso-line-height-rule:exactly">

  <!-- Hidden preheader text -->
  <div style="display:none;max-height:0;overflow:hidden;mso-hide:all;font-size:1px;color:#f0f1f5;line-height:1px">${subject}&nbsp;&#8203;&nbsp;&#8203;&nbsp;&#8203;&nbsp;&#8203;&nbsp;&#8203;&nbsp;&#8203;&nbsp;&#8203;&nbsp;&#8203;</div>

  <table class="body-wrap" width="100%" cellpadding="0" cellspacing="0" role="presentation" style="background-color:#f0f1f5">
    <tr>
      <td align="center" style="padding:48px 16px 40px">

        <!-- ── Logo ── -->
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

        <!-- ── Card ── -->
        <table class="card" width="560" cellpadding="0" cellspacing="0" role="presentation"
          style="max-width:560px;width:100%;background-color:#ffffff;border-radius:16px;border:1px solid #e4e4e7;overflow:hidden">

          <!-- Gradient accent bar -->
          <tr>
            <td height="3" style="height:3px;font-size:0;line-height:0;background:linear-gradient(90deg,#6366f1 0%,#818cf8 55%,#c7d2fe 100%)">&#8203;</td>
          </tr>

          <!-- Content -->
          <tr>
            <td class="email-body" style="padding:40px 48px 36px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif">
              ${innerHtml}
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td class="footer-row" style="background-color:#fafafa;border-top:1px solid #e4e4e7;padding:18px 48px">
              <table width="100%" cellpadding="0" cellspacing="0" role="presentation">
                <tr>
                  <td>
                    <p class="footer-txt" style="margin:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:12px;color:#71717a;line-height:1.65">
                      You received this because you have a GenXQR account.<br>
                      &copy; ${year} GenXQR &middot; All rights reserved.
                    </p>
                  </td>
                  <td align="right" valign="middle" style="white-space:nowrap">
                    <a class="footer-lnk" href="https://genxqr.com"
                      style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:12px;color:#6366f1;text-decoration:none;font-weight:500">
                      genxqr.com
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`
}

// ─── Transactional emails ─────────────────────────────────────────────────────

/**
 * Escapes text destined for an HTML email body.
 *
 * These templates interpolate caller-supplied strings straight into markup. That
 * was reachable only by authenticated users before; the public contact form makes
 * it reachable by anyone, so an unescaped subject or message could inject markup
 * into the support inbox. Escaping happens inside the builders so every caller is
 * covered rather than each one having to remember.
 */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
}

export function buildVerificationEmail(name: string, verifyUrl: string): string {
  const inner = `
    <h1 style="margin:0 0 20px;font-size:22px;font-weight:700;color:#0f0f11;letter-spacing:-0.4px;line-height:1.35;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif">
      Verify your email address
    </h1>
    <p style="margin:0 0 8px;font-size:15px;color:#3f3f46;line-height:1.75;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif">
      Hi ${name},
    </p>
    <p style="margin:0 0 28px;font-size:15px;color:#3f3f46;line-height:1.75;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif">
      Thanks for signing up! Click the button below to confirm your email address and activate your GenXQR account.
    </p>
    <table cellpadding="0" cellspacing="0" role="presentation" style="margin-bottom:28px">
      <tr>
        <td align="center" style="border-radius:9px;background:#6366f1">
          <a href="${verifyUrl}"
            style="display:inline-block;padding:13px 32px;background:#6366f1;color:#ffffff;text-decoration:none;font-weight:600;font-size:14px;border-radius:9px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;letter-spacing:0.1px">
            Verify Email Address
          </a>
        </td>
      </tr>
    </table>
    <p style="margin:0 0 6px;font-size:13px;color:#71717a;line-height:1.6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif">
      Or copy and paste this link into your browser:
    </p>
    <p style="margin:0 0 24px;font-size:12px;line-height:1.6;font-family:'SF Mono',Menlo,Monaco,'Courier New',monospace">
      <a href="${verifyUrl}" style="color:#6366f1;text-decoration:underline;word-break:break-all">${verifyUrl}</a>
    </p>
    <p style="margin:0;font-size:13px;color:#a1a1aa;line-height:1.6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif">
      This link expires in <strong style="color:#71717a">24 hours</strong>. If you didn't create a GenXQR account, you can safely ignore this email.
    </p>`

  return buildEmailShell("Verify your email — GenXQR", inner)
}

export function buildPasswordResetEmail(name: string, resetUrl: string): string {
  const inner = `
    <h1 style="margin:0 0 20px;font-size:22px;font-weight:700;color:#0f0f11;letter-spacing:-0.4px;line-height:1.35;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif">
      Reset your password
    </h1>
    <p style="margin:0 0 8px;font-size:15px;color:#3f3f46;line-height:1.75;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif">
      Hi ${name},
    </p>
    <p style="margin:0 0 28px;font-size:15px;color:#3f3f46;line-height:1.75;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif">
      We received a request to reset the password for your GenXQR account. Click the button below to choose a new password.
    </p>
    <table cellpadding="0" cellspacing="0" role="presentation" style="margin-bottom:28px">
      <tr>
        <td align="center" style="border-radius:9px;background:#6366f1">
          <a href="${resetUrl}"
            style="display:inline-block;padding:13px 32px;background:#6366f1;color:#ffffff;text-decoration:none;font-weight:600;font-size:14px;border-radius:9px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;letter-spacing:0.1px">
            Reset Password
          </a>
        </td>
      </tr>
    </table>
    <p style="margin:0 0 6px;font-size:13px;color:#71717a;line-height:1.6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif">
      Or copy and paste this link into your browser:
    </p>
    <p style="margin:0 0 24px;font-size:12px;line-height:1.6;font-family:'SF Mono',Menlo,Monaco,'Courier New',monospace">
      <a href="${resetUrl}" style="color:#6366f1;text-decoration:underline;word-break:break-all">${resetUrl}</a>
    </p>
    <p style="margin:0;font-size:13px;color:#a1a1aa;line-height:1.6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif">
      This link expires in <strong style="color:#71717a">1 hour</strong>. If you didn't request a password reset, no action is needed — your password remains unchanged.
    </p>`

  return buildEmailShell("Reset your password — GenXQR", inner)
}

// ─── Renewal reminder emails ──────────────────────────────────────────────────

/**
 * Builds a subscription expiry warning email sent 7, 3, or 1 day before expiry.
 */
export function buildRenewalReminderEmail(
  name: string,
  daysLeft: number,
  planName: string,
  expiryDate: string,
  paymentUrl: string,
): string {
  const urgency = daysLeft === 1 ? "today" : `in ${daysLeft} day${daysLeft !== 1 ? "s" : ""}`
  const accentColor = daysLeft <= 1 ? "#ef4444" : daysLeft <= 3 ? "#f59e0b" : "#6366f1"
  const subject = `Your ${planName} plan expires ${urgency} — GenXQR`

  const inner = `
    <p style="margin:0 0 4px;font-size:13px;color:#71717a;letter-spacing:0.5px;text-transform:uppercase;font-weight:600;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif">Subscription Reminder</p>
    <h1 style="margin:0 0 20px;font-size:22px;font-weight:700;color:#0f0f11;line-height:1.3;letter-spacing:-0.4px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif">
      Your plan expires ${urgency}
    </h1>
    <p style="margin:0 0 20px;font-size:15px;color:#3f3f46;line-height:1.75;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif">
      Hi ${name}, your <strong style="color:#18181b">${planName}</strong> plan on GenXQR is set to expire on <strong style="color:#18181b">${expiryDate}</strong>. After this date, your account will be downgraded to the Free plan and some features may become unavailable.
    </p>

    <!-- Usage warning box -->
    <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="margin:0 0 24px">
      <tr>
        <td style="background:#fff8f0;border:1px solid ${accentColor}33;border-left:4px solid ${accentColor};border-radius:10px;padding:16px 20px">
          <p style="margin:0 0 4px;font-size:13px;font-weight:700;color:${accentColor};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif">
            ⏰ Expires ${urgency.charAt(0).toUpperCase() + urgency.slice(1)}
          </p>
          <p style="margin:0;font-size:14px;color:#52525b;line-height:1.6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif">
            Plan: <strong style="color:#18181b">${planName}</strong> &nbsp;·&nbsp; Expiry date: <strong style="color:#18181b">${expiryDate}</strong>
          </p>
        </td>
      </tr>
    </table>

    <p style="margin:0 0 12px;font-size:15px;color:#3f3f46;line-height:1.75;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif">
      To keep enjoying uninterrupted access to all your QR codes and analytics, renew your subscription before it expires:
    </p>

    <!-- CTA button -->
    <table cellpadding="0" cellspacing="0" role="presentation" style="margin:0 0 24px">
      <tr>
        <td style="border-radius:10px;background:${accentColor}">
          <a href="${paymentUrl}" target="_blank"
            style="display:inline-block;padding:13px 32px;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;letter-spacing:0.2px">
            Renew My Subscription →
          </a>
        </td>
      </tr>
    </table>

    <p style="margin:0;font-size:13px;color:#a1a1aa;line-height:1.6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif">
      If you have already renewed or no longer need this plan, you can safely ignore this email. For support, reply to this email or visit our help centre.
    </p>`

  return buildEmailShell(subject, inner)
}

/**
 * Builds the "your plan has expired" email sent when currentPeriodEnd has passed.
 */
export function buildExpiredNoticeEmail(
  name: string,
  planName: string,
  paymentUrl: string,
): string {
  const inner = `
    <p style="margin:0 0 4px;font-size:13px;color:#71717a;letter-spacing:0.5px;text-transform:uppercase;font-weight:600;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif">Subscription Expired</p>
    <h1 style="margin:0 0 20px;font-size:22px;font-weight:700;color:#0f0f11;line-height:1.3;letter-spacing:-0.4px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif">
      Your ${planName} plan has expired
    </h1>
    <p style="margin:0 0 20px;font-size:15px;color:#3f3f46;line-height:1.75;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif">
      Hi ${name}, your <strong style="color:#18181b">${planName}</strong> subscription on GenXQR has expired. Your account has been moved to the Free plan. Dynamic QR codes may have been deactivated, and premium features are no longer available.
    </p>

    <!-- Expired box -->
    <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="margin:0 0 24px">
      <tr>
        <td style="background:#fef2f2;border:1px solid #fecaca;border-left:4px solid #ef4444;border-radius:10px;padding:16px 20px">
          <p style="margin:0 0 4px;font-size:13px;font-weight:700;color:#ef4444;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif">
            ❌ Subscription Expired
          </p>
          <p style="margin:0;font-size:14px;color:#52525b;line-height:1.6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif">
            Your <strong style="color:#18181b">${planName}</strong> plan has ended. Reactivate to restore all features and QR codes.
          </p>
        </td>
      </tr>
    </table>

    <p style="margin:0 0 12px;font-size:15px;color:#3f3f46;line-height:1.75;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif">
      Reactivate your subscription now to restore access to your premium QR codes, analytics, team features, and more:
    </p>

    <!-- CTA button -->
    <table cellpadding="0" cellspacing="0" role="presentation" style="margin:0 0 24px">
      <tr>
        <td style="border-radius:10px;background:#6366f1">
          <a href="${paymentUrl}" target="_blank"
            style="display:inline-block;padding:13px 32px;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;letter-spacing:0.2px">
            Reactivate My Plan →
          </a>
        </td>
      </tr>
    </table>

    <p style="margin:0;font-size:13px;color:#a1a1aa;line-height:1.6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif">
      Questions? Reply to this email or contact our support team. We're here to help.
    </p>`

  return buildEmailShell(`Your ${planName} plan has expired — GenXQR`, inner)
}

// ─── Broadcast email ──────────────────────────────────────────────────────────

/**
 * Wraps broadcast body content in the GenXQR email shell.
 * @param subject  Email subject line — used for <title> and preheader text.
 * @param body     Admin-authored content: raw HTML or plain text.
 * @param isHtml   When true, body is used as-is. When false, double-newlines
 *                 become paragraph breaks and single newlines become <br>.
 */
export function buildBroadcastEmail(subject: string, body: string, isHtml: boolean): string {
  const content = isHtml
    ? body
    : body
        .split(/\n\n+/)
        .map(
          (para) =>
            `<p style="margin:0 0 16px;font-size:15px;color:#3f3f46;line-height:1.75;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif">${para.replace(/\n/g, "<br>")}</p>`,
        )
        .join("\n")

  return buildEmailShell(subject, content)
}

// ─── Support Ticket emails ─────────────────────────────────────────────────────

/**
 * Email sent to the admin (support@genxqr.com) when a new support ticket is submitted.
 */
export function buildSupportTicketAdminEmail(opts: {
  userName: string
  userEmail: string
  ticketId: string
  subject: string
  category: string
  message: string
  adminUrl: string
}): string {
  // Generated ids and our own URLs are not user input; everything else is.
  const safe = {
    userName: escapeHtml(opts.userName),
    userEmail: escapeHtml(opts.userEmail),
    subject: escapeHtml(opts.subject),
    category: escapeHtml(opts.category),
    message: escapeHtml(opts.message),
    ticketId: opts.ticketId,
    adminUrl: opts.adminUrl,
  }

  const inner = `
    <p style="margin:0 0 4px;font-size:13px;color:#71717a;letter-spacing:0.5px;text-transform:uppercase;font-weight:600;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif">New Support Ticket</p>
    <h1 style="margin:0 0 20px;font-size:22px;font-weight:700;color:#0f0f11;line-height:1.3;letter-spacing:-0.4px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif">
      ${safe.subject}
    </h1>

    <!-- Ticket meta -->
    <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="margin:0 0 24px;border:1px solid #e4e4e7;border-radius:10px;overflow:hidden">
      <tr>
        <td style="padding:14px 20px;background:#f9f9fb;border-bottom:1px solid #e4e4e7">
          <table width="100%" cellpadding="0" cellspacing="0" role="presentation">
            <tr>
              <td style="font-size:12px;color:#71717a;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-weight:600;text-transform:uppercase;letter-spacing:0.4px">From</td>
              <td align="right" style="font-size:14px;color:#18181b;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-weight:500">${safe.userName} &lt;${safe.userEmail}&gt;</td>
            </tr>
          </table>
        </td>
      </tr>
      <tr>
        <td style="padding:14px 20px;background:#f9f9fb;border-bottom:1px solid #e4e4e7">
          <table width="100%" cellpadding="0" cellspacing="0" role="presentation">
            <tr>
              <td style="font-size:12px;color:#71717a;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-weight:600;text-transform:uppercase;letter-spacing:0.4px">Category</td>
              <td align="right" style="font-size:14px;color:#18181b;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-weight:500">${safe.category}</td>
            </tr>
          </table>
        </td>
      </tr>
      <tr>
        <td style="padding:14px 20px;background:#f9f9fb">
          <table width="100%" cellpadding="0" cellspacing="0" role="presentation">
            <tr>
              <td style="font-size:12px;color:#71717a;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-weight:600;text-transform:uppercase;letter-spacing:0.4px">Ticket ID</td>
              <td align="right" style="font-size:14px;color:#6366f1;font-family:'SF Mono',Menlo,Monaco,'Courier New',monospace;font-weight:500">${safe.ticketId.slice(0, 8).toUpperCase()}</td>
            </tr>
          </table>
        </td>
      </tr>
    </table>

    <!-- Message body -->
    <h2 style="margin:0 0 12px;font-size:15px;font-weight:600;color:#18181b;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif">Message</h2>
    <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="margin:0 0 24px">
      <tr>
        <td style="background:#f5f3ff;border:1px solid #ddd6fe;border-left:4px solid #6366f1;border-radius:10px;padding:16px 20px;font-size:15px;color:#3f3f46;line-height:1.75;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;white-space:pre-wrap">${safe.message}</td>
      </tr>
    </table>

    <!-- CTA -->
    <table cellpadding="0" cellspacing="0" role="presentation" style="margin:0 0 24px">
      <tr>
        <td style="border-radius:10px;background:#6366f1">
          <a href="${safe.adminUrl}" target="_blank"
            style="display:inline-block;padding:13px 32px;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;letter-spacing:0.2px">
            View Ticket in Admin →
          </a>
        </td>
      </tr>
    </table>

    <p style="margin:0;font-size:13px;color:#a1a1aa;line-height:1.6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif">
      This notification was sent because a user submitted a support ticket on GenXQR.
    </p>`

  return buildEmailShell(`[Support] ${safe.subject} — GenXQR`, inner)
}

/**
 * Confirmation email sent to the user after they submit a support ticket.
 */
export function buildSupportTicketConfirmationEmail(opts: {
  userName: string
  ticketId: string
  subject: string
  category: string
}): string {
  // Generated ids and our own URLs are not user input; everything else is.
  const safe = {
    userName: escapeHtml(opts.userName),
    subject: escapeHtml(opts.subject),
    category: escapeHtml(opts.category),
    ticketId: opts.ticketId,
  }

  const inner = `
    <h1 style="margin:0 0 20px;font-size:22px;font-weight:700;color:#0f0f11;line-height:1.3;letter-spacing:-0.4px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif">
      We've received your request
    </h1>
    <p style="margin:0 0 20px;font-size:15px;color:#3f3f46;line-height:1.75;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif">
      Hi ${safe.userName}, thanks for reaching out! Your support ticket has been submitted and our team will get back to you as soon as possible.
    </p>

    <!-- Ticket summary -->
    <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="margin:0 0 28px;background:#f5f3ff;border:1px solid #ddd6fe;border-radius:12px;overflow:hidden">
      <tr>
        <td style="padding:20px 24px">
          <p style="margin:0 0 8px;font-size:12px;color:#818cf8;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-weight:700;text-transform:uppercase;letter-spacing:0.5px">Ticket Summary</p>
          <p style="margin:0 0 4px;font-size:15px;font-weight:600;color:#1e1b4b;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif">${safe.subject}</p>
          <p style="margin:0;font-size:13px;color:#6366f1;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif">
            Category: ${safe.category} &nbsp;·&nbsp; Ticket ID: <strong>${safe.ticketId.slice(0, 8).toUpperCase()}</strong>
          </p>
        </td>
      </tr>
    </table>

    <p style="margin:0;font-size:13px;color:#a1a1aa;line-height:1.6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif">
      We typically respond within 1–2 business days. You can track your ticket status from your dashboard → Help &amp; Support.
    </p>`

  return buildEmailShell(`Support ticket received — GenXQR`, inner)
}

// ─── Job Application email ────────────────────────────────────────────────────

export function buildJobApplicationEmail(opts: {
  candidateName: string
  candidateEmail: string
  candidatePhone?: string
  linkedIn?: string
  experience?: string
  jobTitle: string
  coverLetter: string
  cvFilename: string
}): string {
  const row = (label: string, value: string) =>
    value
      ? `<tr>
          <td style="padding:10px 20px;border-bottom:1px solid #e4e4e7;font-size:12px;color:#71717a;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-weight:600;text-transform:uppercase;letter-spacing:0.4px;width:130px;vertical-align:top">${label}</td>
          <td style="padding:10px 20px;border-bottom:1px solid #e4e4e7;font-size:14px;color:#18181b;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif">${value}</td>
        </tr>`
      : ""

  const inner = `
    <p style="margin:0 0 4px;font-size:13px;color:#71717a;letter-spacing:0.5px;text-transform:uppercase;font-weight:600;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif">New Job Application</p>
    <h1 style="margin:0 0 20px;font-size:22px;font-weight:700;color:#0f0f11;line-height:1.3;letter-spacing:-0.4px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif">
      ${opts.candidateName} applied for ${opts.jobTitle}
    </h1>

    <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="margin:0 0 24px;border:1px solid #e4e4e7;border-radius:10px;overflow:hidden">
      ${row("Position", opts.jobTitle)}
      ${row("Name", opts.candidateName)}
      ${row("Email", `<a href="mailto:${opts.candidateEmail}" style="color:#6366f1">${opts.candidateEmail}</a>`)}
      ${opts.candidatePhone ? row("Phone", opts.candidatePhone) : ""}
      ${opts.linkedIn ? row("LinkedIn", `<a href="${opts.linkedIn}" style="color:#6366f1">View profile</a>`) : ""}
      ${opts.experience ? row("Experience", opts.experience) : ""}
      ${row("CV / Resume", `📎 ${opts.cvFilename} (attached)`)}
    </table>

    <h2 style="margin:0 0 12px;font-size:15px;font-weight:600;color:#18181b;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif">Cover Letter</h2>
    <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="margin:0 0 24px">
      <tr>
        <td style="background:#f5f3ff;border:1px solid #ddd6fe;border-left:4px solid #6366f1;border-radius:10px;padding:16px 20px;font-size:15px;color:#3f3f46;line-height:1.75;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;white-space:pre-wrap">${opts.coverLetter}</td>
      </tr>
    </table>

    <table cellpadding="0" cellspacing="0" role="presentation" style="margin:0 0 24px">
      <tr>
        <td style="border-radius:10px;background:#6366f1">
          <a href="mailto:${opts.candidateEmail}?subject=Re: Your application for ${encodeURIComponent(opts.jobTitle)} at GenXQR"
            style="display:inline-block;padding:13px 32px;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif">
            Reply to Candidate →
          </a>
        </td>
      </tr>
    </table>

    <p style="margin:0;font-size:13px;color:#a1a1aa;line-height:1.6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif">
      Submitted via GenXQR careers page. CV attached.
    </p>`

  return buildEmailShell(`[Application] ${opts.candidateName} → ${opts.jobTitle}`, inner)
}
