// Quick helper: mark a user's email as verified (dev/test only)
// Usage: node --env-file=backend/.env tests/verify-test-user.mjs <email>
// Note: runs in CJS compat mode by importing Prisma as default

const { default: pkg } = await import("@prisma/client")
const { PrismaClient } = pkg

const email = process.argv[2]
if (!email) { console.error("Usage: node tests/verify-test-user.mjs <email>"); process.exit(1) }

const prisma = new PrismaClient()
try {
  const updated = await prisma.user.update({
    where: { email },
    data: { isEmailVerified: true },
    select: { id: true, email: true, isEmailVerified: true }
  })
  console.log("Verified:", JSON.stringify(updated))
} catch (e) {
  console.error("Error:", e.message)
  process.exit(1)
} finally {
  await prisma.$disconnect()
}
