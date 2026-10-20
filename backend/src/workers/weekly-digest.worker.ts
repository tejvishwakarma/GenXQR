import { Queue, Worker, Job } from "bullmq"
import { env } from "../config/env.js"
import { logger } from "../logger/index.js"
import { sendWeeklyDigests } from "../services/engagement-email.service.js"

const QUEUE_NAME = "weekly-digest"

/**
 * Monday 9:00 am IST (decided 18 Oct 2026). A BullMQ job scheduler, so PM2's
 * multiple processes still produce one run; the LimitAlert dedupe row guards
 * against a retried run emailing anyone twice.
 */
const digestQueue = new Queue(QUEUE_NAME, {
  connection: { url: env.REDIS_URL },
  defaultJobOptions: {
    removeOnComplete: 10,
    removeOnFail: 20,
    attempts: 2,
    backoff: { type: "exponential", delay: 5 * 60_000 },
  },
})

let worker: Worker | null = null

async function processDigestJob(_job: Job): Promise<void> {
  await sendWeeklyDigests()
}

export async function startWeeklyDigestWorker(): Promise<void> {
  worker = new Worker(QUEUE_NAME, processDigestJob, {
    connection: { url: env.REDIS_URL },
    concurrency: 1,
  })
  worker.on("failed", (_job, err) => {
    logger.error("Weekly digest job failed", { error: err.message })
  })

  await digestQueue.upsertJobScheduler(
    "weekly-digest-monday",
    { pattern: "0 9 * * 1", tz: "Asia/Kolkata" },
    { name: "weekly-digest", data: {} },
  )
  logger.info("Weekly digest worker started (Mondays 09:00 IST)")
}

export async function stopWeeklyDigestWorker(): Promise<void> {
  if (worker) {
    await worker.close()
    worker = null
  }
  await digestQueue.close()
}
