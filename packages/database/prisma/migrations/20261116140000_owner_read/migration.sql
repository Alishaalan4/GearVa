-- Step 6.3 (database.md 6.4): the owner app reads the person's own cars, history and
-- invoices at every garage. SELECT only, for gearva_app only, and only with app.owner_id
-- set (runAsOwner); app.garage_id is then empty, so the tenant policies match nothing.

-- Rows that carry the owner (denormalized since Phase 2 for exactly this).
CREATE POLICY owner_read ON "vehicles" FOR SELECT TO gearva_app
  USING (owner_id = NULLIF(current_setting('app.owner_id', true), '')::uuid);
CREATE POLICY owner_read ON "visits" FOR SELECT TO gearva_app
  USING (owner_id = NULLIF(current_setting('app.owner_id', true), '')::uuid);
CREATE POLICY owner_read ON "service_records" FOR SELECT TO gearva_app
  USING (owner_id = NULLIF(current_setting('app.owner_id', true), '')::uuid);
CREATE POLICY owner_read ON "reminders" FOR SELECT TO gearva_app
  USING (owner_id = NULLIF(current_setting('app.owner_id', true), '')::uuid);
CREATE POLICY owner_read ON "invoices" FOR SELECT TO gearva_app
  USING (owner_id = NULLIF(current_setting('app.owner_id', true), '')::uuid);

-- An invoice's lines and payments, through their invoice.
CREATE POLICY owner_read ON "invoice_items" FOR SELECT TO gearva_app
  USING (EXISTS (
    SELECT 1 FROM "invoices" i
    WHERE i."id" = "invoice_items"."invoice_id"
      AND i."owner_id" = NULLIF(current_setting('app.owner_id', true), '')::uuid
  ));
CREATE POLICY owner_read ON "payments" FOR SELECT TO gearva_app
  USING (EXISTS (
    SELECT 1 FROM "invoices" i
    WHERE i."id" = "payments"."invoice_id"
      AND i."owner_id" = NULLIF(current_setting('app.owner_id', true), '')::uuid
  ));

-- Branch names and the garage's own service type names, at garages where the person is
-- a customer (global service types are readable by everyone already).
CREATE POLICY owner_read ON "branches" FOR SELECT TO gearva_app
  USING (EXISTS (
    SELECT 1 FROM "garage_customers" gc
    WHERE gc."garage_id" = "branches"."garage_id"
      AND gc."owner_id" = NULLIF(current_setting('app.owner_id', true), '')::uuid
      AND gc."deleted_at" IS NULL
  ));
CREATE POLICY owner_read ON "service_types" FOR SELECT TO gearva_app
  USING (EXISTS (
    SELECT 1 FROM "garage_customers" gc
    WHERE gc."garage_id" = "service_types"."garage_id"
      AND gc."owner_id" = NULLIF(current_setting('app.owner_id', true), '')::uuid
      AND gc."deleted_at" IS NULL
  ));

-- Files: only the PDFs of the person's invoices and the logos of their garages. Service
-- photos and offer images are not reachable this way.
CREATE POLICY owner_read ON "files" FOR SELECT TO gearva_app
  USING (
    EXISTS (
      SELECT 1 FROM "invoices" i
      WHERE i."pdf_file_id" = "files"."id"
        AND i."owner_id" = NULLIF(current_setting('app.owner_id', true), '')::uuid
    )
    OR EXISTS (
      SELECT 1 FROM "garage_settings" s
      JOIN "garage_customers" gc ON gc."garage_id" = s."garage_id"
      WHERE s."logo_file_id" = "files"."id"
        AND gc."owner_id" = NULLIF(current_setting('app.owner_id', true), '')::uuid
        AND gc."deleted_at" IS NULL
    )
  );
