-- Phase 5 (database.md 4.1, flow.md 11): subscription payments, admin access logs, system
-- settings and garage applications. Platform tables: only gearva_platform gets rights.

-- CreateEnum
CREATE TYPE "ApplicationStatus" AS ENUM ('NEW', 'APPROVED', 'REJECTED');

-- CreateTable
CREATE TABLE "subscription_payments" (
    "id" UUID NOT NULL,
    "garage_id" UUID NOT NULL,
    "amount_cents" INTEGER NOT NULL,
    "method" "PaymentMethod" NOT NULL,
    "paid_at" TIMESTAMPTZ(3) NOT NULL,
    "period_start" DATE NOT NULL,
    "new_expiry_date" DATE NOT NULL,
    "extra_branches" INTEGER NOT NULL DEFAULT 0,
    "recorded_by_id" UUID NOT NULL,
    "note" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "subscription_payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "admin_access_logs" (
    "id" UUID NOT NULL,
    "admin_id" UUID NOT NULL,
    "garage_id" UUID NOT NULL,
    "action" TEXT NOT NULL,
    "path" TEXT,
    "ip" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "admin_access_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "system_settings" (
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "updated_by_id" UUID,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "system_settings_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "garage_applications" (
    "id" UUID NOT NULL,
    "garage_name" TEXT NOT NULL,
    "owner_name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "branch_count" INTEGER NOT NULL,
    "message" TEXT,
    "status" "ApplicationStatus" NOT NULL DEFAULT 'NEW',
    "reviewed_by_id" UUID,
    "reviewed_at" TIMESTAMPTZ(3),
    "reject_reason" TEXT,
    "garage_id" UUID,
    "ip" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "garage_applications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "subscription_payments_garage_id_paid_at_idx" ON "subscription_payments"("garage_id", "paid_at" DESC);

-- CreateIndex
CREATE INDEX "subscription_payments_paid_at_idx" ON "subscription_payments"("paid_at");

-- CreateIndex
CREATE INDEX "admin_access_logs_garage_id_created_at_idx" ON "admin_access_logs"("garage_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "admin_access_logs_admin_id_created_at_idx" ON "admin_access_logs"("admin_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "garage_applications_status_created_at_idx" ON "garage_applications"("status", "created_at" DESC);

-- CreateIndex
CREATE INDEX "garage_applications_email_idx" ON "garage_applications"("email");

-- CreateIndex
CREATE INDEX "garage_applications_phone_idx" ON "garage_applications"("phone");

-- AddForeignKey
ALTER TABLE "subscription_payments" ADD CONSTRAINT "subscription_payments_garage_id_fkey" FOREIGN KEY ("garage_id") REFERENCES "garages"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscription_payments" ADD CONSTRAINT "subscription_payments_recorded_by_id_fkey" FOREIGN KEY ("recorded_by_id") REFERENCES "admin_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admin_access_logs" ADD CONSTRAINT "admin_access_logs_admin_id_fkey" FOREIGN KEY ("admin_id") REFERENCES "admin_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admin_access_logs" ADD CONSTRAINT "admin_access_logs_garage_id_fkey" FOREIGN KEY ("garage_id") REFERENCES "garages"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "system_settings" ADD CONSTRAINT "system_settings_updated_by_id_fkey" FOREIGN KEY ("updated_by_id") REFERENCES "admin_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "garage_applications" ADD CONSTRAINT "garage_applications_reviewed_by_id_fkey" FOREIGN KEY ("reviewed_by_id") REFERENCES "admin_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "garage_applications" ADD CONSTRAINT "garage_applications_garage_id_fkey" FOREIGN KEY ("garage_id") REFERENCES "garages"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Hand-written: checks (database.md 1: money in cents, never negative)
ALTER TABLE "subscription_payments"
  ADD CONSTRAINT "subscription_payments_amount_check" CHECK ("amount_cents" > 0),
  ADD CONSTRAINT "subscription_payments_extra_branches_check" CHECK ("extra_branches" >= 0),
  ADD CONSTRAINT "subscription_payments_period_check" CHECK ("new_expiry_date" >= "period_start");
ALTER TABLE "garage_applications"
  ADD CONSTRAINT "garage_applications_branch_count_check" CHECK ("branch_count" BETWEEN 1 AND 50),
  -- an approved application points at its garage; a rejected one says why
  ADD CONSTRAINT "garage_applications_approved_check" CHECK ("status" <> 'APPROVED' OR "garage_id" IS NOT NULL),
  ADD CONSTRAINT "garage_applications_rejected_check" CHECK ("status" <> 'REJECTED' OR "reject_reason" IS NOT NULL);

-- Grants (database.md 6.1). Payments and access logs are append-only; settings are never
-- deleted. gearva_app may read the settings (global configuration, like default service
-- types) and nothing else here.
GRANT SELECT, INSERT ON "subscription_payments", "admin_access_logs" TO gearva_platform;
GRANT SELECT, INSERT, UPDATE ON "system_settings", "garage_applications" TO gearva_platform;
GRANT SELECT ON "system_settings" TO gearva_app;

-- RLS: the tables with a garage_id get the tenant policy too (a second guard; gearva_app
-- has no grant on them). npm run rls:sql -w @gearva/database -- <table>
-- RLS: subscription_payments
ALTER TABLE "subscription_payments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "subscription_payments" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "subscription_payments"
  USING (garage_id = NULLIF(current_setting('app.garage_id', true), '')::uuid)
  WITH CHECK (garage_id = NULLIF(current_setting('app.garage_id', true), '')::uuid);

-- RLS: admin_access_logs
ALTER TABLE "admin_access_logs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "admin_access_logs" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "admin_access_logs"
  USING (garage_id = NULLIF(current_setting('app.garage_id', true), '')::uuid)
  WITH CHECK (garage_id = NULLIF(current_setting('app.garage_id', true), '')::uuid);

-- RLS: garage_applications
ALTER TABLE "garage_applications" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "garage_applications" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "garage_applications"
  USING (garage_id = NULLIF(current_setting('app.garage_id', true), '')::uuid)
  WITH CHECK (garage_id = NULLIF(current_setting('app.garage_id', true), '')::uuid);

