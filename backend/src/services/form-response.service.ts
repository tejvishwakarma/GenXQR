import { Prisma } from "@prisma/client"
import { prisma } from "../db/prisma.js"
import { redis } from "../redis/client.js"
import { env } from "../config/env.js"
import { logger } from "../logger/index.js"
import { AppError } from "../middleware/error.middleware.js"
import { csvCell } from "../utils/csv-cell.util.js"
import type { FormField } from "../utils/typed-content.util.js"
import { buildFormResponseEmail, sendEmail } from "./email.service.js"
import { deliverWebhookEvent } from "./webhook.service.js"

/**
 * Responses to FORM codes (built 8 Nov 2026). Anyone who scans the code can
 * answer, so every answer is checked against the form's own questions, size-
 * limited, and capped per code; the owner reads them in the dashboard, as CSV,
 * by email (optional) and by the form.submitted webhook.
 */

/** Per code — far beyond a real campaign, a bound on what a bot can store. */
export const MAX_RESPONSES_PER_CODE = 50_000
/**
 * Answers one code accepts per hour, from everyone together. The per-IP limit
 * alone let many addresses fill a form to its 50,000 cap in an afternoon,
 * after which it turned real visitors away for good. At this rate a flood
 * takes days, and the owner sees it long before.
 */
export const MAX_RESPONSES_PER_CODE_PER_HOUR = 600
/** Owner emails per code per hour; a burst of answers does not flood the inbox. */
const NOTIFY_PER_HOUR = 20

export type Answer = { id: string; label: string; value: string }

const EMAIL = /^[^\s@]{1,64}@[^\s@]{1,255}\.[^\s@]{2,}$/
const MAX_LEN: Record<FormField["type"], number> = { text: 300, email: 254, phone: 20, textarea: 3000, rating: 1, select: 100 }

/** The visitor's answers, checked against the form's questions. Unknown keys are dropped. */
export function checkAnswers(fields: FormField[], body: unknown): Answer[] {
  const input = (body && typeof body === "object" ? body : {}) as Record<string, unknown>
  return fields.map((f) => {
    const raw = input[f.id]
    const value = typeof raw === "string" ? raw.trim() : typeof raw === "number" ? String(raw) : ""
    if (!value) {
      if (f.required) throw new AppError(422, `Please answer "${f.label}".`)
      return { id: f.id, label: f.label, value: "" }
    }
    // A field of a type this version doesn't know (content saved before a rule
    // existed) still gets a limit — never "no limit".
    if (value.length > (MAX_LEN[f.type] ?? 300)) throw new AppError(422, `"${f.label}" is too long.`)
    if (f.type === "email" && !EMAIL.test(value)) throw new AppError(422, `"${f.label}" isn't a valid email address.`)
    if (f.type === "phone" && !/^\+?[\d\s()-]{7,20}$/.test(value)) throw new AppError(422, `"${f.label}" isn't a valid phone number.`)
    if (f.type === "rating" && !/^[1-5]$/.test(value)) throw new AppError(422, `Rate "${f.label}" from 1 to 5.`)
    if (f.type === "select" && !(f.options ?? []).includes(value)) throw new AppError(422, `Choose one of the options for "${f.label}".`)
    return { id: f.id, label: f.label, value }
  })
}

/** Stores an answer to a FORM code (already gated like a scan by the caller) and tells the owner. */
export async function recordResponse(
  qr: { id: string; name: string; userId: string | null; content: Record<string, unknown> },
  body: unknown,
) {
  const fields = (Array.isArray(qr.content.fields) ? qr.content.fields : []) as FormField[]
  if (fields.length === 0) throw new AppError(404, "This form isn't available.")
  const answers = checkAnswers(fields, body)
  if ((await prisma.formResponse.count({ where: { qrId: qr.id } })) >= MAX_RESPONSES_PER_CODE) {
    throw new AppError(403, "This form isn't taking more responses.")
  }
  const hourKey = `form:rate:${qr.id}:${Math.floor(Date.now() / 3_600_000)}`
  const thisHour = await redis.multi().incr(hourKey).expire(hourKey, 7200).exec().then((r) => Number(r?.[0]?.[1] ?? 0)).catch(() => 0)
  if (thisHour > MAX_RESPONSES_PER_CODE_PER_HOUR) {
    throw new AppError(429, "This form is getting a lot of responses right now. Please try again in a little while.")
  }
  const response = await prisma.formResponse.create({
    data: { qrId: qr.id, data: answers as unknown as Prisma.InputJsonValue },
    select: { id: true, createdAt: true },
  })

  const owner = qr.userId
  if (owner) {
    const payload = { qrId: qr.id, qrName: qr.name, responseId: response.id, submittedAt: response.createdAt.toISOString(), answers }
    void deliverWebhookEvent(owner, "form.submitted", payload)
    if (qr.content.notify === true) void notifyOwner(owner, qr, answers)
  }
  return response
}

