import type { Request, Response, NextFunction } from "express"
import { prisma } from "../db/prisma.js"
import { verifyAccessToken } from "../utils/jwt.js"
import { AppError } from "./error.middleware.js"

/**
 * Middleware that:
 *  1. Verifies the Bearer access token (same as requireAuth).
 *  2. Confirms the token carries an ADMIN or SUPER_ADMIN role.
 *
 * Mount this on every /admin-api/* route.
 */
export async function requireAdmin(req: Request, _res: Response, next: NextFunction): Promise<void> {
  try {
    const authHeader = req.headers.authorization
    if (!authHeader?.startsWith("Bearer ")) {
      throw new AppError(401, "Missing or malformed Authorization header")
    }

    const payload = verifyAccessToken(authHeader.slice(7))

    const user = await prisma.user.findUnique({
      where: { id: payload.sub },
      select: { id: true, role: true }
    })

    if (!user) {
      throw new AppError(401, "Account no longer exists")
    }

    if (user.role !== "ADMIN" && user.role !== "SUPER_ADMIN") {
      throw new AppError(403, "Admin access required")
    }

    req.user = { ...payload, role: user.role }
    next()
  } catch (err) {
    if (err instanceof AppError) {
      next(err)
    } else {
      next(new AppError(401, "Invalid or expired access token"))
    }
  }
}
