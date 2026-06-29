import app from "./app.js"
import { env } from "./config/env.js"
import { logger } from "./logger/index.js"
import { prisma } from "./db/prisma.js"
import { connectRedis } from "./redis/client.js"
import { startScanWorker, stopScanWorker } from "./workers/scan.worker.js"
import { startRenewalReminderWorker, stopRenewalReminderWorker } from "./workers/renewal-reminder.worker.js"
import { startWebhookRetryWorker, stopWebhookRetryWorker } from "./workers/webhook-retry.worker.js"

async function main(): Promise<void> {
  // 1. Connect PostgreSQL
  await prisma.$connect()
  logger.info("PostgreSQL connected")

  // 2. Connect Redis
  await connectRedis()

  // 3. Start workers
  startScanWorker()
  await startRenewalReminderWorker()
  startWebhookRetryWorker()

  // 4. Start HTTP server
  const server = app.listen(env.PORT, () => {
    logger.info(`GenXQR API listening on port ${env.PORT} [${env.NODE_ENV}]`)
  })

  // ─── Graceful shutdown ────────────────────────────────────────────────────
  async function shutdown(signal: string): Promise<void> {
    logger.info(`${signal} received — shutting down gracefully...`)
    await stopScanWorker()
    await stopRenewalReminderWorker()
    await stopWebhookRetryWorker()
    server.close(async () => {
      await prisma.$disconnect()
      logger.info("PostgreSQL disconnected. Goodbye.")
      process.exit(0)
    })
  }

  process.on("SIGTERM", () => void shutdown("SIGTERM"))
  process.on("SIGINT", () => void shutdown("SIGINT"))

  process.on("uncaughtException", (err) => {
    logger.error("Uncaught exception", { error: err.message, stack: err.stack })
    process.exit(1)
  })

  process.on("unhandledRejection", (reason) => {
    logger.error("Unhandled promise rejection", { reason: String(reason) })
    process.exit(1)
  })
}

main().catch((err) => {
  console.error("Fatal error during startup:", err)
  process.exit(1)
})
