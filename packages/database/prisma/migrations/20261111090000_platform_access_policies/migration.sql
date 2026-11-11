-- database.md 6.1, managed Postgres fallback: gearva_platform reaches every table with RLS
-- through an explicit policy, so it works with or without the BYPASSRLS attribute (a
-- managed host such as Render may refuse BYPASSRLS). gearva_app is unaffected: a policy
-- applies only to the roles it names, and gearva_app still needs tenant_isolation.
-- Table grants still decide what gearva_platform may do (payments and access logs stay
-- append-only).

CREATE POLICY platform_access ON "garages" TO gearva_platform USING (true) WITH CHECK (true);
CREATE POLICY platform_access ON "garage_settings" TO gearva_platform USING (true) WITH CHECK (true);
CREATE POLICY platform_access ON "branches" TO gearva_platform USING (true) WITH CHECK (true);
CREATE POLICY platform_access ON "users" TO gearva_platform USING (true) WITH CHECK (true);
CREATE POLICY platform_access ON "notifications" TO gearva_platform USING (true) WITH CHECK (true);
CREATE POLICY platform_access ON "audit_logs" TO gearva_platform USING (true) WITH CHECK (true);
CREATE POLICY platform_access ON "garage_customers" TO gearva_platform USING (true) WITH CHECK (true);
CREATE POLICY platform_access ON "vehicles" TO gearva_platform USING (true) WITH CHECK (true);
CREATE POLICY platform_access ON "service_types" TO gearva_platform USING (true) WITH CHECK (true);
CREATE POLICY platform_access ON "suggestions" TO gearva_platform USING (true) WITH CHECK (true);
CREATE POLICY platform_access ON "visits" TO gearva_platform USING (true) WITH CHECK (true);
CREATE POLICY platform_access ON "service_records" TO gearva_platform USING (true) WITH CHECK (true);
CREATE POLICY platform_access ON "reminders" TO gearva_platform USING (true) WITH CHECK (true);
CREATE POLICY platform_access ON "files" TO gearva_platform USING (true) WITH CHECK (true);
CREATE POLICY platform_access ON "offers" TO gearva_platform USING (true) WITH CHECK (true);
CREATE POLICY platform_access ON "invoice_counters" TO gearva_platform USING (true) WITH CHECK (true);
CREATE POLICY platform_access ON "invoices" TO gearva_platform USING (true) WITH CHECK (true);
CREATE POLICY platform_access ON "invoice_items" TO gearva_platform USING (true) WITH CHECK (true);
CREATE POLICY platform_access ON "payments" TO gearva_platform USING (true) WITH CHECK (true);
CREATE POLICY platform_access ON "subscription_payments" TO gearva_platform USING (true) WITH CHECK (true);
CREATE POLICY platform_access ON "admin_access_logs" TO gearva_platform USING (true) WITH CHECK (true);
CREATE POLICY platform_access ON "garage_applications" TO gearva_platform USING (true) WITH CHECK (true);
CREATE POLICY platform_access ON "owners" TO gearva_platform USING (true) WITH CHECK (true);
