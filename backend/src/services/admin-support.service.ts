import path from "path"
import fs from "fs"
import { prisma } from "../db/prisma.js"
import { AppError } from "../middleware/error.middleware.js"

export interface PaginationParams {
  page: number
  limit: number
  q?: string
}

function pageMeta(total: number, page: number, limit: number) {
  return { total, page, limit, pages: Math.ceil(total / limit) }
}

// ─── Support tickets ───────────────────────────────────────────────────────────

export async function countOpenTickets(): Promise<number> {
  return prisma.supportTicket.count({ where: { status: "OPEN" } })
}

export async function listTickets({ page, limit, q }: PaginationParams, status?: string, priority?: string) {
  const skip = (page - 1) * limit

  const where: Record<string, unknown> = {}
  if (status) where["status"] = status
  if (priority) where["priority"] = priority
  if (q) {
    where["OR"] = [
      { subject: { contains: q, mode: "insensitive" } },
      { message: { contains: q, mode: "insensitive" } },
    ]
  }

  const [total, tickets] = await prisma.$transaction([
    prisma.supportTicket.count({ where }),
    prisma.supportTicket.findMany({
      where,
      skip,
      take: limit,
      orderBy: { createdAt: "desc" },
      select: {
        id: true, subject: true, status: true, priority: true,
        // category is what the customer chose (billing / technical /
        // feature_request / other). It was stored and returned by getTicket, but
        // omitted here — so the admin table could not show it and triage meant
        // opening every ticket.
        category: true,
        assignedTo: true, createdAt: true, updatedAt: true, resolvedAt: true,
        user: { select: { id: true, name: true, email: true } },
      },
    }),
  ])

  return { tickets, meta: pageMeta(total, page, limit) }
}

export async function getTicket(ticketId: string) {
  const ticket = await prisma.supportTicket.findUnique({
    where: { id: ticketId },
    include: {
      user: { select: { id: true, name: true, email: true } },
      // Oldest first: a conversation reads top to bottom. The author's name is
      // included for staff replies so the team can see who answered.
      messages: {
        orderBy: { createdAt: "asc" },
        select: {
          id: true, body: true, isStaff: true, createdAt: true,
          author: { select: { name: true } },
        },
      },
    },
  })
  if (!ticket) throw new AppError(404, "Ticket not found")
  return ticket
}

/**
 * Staff reply on a ticket.
 *
 * isStaff is recorded on the row rather than inferred later from the author's role,
 * so a reply stays a staff reply even if that account is demoted or removed.
 *
 * An OPEN ticket becomes IN_PROGRESS: someone has now picked it up, and leaving it
 * OPEN would keep it in the untouched queue. A RESOLVED or CLOSED ticket is left
 * alone — answering a closing question should not reopen it.
 */
export async function addStaffReply(ticketId: string, adminId: string, body: string) {
  const ticket = await prisma.supportTicket.findUnique({
    where: { id: ticketId },
    select: {
      id: true, subject: true, status: true,
      user: { select: { name: true, email: true } },
    },
  })
  if (!ticket) throw new AppError(404, "Ticket not found")

  const [message] = await prisma.$transaction([
    prisma.ticketMessage.create({
      data: { ticketId, authorId: adminId, isStaff: true, body },
      select: { id: true, body: true, isStaff: true, createdAt: true },
    }),
    prisma.supportTicket.update({
      where: { id: ticketId },
      data: ticket.status === "OPEN" ? { status: "IN_PROGRESS" } : { updatedAt: new Date() },
    }),
  ])

  return { message, ticket }
}

export interface TicketUpdateInput {
  status?: "OPEN" | "IN_PROGRESS" | "RESOLVED" | "CLOSED" | undefined
  priority?: "LOW" | "MEDIUM" | "HIGH" | "URGENT" | undefined
  assignedTo?: string | undefined
  adminNotes?: string | undefined
}

export async function updateTicket(ticketId: string, data: TicketUpdateInput) {
  const extra: Record<string, unknown> = {}
  if (data.status === "RESOLVED" || data.status === "CLOSED") extra["resolvedAt"] = new Date()

  return prisma.supportTicket.update({
    where: { id: ticketId },
    data: { ...data, ...extra },
  })
}

