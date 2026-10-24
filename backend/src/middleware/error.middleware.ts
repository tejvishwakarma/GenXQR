import { MulterError } from "multer"
import type { Request, Response, NextFunction } from "express"
import { ZodError } from "zod"
import { logger } from "../logger/index.js"

/**
 * Typed application error with an HTTP status code.
 * Use this for all expected/operational errors (validation failures, not found, etc.).
 */
export class AppError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
    public readonly isOperational = true,
  ) {
    super(message)
    this.name = "AppError"
    Error.captureStackTrace(this, this.constructor)
  }
}

/**
 * Express global error handler. Must be the last middleware registered.
 */
export function errorHandler(
  err: unknown,
  req: Request,
  res: Response,
  // Required 4-param signature for Express error handlers
  _next: NextFunction,
): void {
  // Zod validation errors → 422 Unprocessable Entity
  if (err instanceof ZodError) {
    res.status(422).json({
      success: false,
      error: "Validation failed",
      details: err.flatten().fieldErrors,
    })
    return
  }

  // Known operational errors → expose the message
  if (err instanceof AppError && err.isOperational) {
    res.status(err.statusCode).json({
      success: false,
      error: err.message,
    })
    return
  }

  // Client errors raised by middleware that does not use AppError: body-parser
  // (malformed JSON 400, body too large 413) and multer (file too large, too
  // many files…). They are the request's fault, not ours, so they get their own
  // 4xx — not a 500 that is also logged as a server error.
  if (err instanceof MulterError) {
    res.status(err.code === "LIMIT_FILE_SIZE" ? 413 : 400).json({ success: false, error: err.message })
    return
  }
  const status = (err as { status?: unknown; statusCode?: unknown } | null)?.status ?? (err as { statusCode?: unknown } | null)?.statusCode
  if (typeof status === "number" && status >= 400 && status < 500 && (err as { expose?: unknown }).expose !== false) {
    res.status(status).json({ success: false, error: status === 413 ? "Request too large" : "Invalid request" })
    return
  }

  // Unknown / programmer errors — log full details, return generic 500
  logger.error("Unhandled error", {
    error: err instanceof Error ? err.message : String(err),
    stack: err instanceof Error ? err.stack : undefined,
    path: req.path,
    method: req.method,
  })

  res.status(500).json({
    success: false,
    error: "An unexpected error occurred",
  })
}
