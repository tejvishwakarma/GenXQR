import { requestContext } from "../utils/request-context.js"
import { isAccountBlocked } from "../services/blocklist.service.js"
import type { Request, Response, NextFunction } from "express"
import { prisma } from "../db/prisma.js"
import { verifyAccessToken } from "../utils/jwt.js"
import { AppError } from "./error.middleware.js"

/**
 * Protects a route by requiring a valid Bearer access token.
 * Sets req.user on success; passes an AppError(401) to next() on failure.
 */
export async function requireAuth(req: Request, _res: Response, next: NextFunction): Promise<void> {
  try {
    const authHeader = req.headers.authorization
    if (!authHeader?.startsWith("Bearer ")) {
      throw new AppError(401, "Missing or malformed Authorization header")
    }

    const token = authHeader.slice(7)
    const payload = verifyAccessToken(token)
    const user = await prisma.user.findUnique({
      where: { id: payload.sub },
      select: { id: true, email: true }
    })

    if (!user) {
      throw new AppError(401, "Account no longer exists")
    }
    // Takes effect on the next request, not when the 15-minute token expires.
    if (await isAccountBlocked(user.id, user.email)) {
      throw new AppError(403, "This account has been suspended. Contact support@genxqr.com.")
    }

    req.user = payload
    // An impersonation session: everything this request writes to the audit
    // log names the admin as well (db/prisma.ts).
    if (payload.act) requestContext.run({ impersonatedBy: payload.act }, next)
    else next()
  } catch (err) {
    if (err instanceof AppError) {
      next(err)
    } else {
      next(new AppError(401, "Invalid or expired access token"))
    }
  }
}
