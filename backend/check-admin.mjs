import { PrismaClient } from "@prisma/client"
import bcrypt from "bcryptjs"

const prisma = new PrismaClient()

async function main() {
  const email = "admin@genxqr.dev"
  const user = await prisma.user.findUnique({ where: { email } })
  console.log("User:", user ? "Found" : "Not Found")
  if (user) {
    console.log("Email Verified:", user.emailVerified)
    console.log("Has Password Hash:", !!user.passwordHash)
    if (user.passwordHash) {
      const match = await bcrypt.compare("Admin@GenXQR2025!", user.passwordHash)
      console.log("Password Match:", match)
    }
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
