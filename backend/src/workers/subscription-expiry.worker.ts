import { Queue, Worker, Job } from "bullmq"
import { env } from "../config/env.js"
import { logger } from "../logger/index.js"
import { enforceSubscriptionExpiry } from "../services/subscription-expiry.service.js"

const QUEUE_NAME = "subscription-expiry"

/**
 * Every 10 minutes. There is no grace period, so a lapsed account's codes should
 * pause close to the moment it lapses even if the owner never signs in (signing
 * in expires it immediately anyway — see getUserPlanLimits).
 *
 * A BullMQ job scheduler rather than setInterval: PM2 runs one process per CPU,
 * and the scheduler guarantees each run executes once, not once per process.
 */
const EVERY_MS = 10 * 60 * 1000

const expiryQueue = new Queue(QUEUE_NAME, {
  connection: { url: env.REDIS_URL },
  defaultJobOptions: {
    removeOnComplete: 10,
    removeOnFail: 20,
    attempts: 2,
    backoff: { type: "exponential", delay: 30_000 },
  },
})

let worker: Worker | null = null

async function processExpiryJob(_job: Job): Promise<void> {
  await enforceSubscriptionExpiry()
}

export async function startSubscriptionExpiryWorker(): Promise<void> {
  worker = new Worker(QUEUE_NAME, processExpiryJob, {
    connection: { url: env.REDIS_URL },
    concurrency: 1,
  })

  worker.on("failed", (_job, err) => {
    logger.error("Subscription expiry job failed", { error: err.message })
  })

  await expiryQueue.upsertJobScheduler(
    "subscription-expiry-sweep",
    { every: EVERY_MS },
    { name: "expiry-sweep", data: {} },
  )

  logger.info("Subscription expiry worker started (every 10 minutes)")
}

export async function stopSubscriptionExpiryWorker(): Promise<void> {
  if (worker) {
    await worker.close()
    worker = null
  }
  await expiryQueue.close()
}
