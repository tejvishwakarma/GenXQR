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
  if (redis.status === "connecting") {
    // Wait for the already-in-progress connection to complete
    await new Promise<void>((resolve, reject) => {
      redis.once("ready", resolve)
      redis.once("error", reject)
    })
    return
  }
  await redis.connect()
}
