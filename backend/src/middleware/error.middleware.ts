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
