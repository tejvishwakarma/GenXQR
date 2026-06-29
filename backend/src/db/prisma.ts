import { PrismaClient } from "@prisma/client"

declare global {
  // eslint-disable-next-line no-var
  var __prisma: PrismaClient | undefined
}

/**
 * Singleton Prisma client.
 * uses globalThis in dev to survive hot-reloads without exhausting connections.
 */
export const prisma: PrismaClient =
  globalThis.__prisma ??
  new PrismaClient({
    log:
      process.env.NODE_ENV === "production"
        ? ["error"]
        : ["warn", "error"],
  })

if (process.env.NODE_ENV !== "production") {
  globalThis.__prisma = prisma
}
