// verify-email.mjs — run from backend/ dir
// Usage: node --env-file=.env verify-email.mjs <email>
import pkg from './node_modules/@prisma/client/index.js'
const { PrismaClient } = pkg

const email = process.argv[2]
if (!email) { console.error('Missing email argument'); process.exit(1) }

const p = new PrismaClient()
try {
  const u = await p.user.update({
    where: { email },
    data: { emailVerified: true },
    select: { email: true, emailVerified: true }
  })
  console.log('OK:', JSON.stringify(u))
} catch (e) {
  console.error('ERR:', e.message)
  process.exit(1)
} finally {
  await p.$disconnect()
}
