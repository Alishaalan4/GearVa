-- CreateEnum
CREATE TYPE "GarageStatus" AS ENUM ('TRIAL', 'ACTIVE', 'EXPIRED', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "StaffRole" AS ENUM ('OWNER', 'MANAGER', 'MECHANIC', 'RECEPTIONIST');

-- CreateEnum
CREATE TYPE "AdminRole" AS ENUM ('SUPER_ADMIN', 'ADMIN');

-- CreateEnum
CREATE TYPE "SubjectType" AS ENUM ('STAFF', 'ADMIN', 'OWNER');

-- CreateEnum
CREATE TYPE "ActorType" AS ENUM ('STAFF', 'ADMIN', 'OWNER', 'SYSTEM');

-- CreateEnum
CREATE TYPE "NotificationChannel" AS ENUM ('EMAIL', 'IN_APP', 'PUSH', 'WHATSAPP');

-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('SERVICE_REMINDER', 'MONTHLY_REMINDER', 'INVOICE', 'OFFER', 'INVITE', 'CAR_READY', 'WARRANTY_END', 'PAYMENT_REMINDER');

-- CreateEnum
CREATE TYPE "NotificationStatus" AS ENUM ('QUEUED', 'SENT', 'DELIVERED', 'FAILED', 'SKIPPED');

-- CreateTable
CREATE TABLE "admin_users" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" "AdminRole" NOT NULL,
    "totp_secret_enc" TEXT,
    "totp_enabled" BOOLEAN NOT NULL DEFAULT false,
    "recovery_codes_hash" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "last_login_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "admin_users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" UUID NOT NULL,
    "subject_type" "SubjectType" NOT NULL,
    "subject_id" UUID NOT NULL,
    "refresh_token_hash" TEXT NOT NULL,
    "user_agent" TEXT,
    "ip" TEXT,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "revoked_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "garages" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "location_text" TEXT NOT NULL,
    "timezone" TEXT NOT NULL DEFAULT 'Asia/Beirut',
    "default_locale" TEXT NOT NULL,
    "status" "GarageStatus" NOT NULL,
    "is_paid" BOOLEAN NOT NULL DEFAULT false,
    "trial_ends_at" TIMESTAMPTZ(3),
    "expires_at" TIMESTAMPTZ(3),
    "suspended_at" TIMESTAMPTZ(3),
    "suspended_reason" TEXT,
    "created_by_admin_id" UUID NOT NULL,
    "last_login_at" TIMESTAMPTZ(3),
    "deleted_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "garages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "garage_settings" (
    "garage_id" UUID NOT NULL,
    "logo_file_id" UUID,
    "brand_color" TEXT NOT NULL DEFAULT '#111827',
    "invoice_number_format" TEXT NOT NULL DEFAULT '{BRANCH}-{YYYY}-{SEQ:4}',
    "terms_text" TEXT,
    "auto_send_invoice" BOOLEAN NOT NULL DEFAULT false,
    "show_lbp" BOOLEAN NOT NULL DEFAULT false,
    "lbp_rate" INTEGER,
    "vat_enabled" BOOLEAN NOT NULL DEFAULT false,
    "vat_rate_percent" DECIMAL(5,2),
    "vat_number" TEXT,
    "payment_reminder_days" INTEGER,
    "reminder_lead_km" INTEGER NOT NULL DEFAULT 500,
    "reminder_lead_days" INTEGER NOT NULL DEFAULT 7,
    "default_daily_km" INTEGER,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "garage_settings_pkey" PRIMARY KEY ("garage_id")
);

-- CreateTable
CREATE TABLE "branches" (
    "id" UUID NOT NULL,
    "garage_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "address" TEXT,
    "phone" TEXT,
    "is_main" BOOLEAN NOT NULL DEFAULT false,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "branches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "garage_id" UUID NOT NULL,
    "branch_id" UUID,
    "email" TEXT NOT NULL,
    "password_hash" TEXT,
    "name" TEXT NOT NULL,
    "role" "StaffRole" NOT NULL,
    "locale" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "invite_token_hash" TEXT,
    "invite_expires_at" TIMESTAMPTZ(3),
    "last_login_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" UUID NOT NULL,
    "garage_id" UUID NOT NULL,
    "owner_id" UUID,
    "user_id" UUID,
    "channel" "NotificationChannel" NOT NULL,
    "type" "NotificationType" NOT NULL,
    "template" TEXT NOT NULL,
    "locale" TEXT NOT NULL,
    "recipient" TEXT,
    "payload" JSONB NOT NULL,
    "status" "NotificationStatus" NOT NULL DEFAULT 'QUEUED',
    "error" TEXT,
    "dedupe_key" TEXT NOT NULL,
    "scheduled_for" TIMESTAMPTZ(3),
    "sent_at" TIMESTAMPTZ(3),
    "delivered_at" TIMESTAMPTZ(3),
    "read_at" TIMESTAMPTZ(3),
    "ref_type" TEXT,
    "ref_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" UUID NOT NULL,
    "garage_id" UUID,
    "actor_type" "ActorType" NOT NULL,
    "actor_id" UUID,
    "action" TEXT NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" UUID,
    "before" JSONB,
    "after" JSONB,
    "ip" TEXT,
    "user_agent" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "admin_users_email_key" ON "admin_users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "sessions_refresh_token_hash_key" ON "sessions"("refresh_token_hash");

-- CreateIndex
CREATE INDEX "sessions_subject_type_subject_id_idx" ON "sessions"("subject_type", "subject_id");

-- CreateIndex
CREATE INDEX "garages_status_expires_at_idx" ON "garages"("status", "expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "branches_garage_id_code_key" ON "branches"("garage_id", "code");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "users_invite_token_hash_key" ON "users"("invite_token_hash");

-- CreateIndex
CREATE INDEX "users_garage_id_role_idx" ON "users"("garage_id", "role");

-- CreateIndex
CREATE INDEX "notifications_garage_id_status_scheduled_for_idx" ON "notifications"("garage_id", "status", "scheduled_for");

-- CreateIndex
CREATE INDEX "notifications_owner_id_read_at_idx" ON "notifications"("owner_id", "read_at");

-- CreateIndex
CREATE UNIQUE INDEX "notifications_garage_id_dedupe_key_key" ON "notifications"("garage_id", "dedupe_key");

-- CreateIndex
CREATE INDEX "audit_logs_garage_id_created_at_idx" ON "audit_logs"("garage_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "audit_logs_entity_type_entity_id_idx" ON "audit_logs"("entity_type", "entity_id");

-- AddForeignKey
ALTER TABLE "garages" ADD CONSTRAINT "garages_created_by_admin_id_fkey" FOREIGN KEY ("created_by_admin_id") REFERENCES "admin_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "garage_settings" ADD CONSTRAINT "garage_settings_garage_id_fkey" FOREIGN KEY ("garage_id") REFERENCES "garages"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "branches" ADD CONSTRAINT "branches_garage_id_fkey" FOREIGN KEY ("garage_id") REFERENCES "garages"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_garage_id_fkey" FOREIGN KEY ("garage_id") REFERENCES "garages"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_garage_id_fkey" FOREIGN KEY ("garage_id") REFERENCES "garages"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_garage_id_fkey" FOREIGN KEY ("garage_id") REFERENCES "garages"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- Hand-written below: Prisma cannot express these (database.md section 10).
-- ---------------------------------------------------------------------------

-- At most one OWNER per garage (section 7).
CREATE UNIQUE INDEX "users_one_owner_per_garage" ON "users"("garage_id") WHERE "role" = 'OWNER';

-- Grants (section 6.1). Platform tables: gearva_platform only.
GRANT SELECT, INSERT, UPDATE, DELETE ON "admin_users", "sessions" TO gearva_platform;
GRANT SELECT, INSERT, UPDATE, DELETE ON "garages", "garage_settings", "branches", "users", "notifications" TO gearva_app, gearva_platform;
-- Append-only.
GRANT SELECT, INSERT ON "audit_logs" TO gearva_app, gearva_platform;

-- RLS (section 6.2), output of `npm run rls:sql -w @gearva/database`.
-- RLS: garages
ALTER TABLE "garages" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "garages" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "garages"
  USING (id = NULLIF(current_setting('app.garage_id', true), '')::uuid)
  WITH CHECK (id = NULLIF(current_setting('app.garage_id', true), '')::uuid);

-- RLS: garage_settings
ALTER TABLE "garage_settings" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "garage_settings" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "garage_settings"
  USING (garage_id = NULLIF(current_setting('app.garage_id', true), '')::uuid)
  WITH CHECK (garage_id = NULLIF(current_setting('app.garage_id', true), '')::uuid);

-- RLS: branches
ALTER TABLE "branches" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "branches" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "branches"
  USING (garage_id = NULLIF(current_setting('app.garage_id', true), '')::uuid)
  WITH CHECK (garage_id = NULLIF(current_setting('app.garage_id', true), '')::uuid);

-- RLS: users
ALTER TABLE "users" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "users" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "users"
  USING (garage_id = NULLIF(current_setting('app.garage_id', true), '')::uuid)
  WITH CHECK (garage_id = NULLIF(current_setting('app.garage_id', true), '')::uuid);

-- RLS: notifications
ALTER TABLE "notifications" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "notifications" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "notifications"
  USING (garage_id = NULLIF(current_setting('app.garage_id', true), '')::uuid)
  WITH CHECK (garage_id = NULLIF(current_setting('app.garage_id', true), '')::uuid);

-- RLS: audit_logs
ALTER TABLE "audit_logs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "audit_logs" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "audit_logs"
  USING (garage_id = NULLIF(current_setting('app.garage_id', true), '')::uuid)
  WITH CHECK (garage_id = NULLIF(current_setting('app.garage_id', true), '')::uuid);
