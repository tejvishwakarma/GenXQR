import { Queue, Worker, Job } from "bullmq"
import { env } from "../config/env.js"
import { logger } from "../logger/index.js"
import { checkAndSendRenewalReminders } from "../services/renewal-reminder.service.js"

const QUEUE_NAME = "renewal-reminder"

// ─── Queue ────────────────────────────────────────────────────────────────────

const reminderQueue = new Queue(QUEUE_NAME, {
  connection: { url: env.REDIS_URL },
  defaultJobOptions: {
    removeOnComplete: 10,
    removeOnFail: 20,
    attempts: 2,
    backoff: { type: "exponential", delay: 60_000 }, // 1 min back-off on retry
  },
})

// ─── Worker ───────────────────────────────────────────────────────────────────

let worker: Worker | null = null

async function processReminderJob(_job: Job): Promise<void> {
  await checkAndSendRenewalReminders()
}

/**
 * Starts the renewal-reminder worker and schedules the daily repeatable job.
 * Runs every day at 09:00 UTC.
 */
export async function startRenewalReminderWorker(): Promise<void> {
  worker = new Worker(QUEUE_NAME, processReminderJob, {
    connection: { url: env.REDIS_URL },
    concurrency: 1, // Only one run at a time
  })

  worker.on("completed", () => {
    logger.info("Renewal reminder job completed")
  })

  worker.on("failed", (_job, err) => {
    logger.error("Renewal reminder job failed", { error: err.message })
  })

  // Register the daily repeatable job (idempotent — BullMQ deduplicates by key)
  await reminderQueue.upsertJobScheduler(
    "daily-renewal-check",        // stable scheduler key
    { pattern: "0 9 * * *" },     // every day at 09:00 UTC
    { name: "renewal-check", data: {} },
  )

  logger.info("Renewal reminder worker started (daily cron: 09:00 UTC)")
}

export async function stopRenewalReminderWorker(): Promise<void> {
  if (worker) {
    await worker.close()
    worker = null
    logger.info("Renewal reminder worker stopped")
  }
  await reminderQueue.close()
}
