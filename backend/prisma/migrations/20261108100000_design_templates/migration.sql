-- Saved QR designs ("brand templates"), per workspace owner.
CREATE TABLE "design_templates" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "design" JSONB NOT NULL,
    "logoUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "design_templates_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "design_templates_userId_name_key" ON "design_templates"("userId", "name");
ALTER TABLE "design_templates" ADD CONSTRAINT "design_templates_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
