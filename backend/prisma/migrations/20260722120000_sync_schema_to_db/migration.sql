-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('SYSTEM', 'FEATURE', 'BILLING', 'LIMIT', 'TEAM');

-- CreateEnum
CREATE TYPE "JobStatus" AS ENUM ('OPEN', 'PAUSED', 'FILLED', 'CLOSED');

-- CreateEnum
CREATE TYPE "ApplicationStatus" AS ENUM ('NEW', 'REVIEWING', 'SHORTLISTED', 'REJECTED', 'HIRED');

-- DropIndex
DROP INDEX "invoices_razorpayOrderId_key";

-- DropIndex
DROP INDEX "subscriptions_razorpaySubId_key";

-- AlterTable
ALTER TABLE "audit_logs" ADD COLUMN     "category" TEXT NOT NULL DEFAULT 'system',
ADD COLUMN     "userAgent" TEXT;

-- AlterTable
ALTER TABLE "blocklist" ADD COLUMN     "blockCount" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "isPermanent" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "invoices" DROP COLUMN "razorpayOrderId",
DROP COLUMN "razorpayPaymentId",
ADD COLUMN     "payuPaymentId" TEXT,
ADD COLUMN     "payuTxnId" TEXT;

-- AlterTable
ALTER TABLE "plans" DROP COLUMN "razorpayPlanId";

-- AlterTable
ALTER TABLE "subscriptions" DROP COLUMN "razorpayCustomerId",
DROP COLUMN "razorpaySubId";

-- CreateTable
CREATE TABLE "limit_alerts" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "limitType" TEXT NOT NULL,
    "threshold" INTEGER NOT NULL,
    "periodKey" TEXT NOT NULL,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "limit_alerts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "renewal_reminders" (
    "id" TEXT NOT NULL,
    "subscriptionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "reminderType" TEXT NOT NULL,
    "periodKey" TEXT NOT NULL,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" TEXT NOT NULL,
    "error" TEXT,

    CONSTRAINT "renewal_reminders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "job_postings" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "department" TEXT,
    "location" TEXT,
    "type" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "status" "JobStatus" NOT NULL DEFAULT 'OPEN',
    "postedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "job_postings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "NotificationType" NOT NULL DEFAULT 'SYSTEM',
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "actionUrl" TEXT,
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "job_applications" (
    "id" TEXT NOT NULL,
    "jobId" TEXT,
    "jobTitle" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "linkedin" TEXT,
    "experience" TEXT,
    "coverLetter" TEXT NOT NULL,
    "cvFilename" TEXT NOT NULL,
    "status" "ApplicationStatus" NOT NULL DEFAULT 'NEW',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "cvMimeType" TEXT,
    "cvPath" TEXT,

    CONSTRAINT "job_applications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "limit_alerts_userId_idx" ON "limit_alerts"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "limit_alerts_userId_limitType_threshold_periodKey_key" ON "limit_alerts"("userId", "limitType", "threshold", "periodKey");

-- CreateIndex
CREATE INDEX "renewal_reminders_subscriptionId_idx" ON "renewal_reminders"("subscriptionId");

-- CreateIndex
CREATE INDEX "renewal_reminders_userId_idx" ON "renewal_reminders"("userId");

-- CreateIndex
CREATE INDEX "renewal_reminders_sentAt_idx" ON "renewal_reminders"("sentAt");

-- CreateIndex
CREATE UNIQUE INDEX "renewal_reminders_subscriptionId_reminderType_periodKey_key" ON "renewal_reminders"("subscriptionId", "reminderType", "periodKey");

-- CreateIndex
CREATE INDEX "job_postings_status_idx" ON "job_postings"("status");

-- CreateIndex
CREATE INDEX "job_postings_postedAt_idx" ON "job_postings"("postedAt");

-- CreateIndex
CREATE INDEX "notifications_userId_isRead_idx" ON "notifications"("userId", "isRead");

-- CreateIndex
CREATE INDEX "notifications_userId_createdAt_idx" ON "notifications"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "job_applications_status_idx" ON "job_applications"("status");

-- CreateIndex
CREATE INDEX "job_applications_jobId_idx" ON "job_applications"("jobId");

-- CreateIndex
CREATE INDEX "job_applications_createdAt_idx" ON "job_applications"("createdAt");

-- CreateIndex
CREATE INDEX "audit_logs_category_createdAt_idx" ON "audit_logs"("category", "createdAt");

-- CreateIndex
CREATE INDEX "audit_logs_action_createdAt_idx" ON "audit_logs"("action", "createdAt");

-- CreateIndex
CREATE INDEX "audit_logs_createdAt_idx" ON "audit_logs"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "invoices_payuTxnId_key" ON "invoices"("payuTxnId");

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_applications" ADD CONSTRAINT "job_applications_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "job_postings"("id") ON DELETE SET NULL ON UPDATE CASCADE;

