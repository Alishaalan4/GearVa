-- CreateEnum
CREATE TYPE "DistanceUnit" AS ENUM ('KM', 'MI');

-- CreateEnum
CREATE TYPE "VisitStatus" AS ENUM ('IN_PROGRESS', 'WAITING_FOR_PARTS', 'DONE');

-- CreateEnum
CREATE TYPE "ReminderKind" AS ENUM ('SERVICE_DUE', 'WARRANTY_END', 'RECOMMENDED_NEXT');

-- CreateEnum
CREATE TYPE "ReminderStatus" AS ENUM ('ACTIVE', 'SENT', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "SuggestionField" AS ENUM ('OIL_BRAND', 'OIL_GRADE', 'FILTER_BRAND', 'BATTERY_BRAND', 'TIRE_BRAND', 'BRAKE_PAD_BRAND', 'SERVICE_NAME', 'VEHICLE_MAKE', 'VEHICLE_MODEL');

-- CreateTable
CREATE TABLE "owners" (
    "id" UUID NOT NULL,
    "phone" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "locale" TEXT NOT NULL,
    "last_login_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "owners_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "garage_customers" (
    "id" UUID NOT NULL,
    "garage_id" UUID NOT NULL,
    "owner_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "notes" TEXT,
    "invite_sent_at" TIMESTAMPTZ(3),
    "reminders_opt_out" BOOLEAN NOT NULL DEFAULT false,
    "marketing_opt_out" BOOLEAN NOT NULL DEFAULT false,
    "deleted_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "garage_customers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vehicles" (
    "id" UUID NOT NULL,
    "garage_id" UUID NOT NULL,
    "garage_customer_id" UUID NOT NULL,
    "owner_id" UUID NOT NULL,
    "plate" TEXT NOT NULL,
    "plate_normalized" TEXT NOT NULL,
    "make" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "year" INTEGER,
    "distance_unit" "DistanceUnit" NOT NULL DEFAULT 'KM',
    "current_km" INTEGER NOT NULL,
    "last_odometer_at" TIMESTAMPTZ(3),
    "avg_daily_km" DECIMAL(7,2),
    "notes" TEXT,
    "deleted_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "vehicles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "service_types" (
    "id" UUID NOT NULL,
    "garage_id" UUID,
    "code" TEXT NOT NULL,
    "name_ar" TEXT NOT NULL,
    "name_en" TEXT NOT NULL,
    "default_interval_km" INTEGER,
    "default_interval_mi" INTEGER,
    "default_interval_months" INTEGER,
    "detail_key" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "service_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "suggestions" (
    "id" UUID NOT NULL,
    "garage_id" UUID NOT NULL,
    "field" "SuggestionField" NOT NULL,
    "value" TEXT NOT NULL,
    "value_normalized" TEXT NOT NULL,
    "use_count" INTEGER NOT NULL DEFAULT 1,
    "last_used_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "suggestions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "visits" (
    "id" UUID NOT NULL,
    "garage_id" UUID NOT NULL,
    "branch_id" UUID NOT NULL,
    "vehicle_id" UUID NOT NULL,
    "garage_customer_id" UUID NOT NULL,
    "owner_id" UUID NOT NULL,
    "mechanic_id" UUID NOT NULL,
    "status" "VisitStatus" NOT NULL DEFAULT 'IN_PROGRESS',
    "odometer_km" INTEGER NOT NULL,
    "opened_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finished_at" TIMESTAMPTZ(3),
    "notes" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "visits_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "service_records" (
    "id" UUID NOT NULL,
    "garage_id" UUID NOT NULL,
    "branch_id" UUID NOT NULL,
    "visit_id" UUID NOT NULL,
    "vehicle_id" UUID NOT NULL,
    "owner_id" UUID NOT NULL,
    "service_type_id" UUID NOT NULL,
    "custom_name" TEXT,
    "performed_at" TIMESTAMPTZ(3) NOT NULL,
    "odometer_km" INTEGER NOT NULL,
    "quantity" DECIMAL(8,2) NOT NULL DEFAULT 1,
    "unit_price_cents" INTEGER NOT NULL,
    "total_cents" INTEGER NOT NULL,
    "labor_cents" INTEGER,
    "parts_cents" INTEGER,
    "mechanic_id" UUID NOT NULL,
    "notes" TEXT,
    "details" JSONB NOT NULL DEFAULT '{}',
    "warranty_until" DATE,
    "recommended_note" TEXT,
    "recommended_after_months" INTEGER,
    "next_due_km" INTEGER,
    "next_due_date" DATE,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "service_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reminders" (
    "id" UUID NOT NULL,
    "garage_id" UUID NOT NULL,
    "vehicle_id" UUID NOT NULL,
    "owner_id" UUID NOT NULL,
    "service_type_id" UUID,
    "source_record_id" UUID NOT NULL,
    "kind" "ReminderKind" NOT NULL,
    "next_due_km" INTEGER,
    "next_due_date" DATE,
    "status" "ReminderStatus" NOT NULL DEFAULT 'ACTIVE',
    "notify_count" INTEGER NOT NULL DEFAULT 0,
    "last_notified_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "reminders_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "owners_phone_key" ON "owners"("phone");

-- CreateIndex
CREATE INDEX "garage_customers_garage_id_deleted_at_idx" ON "garage_customers"("garage_id", "deleted_at");

-- CreateIndex
CREATE UNIQUE INDEX "garage_customers_garage_id_owner_id_key" ON "garage_customers"("garage_id", "owner_id");

-- CreateIndex
CREATE UNIQUE INDEX "garage_customers_garage_id_id_key" ON "garage_customers"("garage_id", "id");

-- CreateIndex
CREATE INDEX "vehicles_garage_id_garage_customer_id_idx" ON "vehicles"("garage_id", "garage_customer_id");

-- CreateIndex
CREATE INDEX "vehicles_owner_id_idx" ON "vehicles"("owner_id");

-- CreateIndex
CREATE UNIQUE INDEX "vehicles_garage_id_id_key" ON "vehicles"("garage_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "suggestions_garage_id_field_value_normalized_key" ON "suggestions"("garage_id", "field", "value_normalized");

-- CreateIndex
CREATE INDEX "visits_garage_id_branch_id_opened_at_idx" ON "visits"("garage_id", "branch_id", "opened_at" DESC);

-- CreateIndex
CREATE INDEX "visits_vehicle_id_opened_at_idx" ON "visits"("vehicle_id", "opened_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "visits_garage_id_id_key" ON "visits"("garage_id", "id");

-- CreateIndex
CREATE INDEX "service_records_vehicle_id_service_type_id_performed_at_idx" ON "service_records"("vehicle_id", "service_type_id", "performed_at" DESC);

-- CreateIndex
CREATE INDEX "service_records_garage_id_performed_at_idx" ON "service_records"("garage_id", "performed_at" DESC);

-- CreateIndex
CREATE INDEX "service_records_visit_id_idx" ON "service_records"("visit_id");

-- CreateIndex
CREATE UNIQUE INDEX "service_records_garage_id_id_key" ON "service_records"("garage_id", "id");

-- CreateIndex
CREATE INDEX "reminders_garage_id_status_next_due_date_idx" ON "reminders"("garage_id", "status", "next_due_date");

-- CreateIndex
CREATE INDEX "reminders_vehicle_id_service_type_id_status_idx" ON "reminders"("vehicle_id", "service_type_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "branches_garage_id_id_key" ON "branches"("garage_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "users_garage_id_id_key" ON "users"("garage_id", "id");

-- AddForeignKey
ALTER TABLE "garage_customers" ADD CONSTRAINT "garage_customers_garage_id_fkey" FOREIGN KEY ("garage_id") REFERENCES "garages"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "garage_customers" ADD CONSTRAINT "garage_customers_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "owners"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicles" ADD CONSTRAINT "vehicles_garage_id_fkey" FOREIGN KEY ("garage_id") REFERENCES "garages"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicles" ADD CONSTRAINT "vehicles_garage_id_garage_customer_id_fkey" FOREIGN KEY ("garage_id", "garage_customer_id") REFERENCES "garage_customers"("garage_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicles" ADD CONSTRAINT "vehicles_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "owners"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_types" ADD CONSTRAINT "service_types_garage_id_fkey" FOREIGN KEY ("garage_id") REFERENCES "garages"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "suggestions" ADD CONSTRAINT "suggestions_garage_id_fkey" FOREIGN KEY ("garage_id") REFERENCES "garages"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "visits" ADD CONSTRAINT "visits_garage_id_fkey" FOREIGN KEY ("garage_id") REFERENCES "garages"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "visits" ADD CONSTRAINT "visits_garage_id_branch_id_fkey" FOREIGN KEY ("garage_id", "branch_id") REFERENCES "branches"("garage_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "visits" ADD CONSTRAINT "visits_garage_id_vehicle_id_fkey" FOREIGN KEY ("garage_id", "vehicle_id") REFERENCES "vehicles"("garage_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "visits" ADD CONSTRAINT "visits_garage_id_garage_customer_id_fkey" FOREIGN KEY ("garage_id", "garage_customer_id") REFERENCES "garage_customers"("garage_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "visits" ADD CONSTRAINT "visits_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "owners"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "visits" ADD CONSTRAINT "visits_garage_id_mechanic_id_fkey" FOREIGN KEY ("garage_id", "mechanic_id") REFERENCES "users"("garage_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_records" ADD CONSTRAINT "service_records_garage_id_fkey" FOREIGN KEY ("garage_id") REFERENCES "garages"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_records" ADD CONSTRAINT "service_records_garage_id_branch_id_fkey" FOREIGN KEY ("garage_id", "branch_id") REFERENCES "branches"("garage_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_records" ADD CONSTRAINT "service_records_garage_id_visit_id_fkey" FOREIGN KEY ("garage_id", "visit_id") REFERENCES "visits"("garage_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_records" ADD CONSTRAINT "service_records_garage_id_vehicle_id_fkey" FOREIGN KEY ("garage_id", "vehicle_id") REFERENCES "vehicles"("garage_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_records" ADD CONSTRAINT "service_records_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "owners"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_records" ADD CONSTRAINT "service_records_service_type_id_fkey" FOREIGN KEY ("service_type_id") REFERENCES "service_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_records" ADD CONSTRAINT "service_records_garage_id_mechanic_id_fkey" FOREIGN KEY ("garage_id", "mechanic_id") REFERENCES "users"("garage_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reminders" ADD CONSTRAINT "reminders_garage_id_fkey" FOREIGN KEY ("garage_id") REFERENCES "garages"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reminders" ADD CONSTRAINT "reminders_garage_id_vehicle_id_fkey" FOREIGN KEY ("garage_id", "vehicle_id") REFERENCES "vehicles"("garage_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reminders" ADD CONSTRAINT "reminders_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "owners"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reminders" ADD CONSTRAINT "reminders_service_type_id_fkey" FOREIGN KEY ("service_type_id") REFERENCES "service_types"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reminders" ADD CONSTRAINT "reminders_garage_id_source_record_id_fkey" FOREIGN KEY ("garage_id", "source_record_id") REFERENCES "service_records"("garage_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "owners"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- ---------------------------------------------------------------------------
-- Hand-written below: Prisma cannot express these (database.md section 10).
-- ---------------------------------------------------------------------------

-- Partial unique indexes (section 7).
-- A plate is unique per garage among cars that are not deleted.
CREATE UNIQUE INDEX "vehicles_garage_id_plate_normalized_key" ON "vehicles"("garage_id", "plate_normalized") WHERE "deleted_at" IS NULL;
-- A service type code is unique among global defaults, and per garage among overrides.
CREATE UNIQUE INDEX "service_types_global_code_key" ON "service_types"("code") WHERE "garage_id" IS NULL;
CREATE UNIQUE INDEX "service_types_garage_id_code_key" ON "service_types"("garage_id", "code") WHERE "garage_id" IS NOT NULL;

-- CHECK constraints (section 7). Distances in km and money in cents are never negative.
ALTER TABLE "vehicles" ADD CONSTRAINT "vehicles_current_km_check" CHECK ("current_km" >= 0);
ALTER TABLE "vehicles" ADD CONSTRAINT "vehicles_avg_daily_km_check" CHECK ("avg_daily_km" IS NULL OR "avg_daily_km" >= 0);
ALTER TABLE "visits" ADD CONSTRAINT "visits_odometer_km_check" CHECK ("odometer_km" >= 0);
ALTER TABLE "service_records" ADD CONSTRAINT "service_records_odometer_km_check" CHECK ("odometer_km" >= 0);
ALTER TABLE "service_records" ADD CONSTRAINT "service_records_quantity_check" CHECK ("quantity" > 0);
ALTER TABLE "service_records" ADD CONSTRAINT "service_records_money_check" CHECK (
  "unit_price_cents" >= 0 AND "total_cents" >= 0
  AND ("labor_cents" IS NULL OR "labor_cents" >= 0)
  AND ("parts_cents" IS NULL OR "parts_cents" >= 0)
);
ALTER TABLE "service_types" ADD CONSTRAINT "service_types_intervals_check" CHECK (
  ("default_interval_km" IS NULL OR "default_interval_km" > 0)
  AND ("default_interval_mi" IS NULL OR "default_interval_mi" > 0)
  AND ("default_interval_months" IS NULL OR "default_interval_months" > 0)
);

-- Grants (section 6.1). The runtime roles get no DELETE where rows are never deleted
-- (section 1): customers and vehicles use deletedAt, visits/records/reminders a status.
-- Only suggestions may be deleted.
GRANT SELECT, INSERT, UPDATE ON "garage_customers", "vehicles", "service_types", "visits", "service_records", "reminders" TO gearva_app, gearva_platform;
GRANT SELECT, INSERT, UPDATE, DELETE ON "suggestions" TO gearva_app, gearva_platform;
-- owners: the platform role manages them; garage code only reads linked owners (below).
GRANT SELECT, INSERT, UPDATE ON "owners" TO gearva_platform;
GRANT SELECT ON "owners" TO gearva_app;

-- Owners from garage code (section 6.6). RLS is enabled but not forced: the migrator
-- (table owner, used only by the function below) and gearva_platform (BYPASSRLS) are not
-- filtered; gearva_app sees only owners linked to a customer of its own garage.
ALTER TABLE "owners" ENABLE ROW LEVEL SECURITY;
CREATE POLICY owners_linked_read ON "owners" FOR SELECT TO gearva_app
  USING (EXISTS (
    SELECT 1 FROM "garage_customers" gc
    WHERE gc."owner_id" = "owners"."id"
      AND gc."garage_id" = NULLIF(current_setting('app.garage_id', true), '')::uuid
  ));

-- UUID v7 (README 5.4) for rows created in SQL: 48-bit Unix time in ms + random bits.
-- Postgres 18 has uuidv7(); this works on 16 and 17 too.
CREATE FUNCTION gearva_uuid_v7() RETURNS uuid
LANGUAGE sql VOLATILE AS $$
  SELECT encode(
    set_bit(set_bit(
      overlay(uuid_send(gen_random_uuid())
        PLACING substring(int8send(floor(extract(epoch FROM clock_timestamp()) * 1000)::bigint) FROM 3)
        FROM 1 FOR 6),
      52, 1), 53, 1),
    'hex')::uuid;
$$;

-- flow.md 3.1 step 3: the owner's id for an E.164 phone, created if new. The only way
-- garage code creates owners or learns an unlinked owner's id; it never returns the row,
-- so the owners table cannot be browsed. Runs as the migrator (SECURITY DEFINER) with a
-- fixed search_path, and only inside a tenant transaction.
CREATE FUNCTION find_or_create_owner(p_phone text, p_name text, p_locale text) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_id uuid;
BEGIN
  IF NULLIF(current_setting('app.garage_id', true), '') IS NULL THEN
    RAISE EXCEPTION 'find_or_create_owner needs a tenant context';
  END IF;
  IF p_phone IS NULL OR p_phone !~ '^\+[1-9][0-9]{6,14}$' THEN
    RAISE EXCEPTION 'phone must be E.164' USING ERRCODE = '22023';
  END IF;
  IF p_locale IS NULL OR p_locale NOT IN ('ar', 'en') THEN
    RAISE EXCEPTION 'locale must be ar or en' USING ERRCODE = '22023';
  END IF;

  INSERT INTO owners (id, phone, name, locale, updated_at)
  VALUES (gearva_uuid_v7(), p_phone, btrim(p_name), p_locale, now())
  ON CONFLICT (phone) DO NOTHING
  RETURNING id INTO v_id;
  IF v_id IS NULL THEN
    SELECT id INTO v_id FROM owners WHERE phone = p_phone;
  END IF;
  RETURN v_id;
END;
$$;
REVOKE ALL ON FUNCTION find_or_create_owner(text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION find_or_create_owner(text, text, text) TO gearva_app, gearva_platform;
REVOKE ALL ON FUNCTION gearva_uuid_v7() FROM PUBLIC;

-- RLS (section 6.2), output of `npm run rls:sql -w @gearva/database -- garage_customers vehicles service_types suggestions visits service_records reminders`.
-- RLS: garage_customers
ALTER TABLE "garage_customers" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "garage_customers" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "garage_customers"
  USING (garage_id = NULLIF(current_setting('app.garage_id', true), '')::uuid)
  WITH CHECK (garage_id = NULLIF(current_setting('app.garage_id', true), '')::uuid);

-- RLS: vehicles
ALTER TABLE "vehicles" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "vehicles" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "vehicles"
  USING (garage_id = NULLIF(current_setting('app.garage_id', true), '')::uuid)
  WITH CHECK (garage_id = NULLIF(current_setting('app.garage_id', true), '')::uuid);

-- RLS: service_types
ALTER TABLE "service_types" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "service_types" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "service_types"
  USING (garage_id = NULLIF(current_setting('app.garage_id', true), '')::uuid)
  WITH CHECK (garage_id = NULLIF(current_setting('app.garage_id', true), '')::uuid);
CREATE POLICY global_defaults_read ON "service_types" FOR SELECT
  USING (garage_id IS NULL);

-- RLS: suggestions
ALTER TABLE "suggestions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "suggestions" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "suggestions"
  USING (garage_id = NULLIF(current_setting('app.garage_id', true), '')::uuid)
  WITH CHECK (garage_id = NULLIF(current_setting('app.garage_id', true), '')::uuid);

-- RLS: visits
ALTER TABLE "visits" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "visits" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "visits"
  USING (garage_id = NULLIF(current_setting('app.garage_id', true), '')::uuid)
  WITH CHECK (garage_id = NULLIF(current_setting('app.garage_id', true), '')::uuid);

-- RLS: service_records
ALTER TABLE "service_records" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "service_records" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "service_records"
  USING (garage_id = NULLIF(current_setting('app.garage_id', true), '')::uuid)
  WITH CHECK (garage_id = NULLIF(current_setting('app.garage_id', true), '')::uuid);

-- RLS: reminders
ALTER TABLE "reminders" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "reminders" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "reminders"
  USING (garage_id = NULLIF(current_setting('app.garage_id', true), '')::uuid)
  WITH CHECK (garage_id = NULLIF(current_setting('app.garage_id', true), '')::uuid);

