import { Redis } from "ioredis"
import { env } from "../config/env.js"
import { logger } from "../logger/index.js"

export const redis = new Redis(env.REDIS_URL, {
  maxRetriesPerRequest: 3,
  enableReadyCheck: true,
  lazyConnect: true,
  retryStrategy: (times) => {
    // Retry indefinitely with a capped backoff. Returning null here would stop
    // reconnection for the entire process lifetime, so a brief Redis blip would
    // permanently break rate limiting and the scan queue until a manual restart.
    if (times % 10 === 0) {
      logger.warn(`Redis: reconnect still failing after ${times} attempts`)
    }
    return Math.min(times * 200, 2000)
  },
})

redis.on("connect", () => logger.info("Redis connecting..."))
redis.on("ready", () => logger.info("Redis ready"))
redis.on("error", (err: Error) => logger.error("Redis error", { error: err.message }))
redis.on("close", () => logger.warn("Redis connection closed"))
redis.on("reconnecting", () => logger.info("Redis reconnecting..."))

export async function connectRedis(): Promise<void> {
  // ioredis may have already auto-connected when the rate-limiter issued its first command
  if (redis.status === "ready") return
  // Only a client that has never connected ("wait") or was closed ("end")
  // needs connect(). Every other status — "connecting", "connect" (socket open,
  // ready check pending) or "reconnecting" — means a connection is already under
  // way, and calling connect() then throws "Redis is already
  // connecting/connected", crashing startup depending on timing.
  if (redis.status !== "wait" && redis.status !== "end") {
    // Wait for the already-in-progress connection to complete
    await new Promise<void>((resolve, reject) => {
      redis.once("ready", resolve)
      redis.once("error", reject)
    })
    return
  }
  await redis.connect()
}
