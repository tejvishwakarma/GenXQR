import rateLimit from "express-rate-limit"
import { RedisStore } from "rate-limit-redis"
import { redis } from "../redis/client.js"

/** Shared RedisStore factory to avoid repeating the sendCommand boilerplate */
function makeRedisStore(prefix: string) {
  return new RedisStore({
    // ioredis call() returns Promise<unknown>; cast to satisfy rate-limit-redis's RedisReply
    sendCommand: (command: string, ...args: string[]) =>
      redis.call(command, ...args) as Promise<number>,
    prefix,
  })
}

/**
 * Static QR generation: 10 requests per minute per IP.
 */
export const staticQRLimiter = rateLimit({
  windowMs: 60 * 1_000,
  max: 10,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  keyGenerator: (req) => req.ip ?? "unknown",
  store: makeRedisStore("rl:static_qr:"),
  handler: (_req, res) => {
    res.status(429).json({
      success: false,
      error: "Too many QR generation requests. Please wait 1 minute and try again.",
    })
  },
})

/**
 * Auth routes: 10 attempts per 15 minutes per IP.
 * Applies to login, register, forgot-password, reset-password.
 */
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1_000,
  max: 10,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  keyGenerator: (req) => req.ip ?? "unknown",
  store: makeRedisStore("rl:auth:"),
  handler: (_req, res) => {
    res.status(429).json({
      success: false,
      error: "Too many authentication attempts. Please try again in 15 minutes.",
    })
  },
})

/**
 * Developer v1 API: 300 requests per minute per API key.
 * Higher ceiling than /api because integrations (Zapier, Make, n8n) poll frequently.
 * Keyed by the authenticated userId when available (req.user.sub), falling back to IP
 * so unauthenticated bots still hit a limit at the edge.
 */
export const v1Limiter = rateLimit({
  windowMs: 60 * 1_000,
  max: 300,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  keyGenerator: (req) => {
    const userId = (req as unknown as { user?: { sub?: string } }).user?.sub
    return userId ? `u:${userId}` : (req.ip ?? "unknown")
  },
  store: makeRedisStore("rl:v1:"),
  handler: (_req, res) => {
    res.status(429).json({
      success: false,
      error: "API rate limit exceeded (300 req/min). Slow down or contact support to raise your cap.",
    })
  },
})

/**
 * General API: 200 requests per minute per IP.
 */
export const apiLimiter = rateLimit({
  windowMs: 60 * 1_000,
  max: 200,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  keyGenerator: (req) => req.ip ?? "unknown",
  store: makeRedisStore("rl:api:"),
  handler: (_req, res) => {
    res.status(429).json({
      success: false,
      error: "Rate limit exceeded. Please slow down.",
    })
  },
})

/**
 * Job application submissions: 5 per hour per IP to prevent spam.
 */
/**
 * Public contact form. Unauthenticated and it sends mail, so it is worth its own
 * budget: a separate Redis prefix from careersApplyLimiter means a burst of job
 * applications cannot lock people out of contacting support, or the reverse.
 */
export const contactLimiter = rateLimit({
  windowMs: 60 * 60 * 1_000,
  max: 5,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  keyGenerator: (req) => req.ip ?? "unknown",
  store: makeRedisStore("rl:contact:"),
  handler: (_req, res) => {
    res.status(429).json({
      success: false,
      error: "Too many messages sent. Please try again later, or email us directly.",
    })
  },
})

export const careersApplyLimiter = rateLimit({
  windowMs: 60 * 60 * 1_000,
  max: 5,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  keyGenerator: (req) => req.ip ?? "unknown",
  store: makeRedisStore("rl:careers_apply:"),
  handler: (_req, res) => {
    res.status(429).json({
      success: false,
      error: "Too many applications submitted. Please try again later.",
    })
  },
})
