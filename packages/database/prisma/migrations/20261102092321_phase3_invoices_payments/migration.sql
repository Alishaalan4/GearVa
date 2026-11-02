-- CreateEnum
CREATE TYPE "InvoiceStatus" AS ENUM ('UNPAID', 'PARTIALLY_PAID', 'PAID', 'CANCELLED');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('CASH', 'WHISH');

-- CreateEnum
CREATE TYPE "DiscountType" AS ENUM ('AMOUNT', 'PERCENT');

-- CreateEnum
CREATE TYPE "InvoiceEditWindow" AS ENUM ('SAME_DAY');

-- CreateEnum
CREATE TYPE "FileKind" AS ENUM ('LOGO', 'SERVICE_PHOTO', 'INVOICE_PDF', 'OFFER_IMAGE');

-- CreateEnum
CREATE TYPE "OfferTarget" AS ENUM ('ALL', 'OVERDUE', 'INACTIVE_6M');

-- AlterTable
ALTER TABLE "garage_settings" ADD COLUMN     "invoice_edit_window" "InvoiceEditWindow" NOT NULL DEFAULT 'SAME_DAY';

-- CreateTable
CREATE TABLE "files" (
    "id" UUID NOT NULL,
    "garage_id" UUID NOT NULL,
    "kind" "FileKind" NOT NULL,
    "storage_key" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "service_record_id" UUID,
    "created_by_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "files_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "offers" (
    "id" UUID NOT NULL,
    "garage_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "image_file_id" UUID,
    "discount_type" "DiscountType" NOT NULL,
    "discount_value" INTEGER NOT NULL,
    "starts_at" TIMESTAMPTZ(3) NOT NULL,
    "expires_at" TIMESTAMPTZ(3),
    "target" "OfferTarget" NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_by_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "offers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invoice_counters" (
    "branch_id" UUID NOT NULL,
    "year" INTEGER NOT NULL,
    "garage_id" UUID NOT NULL,
    "last_number" INTEGER NOT NULL,

    CONSTRAINT "invoice_counters_pkey" PRIMARY KEY ("branch_id","year")
);

-- CreateTable
CREATE TABLE "invoices" (
    "id" UUID NOT NULL,
    "garage_id" UUID NOT NULL,
    "branch_id" UUID NOT NULL,
    "visit_id" UUID NOT NULL,
    "garage_customer_id" UUID NOT NULL,
    "owner_id" UUID NOT NULL,
    "vehicle_id" UUID NOT NULL,
    "number" TEXT NOT NULL,
    "seq" INTEGER NOT NULL,
    "year" INTEGER NOT NULL,
    "status" "InvoiceStatus" NOT NULL DEFAULT 'UNPAID',
    "issued_at" TIMESTAMPTZ(3) NOT NULL,
    "locale" TEXT NOT NULL,
    "subtotal_cents" INTEGER NOT NULL,
    "discount_type" "DiscountType",
    "discount_value" INTEGER,
    "discount_cents" INTEGER NOT NULL DEFAULT 0,
    "vat_cents" INTEGER NOT NULL DEFAULT 0,
    "total_cents" INTEGER NOT NULL,
    "paid_cents" INTEGER NOT NULL DEFAULT 0,
    "remaining_cents" INTEGER NOT NULL,
    "labor_cents" INTEGER,
    "parts_cents" INTEGER,
    "offer_id" UUID,
    "next_service_km" INTEGER,
    "next_service_date" DATE,
    "warranty_text" TEXT,
    "terms_snapshot" TEXT,
    "customer_snapshot" JSONB NOT NULL,
    "vehicle_snapshot" JSONB NOT NULL,
    "garage_snapshot" JSONB NOT NULL,
    "qr_token" TEXT,
    "pdf_file_id" UUID,
    "cancelled_at" TIMESTAMPTZ(3),
    "cancel_reason" TEXT,
    "cancelled_by_id" UUID,
    "replaces_invoice_id" UUID,
    "created_by_id" UUID NOT NULL,
    "last_edited_by_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "invoices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invoice_items" (
    "id" UUID NOT NULL,
    "garage_id" UUID NOT NULL,
    "invoice_id" UUID NOT NULL,
    "service_record_id" UUID,
    "description" TEXT NOT NULL,
    "brand" TEXT,
    "grade" TEXT,
    "quantity" DECIMAL(8,2) NOT NULL,
    "unit_price_cents" INTEGER NOT NULL,
    "total_cents" INTEGER NOT NULL,
    "position" INTEGER NOT NULL,

    CONSTRAINT "invoice_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payments" (
    "id" UUID NOT NULL,
    "garage_id" UUID NOT NULL,
    "invoice_id" UUID NOT NULL,
    "amount_cents" INTEGER NOT NULL,
    "method" "PaymentMethod" NOT NULL,
    "paid_at" TIMESTAMPTZ(3) NOT NULL,
    "received_by_id" UUID NOT NULL,
    "note" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "files_garage_id_id_key" ON "files"("garage_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "offers_garage_id_id_key" ON "offers"("garage_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "invoices_qr_token_key" ON "invoices"("qr_token");

-- CreateIndex
CREATE INDEX "invoices_garage_id_status_idx" ON "invoices"("garage_id", "status");

-- CreateIndex
CREATE INDEX "invoices_garage_customer_id_idx" ON "invoices"("garage_customer_id");

-- CreateIndex
CREATE INDEX "invoices_garage_id_issued_at_idx" ON "invoices"("garage_id", "issued_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "invoices_garage_id_id_key" ON "invoices"("garage_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "invoices_garage_id_number_key" ON "invoices"("garage_id", "number");

-- CreateIndex
CREATE UNIQUE INDEX "invoices_branch_id_year_seq_key" ON "invoices"("branch_id", "year", "seq");

-- CreateIndex
CREATE INDEX "invoice_items_invoice_id_idx" ON "invoice_items"("invoice_id");

-- CreateIndex
CREATE INDEX "payments_invoice_id_idx" ON "payments"("invoice_id");

-- CreateIndex
CREATE INDEX "payments_garage_id_paid_at_idx" ON "payments"("garage_id", "paid_at");

-- AddForeignKey
ALTER TABLE "garage_settings" ADD CONSTRAINT "garage_settings_garage_id_logo_file_id_fkey" FOREIGN KEY ("garage_id", "logo_file_id") REFERENCES "files"("garage_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "files" ADD CONSTRAINT "files_garage_id_fkey" FOREIGN KEY ("garage_id") REFERENCES "garages"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "files" ADD CONSTRAINT "files_garage_id_service_record_id_fkey" FOREIGN KEY ("garage_id", "service_record_id") REFERENCES "service_records"("garage_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "files" ADD CONSTRAINT "files_garage_id_created_by_id_fkey" FOREIGN KEY ("garage_id", "created_by_id") REFERENCES "users"("garage_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "offers" ADD CONSTRAINT "offers_garage_id_fkey" FOREIGN KEY ("garage_id") REFERENCES "garages"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "offers" ADD CONSTRAINT "offers_garage_id_image_file_id_fkey" FOREIGN KEY ("garage_id", "image_file_id") REFERENCES "files"("garage_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "offers" ADD CONSTRAINT "offers_garage_id_created_by_id_fkey" FOREIGN KEY ("garage_id", "created_by_id") REFERENCES "users"("garage_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_counters" ADD CONSTRAINT "invoice_counters_garage_id_fkey" FOREIGN KEY ("garage_id") REFERENCES "garages"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_counters" ADD CONSTRAINT "invoice_counters_garage_id_branch_id_fkey" FOREIGN KEY ("garage_id", "branch_id") REFERENCES "branches"("garage_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_garage_id_fkey" FOREIGN KEY ("garage_id") REFERENCES "garages"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_garage_id_branch_id_fkey" FOREIGN KEY ("garage_id", "branch_id") REFERENCES "branches"("garage_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_garage_id_visit_id_fkey" FOREIGN KEY ("garage_id", "visit_id") REFERENCES "visits"("garage_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_garage_id_garage_customer_id_fkey" FOREIGN KEY ("garage_id", "garage_customer_id") REFERENCES "garage_customers"("garage_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "owners"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_garage_id_vehicle_id_fkey" FOREIGN KEY ("garage_id", "vehicle_id") REFERENCES "vehicles"("garage_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_garage_id_offer_id_fkey" FOREIGN KEY ("garage_id", "offer_id") REFERENCES "offers"("garage_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_garage_id_pdf_file_id_fkey" FOREIGN KEY ("garage_id", "pdf_file_id") REFERENCES "files"("garage_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_garage_id_cancelled_by_id_fkey" FOREIGN KEY ("garage_id", "cancelled_by_id") REFERENCES "users"("garage_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_garage_id_created_by_id_fkey" FOREIGN KEY ("garage_id", "created_by_id") REFERENCES "users"("garage_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_garage_id_last_edited_by_id_fkey" FOREIGN KEY ("garage_id", "last_edited_by_id") REFERENCES "users"("garage_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_garage_id_replaces_invoice_id_fkey" FOREIGN KEY ("garage_id", "replaces_invoice_id") REFERENCES "invoices"("garage_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_items" ADD CONSTRAINT "invoice_items_garage_id_fkey" FOREIGN KEY ("garage_id") REFERENCES "garages"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_items" ADD CONSTRAINT "invoice_items_garage_id_invoice_id_fkey" FOREIGN KEY ("garage_id", "invoice_id") REFERENCES "invoices"("garage_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_items" ADD CONSTRAINT "invoice_items_garage_id_service_record_id_fkey" FOREIGN KEY ("garage_id", "service_record_id") REFERENCES "service_records"("garage_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_garage_id_fkey" FOREIGN KEY ("garage_id") REFERENCES "garages"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_garage_id_invoice_id_fkey" FOREIGN KEY ("garage_id", "invoice_id") REFERENCES "invoices"("garage_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_garage_id_received_by_id_fkey" FOREIGN KEY ("garage_id", "received_by_id") REFERENCES "users"("garage_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- One active invoice per visit (section 4.5). A cancelled invoice keeps its visit, so
-- the reissue is allowed. Prisma cannot express a partial index.
CREATE UNIQUE INDEX "invoices_visit_id_active_key" ON "invoices"("visit_id") WHERE "status" <> 'CANCELLED';

-- CHECK constraints (section 7).
ALTER TABLE "payments" ADD CONSTRAINT "payments_amount_positive" CHECK ("amount_cents" > 0);
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_paid_range" CHECK ("paid_cents" >= 0 AND "paid_cents" <= "total_cents");
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_remaining_matches" CHECK ("remaining_cents" = "total_cents" - "paid_cents");
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_total_matches" CHECK ("total_cents" = "subtotal_cents" - "discount_cents" + "vat_cents");
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_money_non_negative" CHECK (
  "subtotal_cents" >= 0 AND "discount_cents" >= 0 AND "discount_cents" <= "subtotal_cents"
  AND "vat_cents" >= 0
  AND ("labor_cents" IS NULL OR "labor_cents" >= 0)
  AND ("parts_cents" IS NULL OR "parts_cents" >= 0)
);
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_discount_value" CHECK (
  "discount_value" IS NULL OR "discount_value" >= 0
);
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_discount_percent" CHECK (
  "discount_type" IS DISTINCT FROM 'PERCENT' OR "discount_value" <= 100
);
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_cancel_reason" CHECK (
  "status" <> 'CANCELLED' OR "cancel_reason" IS NOT NULL
);
ALTER TABLE "invoice_items" ADD CONSTRAINT "invoice_items_values" CHECK (
  "quantity" > 0 AND "unit_price_cents" >= 0 AND "total_cents" >= 0
);
ALTER TABLE "offers" ADD CONSTRAINT "offers_discount_value" CHECK ("discount_value" >= 0);
ALTER TABLE "files" ADD CONSTRAINT "files_size" CHECK ("size_bytes" >= 0);

-- Grants (section 6.1). Payments are append-only. Invoices, counters and offers are never
-- deleted. Invoice items are replaced when an invoice is edited (flow.md 7.5).
GRANT SELECT, INSERT, UPDATE ON "files", "offers", "invoice_counters", "invoices" TO gearva_app, gearva_platform;
GRANT SELECT, INSERT, UPDATE, DELETE ON "invoice_items" TO gearva_app, gearva_platform;
GRANT SELECT, INSERT ON "payments" TO gearva_app, gearva_platform;

-- RLS (section 6.2), output of `npm run rls:sql -w @gearva/database -- files offers invoice_counters invoices invoice_items payments`.

-- RLS: files
ALTER TABLE "files" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "files" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "files"
  USING (garage_id = NULLIF(current_setting('app.garage_id', true), '')::uuid)
  WITH CHECK (garage_id = NULLIF(current_setting('app.garage_id', true), '')::uuid);

-- RLS: offers
ALTER TABLE "offers" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "offers" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "offers"
  USING (garage_id = NULLIF(current_setting('app.garage_id', true), '')::uuid)
  WITH CHECK (garage_id = NULLIF(current_setting('app.garage_id', true), '')::uuid);

-- RLS: invoice_counters
ALTER TABLE "invoice_counters" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "invoice_counters" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "invoice_counters"
  USING (garage_id = NULLIF(current_setting('app.garage_id', true), '')::uuid)
  WITH CHECK (garage_id = NULLIF(current_setting('app.garage_id', true), '')::uuid);

-- RLS: invoices
ALTER TABLE "invoices" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "invoices" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "invoices"
  USING (garage_id = NULLIF(current_setting('app.garage_id', true), '')::uuid)
  WITH CHECK (garage_id = NULLIF(current_setting('app.garage_id', true), '')::uuid);

-- RLS: invoice_items
ALTER TABLE "invoice_items" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "invoice_items" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "invoice_items"
  USING (garage_id = NULLIF(current_setting('app.garage_id', true), '')::uuid)
  WITH CHECK (garage_id = NULLIF(current_setting('app.garage_id', true), '')::uuid);

-- RLS: payments
ALTER TABLE "payments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "payments" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "payments"
  USING (garage_id = NULLIF(current_setting('app.garage_id', true), '')::uuid)
  WITH CHECK (garage_id = NULLIF(current_setting('app.garage_id', true), '')::uuid);

