-- Step 6.5 (flow.md 10, mobile-api.md 7): offers in the owner app, and who opened them.

-- CreateTable
CREATE TABLE "offer_views" (
    "id" UUID NOT NULL,
    "garage_id" UUID NOT NULL,
    "offer_id" UUID NOT NULL,
    "owner_id" UUID NOT NULL,
    "viewed_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "offer_views_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "offer_views_offer_id_owner_id_key" ON "offer_views"("offer_id", "owner_id");

-- AddForeignKey
ALTER TABLE "offer_views" ADD CONSTRAINT "offer_views_garage_id_fkey" FOREIGN KEY ("garage_id") REFERENCES "garages"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "offer_views" ADD CONSTRAINT "offer_views_garage_id_offer_id_fkey" FOREIGN KEY ("garage_id", "offer_id") REFERENCES "offers"("garage_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "offer_views" ADD CONSTRAINT "offer_views_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "owners"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Hand-written. Append-only, like payments: the garage reads its counts, the owner app
-- adds a row; nobody changes or deletes one.
GRANT SELECT, INSERT ON "offer_views" TO gearva_app, gearva_platform;

-- RLS (database.md 6.2), output of `npm run rls:sql -w @gearva/database -- offer_views`.
ALTER TABLE "offer_views" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "offer_views" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "offer_views"
  USING (garage_id = NULLIF(current_setting('app.garage_id', true), '')::uuid)
  WITH CHECK (garage_id = NULLIF(current_setting('app.garage_id', true), '')::uuid);
CREATE POLICY platform_access ON "offer_views" TO gearva_platform
  USING (true) WITH CHECK (true);

-- The owner app (database.md 6.4). An owner sees the offers of garages where they are a
-- live customer who has not turned offers off (marketingOptOut); the API also hides
-- offers that are off, not started, ended, or of a locked garage.
CREATE POLICY owner_read ON "offers" FOR SELECT TO gearva_app
  USING (EXISTS (
    SELECT 1 FROM "garage_customers" gc
    WHERE gc."garage_id" = "offers"."garage_id"
      AND gc."owner_id" = NULLIF(current_setting('app.owner_id', true), '')::uuid
      AND gc."deleted_at" IS NULL
      AND gc."marketing_opt_out" = false
  ));

-- Their images, on the same terms (files: the second owner policy, OR-ed with owner_read).
CREATE POLICY owner_offer_images ON "files" FOR SELECT TO gearva_app
  USING (EXISTS (
    SELECT 1 FROM "offers" o
    JOIN "garage_customers" gc ON gc."garage_id" = o."garage_id"
    WHERE o."image_file_id" = "files"."id"
      AND gc."owner_id" = NULLIF(current_setting('app.owner_id', true), '')::uuid
      AND gc."deleted_at" IS NULL
      AND gc."marketing_opt_out" = false
  ));

-- An owner records their own view of an offer they can see, and reads their own views.
CREATE POLICY owner_views ON "offer_views" FOR SELECT TO gearva_app
  USING (owner_id = NULLIF(current_setting('app.owner_id', true), '')::uuid);
CREATE POLICY owner_record_view ON "offer_views" FOR INSERT TO gearva_app
  WITH CHECK (
    owner_id = NULLIF(current_setting('app.owner_id', true), '')::uuid
    AND EXISTS (
      SELECT 1 FROM "garage_customers" gc
      WHERE gc."garage_id" = "offer_views"."garage_id"
        AND gc."owner_id" = "offer_views"."owner_id"
        AND gc."deleted_at" IS NULL
        AND gc."marketing_opt_out" = false
    )
  );