// ─── Job postings ──────────────────────────────────────────────────────────────

type JobStatus = "OPEN" | "PAUSED" | "FILLED" | "CLOSED"

export interface JobPostingInput {
  title: string
  department?: string | undefined
  location?: string | undefined
  type: string
  description: string
  status?: JobStatus | undefined
}

export async function listJobs() {
  return prisma.jobPosting.findMany({ orderBy: { postedAt: "desc" } })
}

export async function createJob(input: JobPostingInput) {
  return prisma.jobPosting.create({
    data: {
      title: input.title,
      department: input.department,
      location: input.location,
      type: input.type,
      description: input.description,
      status: input.status ?? "OPEN",
    },
  })
}

export async function updateJob(jobId: string, input: Partial<JobPostingInput>) {
  return prisma.jobPosting.update({ where: { id: jobId }, data: input })
}

export async function deleteJob(jobId: string): Promise<void> {
  await prisma.jobPosting.delete({ where: { id: jobId } })
}

// ─── Job applications ──────────────────────────────────────────────────────────

export async function countNewApplications(): Promise<number> {
  return prisma.jobApplication.count({ where: { status: "NEW" } })
}

export async function listApplications(
  { page, limit, q }: PaginationParams,
  status?: string,
  jobId?: string,
) {
  const skip = (page - 1) * limit

  const where: Record<string, unknown> = {}
  if (status) where["status"] = status
  if (jobId) where["jobId"] = jobId
  if (q) {
    where["OR"] = [
      { name: { contains: q, mode: "insensitive" } },
      { email: { contains: q, mode: "insensitive" } },
      { jobTitle: { contains: q, mode: "insensitive" } },
    ]
  }

  const [total, applications] = await Promise.all([
    prisma.jobApplication.count({ where }),
    prisma.jobApplication.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip,
      take: limit,
      select: {
        id: true,
        jobTitle: true,
        name: true,
        email: true,
        phone: true,
        linkedin: true,
        experience: true,
        cvFilename: true,
        status: true,
        createdAt: true,
        notes: true,
        job: { select: { id: true, title: true, status: true } },
      },
    }),
  ])

  return { applications, meta: pageMeta(total, page, limit) }
}

export async function updateApplication(applicationId: string, status?: string, notes?: string) {
  return prisma.jobApplication.update({
    where: { id: applicationId },
    data: {
      ...(status ? { status: status as "NEW" | "REVIEWING" | "SHORTLISTED" | "REJECTED" | "HIRED" } : {}),
      ...(notes !== undefined ? { notes } : {}),
    },
  })
}

export async function deleteApplication(applicationId: string): Promise<void> {
  await prisma.jobApplication.delete({ where: { id: applicationId } })
}

/**
 * Resolves and validates the on-disk path of an application's CV.
 * Returns the verified absolute path plus the metadata the route needs to
 * stream it — the streaming itself stays in the route, since it's an
 * HTTP-response concern.
 */
export async function resolveApplicationCV(applicationId: string): Promise<{
  path: string
  filename: string
  mimeType: string
}> {
  const application = await prisma.jobApplication.findUnique({
    where: { id: applicationId },
    select: { cvPath: true, cvFilename: true, cvMimeType: true },
  })

  if (!application) throw new AppError(404, "Application not found.")
  if (!application.cvPath) {
    throw new AppError(404, "CV not available (submitted before storage was enabled).")
  }

  // Path-traversal protection — mirrors the upload.routes.ts pattern
  const UPLOAD_BASE = path.join(process.cwd(), "uploads")
  const resolved = path.resolve(application.cvPath)
  if (!resolved.startsWith(UPLOAD_BASE + path.sep) && resolved !== UPLOAD_BASE) {
    throw new AppError(400, "Invalid file path.")
  }

  if (!fs.existsSync(resolved)) throw new AppError(404, "CV file not found on server.")

  return {
    path: resolved,
    filename: application.cvFilename,
    mimeType: application.cvMimeType ?? "application/octet-stream",
  }
}