async function notifyOwner(ownerId: string, qr: { id: string; content: Record<string, unknown>; name: string }, answers: Answer[]) {
  try {
    const key = `form:notify:${qr.id}:${new Date().toISOString().slice(0, 13)}`
    const [[, sent]] = (await redis.multi().incr(key).expire(key, 3600).exec()) as [[unknown, number]]
    if (sent > NOTIFY_PER_HOUR) return
    const user = await prisma.user.findUnique({ where: { id: ownerId }, select: { email: true } })
    if (!user) return
    const formTitle = typeof qr.content.title === "string" ? qr.content.title : qr.name
    await sendEmail({
      to: user.email,
      subject: `New response: ${formTitle}`,
      html: buildFormResponseEmail({ formTitle, answers, responsesUrl: `${env.FRONTEND_URL}/app/qr/${qr.id}` }),
      // A visitor who left an email can be answered straight from the notification.
      ...(answers.find((a) => EMAIL.test(a.value)) && { replyTo: answers.find((a) => EMAIL.test(a.value))!.value }),
    })
  } catch (err) {
    logger.warn("Form response email failed", { qrId: qr.id, error: err instanceof Error ? err.message : String(err) })
  }
}

async function ownedFormCode(ownerId: string, qrId: string) {
  const qr = await prisma.qRCode.findFirst({ where: { id: qrId, userId: ownerId }, select: { id: true, name: true, type: true } })
  if (!qr) throw new AppError(404, "QR code not found")
  return qr
}

export async function listResponses(ownerId: string, qrId: string, page = 1, limit = 25) {
  await ownedFormCode(ownerId, qrId)
  const [total, rows] = await Promise.all([
    prisma.formResponse.count({ where: { qrId } }),
    prisma.formResponse.findMany({ where: { qrId }, orderBy: { createdAt: "desc" }, skip: (page - 1) * limit, take: limit, select: { id: true, data: true, createdAt: true } }),
  ])
  return { data: rows, pagination: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) } }
}

export async function deleteResponse(ownerId: string, qrId: string, responseId: string) {
  await ownedFormCode(ownerId, qrId)
  const { count } = await prisma.formResponse.deleteMany({ where: { id: responseId, qrId } })
  if (count === 0) throw new AppError(404, "Response not found")
}

/** Every response as CSV, newest first; one column per question label ever used. */
export async function responsesCsv(ownerId: string, qrId: string) {
  const qr = await ownedFormCode(ownerId, qrId)
  const rows = await prisma.formResponse.findMany({ where: { qrId }, orderBy: { createdAt: "desc" }, take: MAX_RESPONSES_PER_CODE, select: { data: true, createdAt: true } })
  const columns: string[] = []
  for (const r of rows) for (const a of r.data as unknown as Answer[]) if (!columns.includes(a.label)) columns.push(a.label)
  const lines = [["submitted_at", ...columns].map(csvCell).join(",")]
  for (const r of rows) {
    const byLabel = new Map((r.data as unknown as Answer[]).map((a) => [a.label, a.value]))
    lines.push([r.createdAt.toISOString(), ...columns.map((c) => byLabel.get(c) ?? "")].map(csvCell).join(","))
  }
  return { filename: `${qr.name.replace(/[^a-z0-9_-]/gi, "_")}-responses.csv`, csv: lines.join("\n") + "\n" }
}
