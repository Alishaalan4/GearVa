-- Phase 4 (flow.md 9, database.md 4.2-4.3): the customer's contact email for reminders,
-- kept per garage, and the monthly reminder setting (off by default).

-- AlterTable
ALTER TABLE "garage_customers" ADD COLUMN "email" TEXT;

-- AlterTable
ALTER TABLE "garage_settings" ADD COLUMN "monthly_reminder_enabled" BOOLEAN NOT NULL DEFAULT false;
