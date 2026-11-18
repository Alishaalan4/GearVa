-- Step 5.10 (flow.md 11.9): messages from Gearva to garages. An email to each garage owner
-- and a banner in garage-web until each staff member closes it.

-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'ANNOUNCEMENT';

-- CreateTable
CREATE TABLE "announcements" (
    "id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "show_until" TIMESTAMPTZ(3),
    "email_sent" BOOLEAN NOT NULL,
    "sent_by_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "announcements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "announcement_garages" (
    "id" UUID NOT NULL,
    "garage_id" UUID NOT NULL,
    "announcement_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "announcement_garages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "announcement_dismissals" (
    "id" UUID NOT NULL,
    "garage_id" UUID NOT NULL,
    "announcement_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "dismissed_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "announcement_dismissals_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "announcement_garages_garage_id_created_at_idx" ON "announcement_garages"("garage_id", "created_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "announcement_garages_announcement_id_garage_id_key" ON "announcement_garages"("announcement_id", "garage_id");

-- CreateIndex
CREATE UNIQUE INDEX "announcement_dismissals_announcement_id_user_id_key" ON "announcement_dismissals"("announcement_id", "user_id");

-- AddForeignKey
ALTER TABLE "announcements" ADD CONSTRAINT "announcements_sent_by_id_fkey" FOREIGN KEY ("sent_by_id") REFERENCES "admin_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "announcement_garages" ADD CONSTRAINT "announcement_garages_garage_id_fkey" FOREIGN KEY ("garage_id") REFERENCES "garages"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "announcement_garages" ADD CONSTRAINT "announcement_garages_announcement_id_fkey" FOREIGN KEY ("announcement_id") REFERENCES "announcements"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "announcement_dismissals" ADD CONSTRAINT "announcement_dismissals_garage_id_fkey" FOREIGN KEY ("garage_id") REFERENCES "garages"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "announcement_dismissals" ADD CONSTRAINT "announcement_dismissals_announcement_id_fkey" FOREIGN KEY ("announcement_id") REFERENCES "announcements"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "announcement_dismissals" ADD CONSTRAINT "announcement_dismissals_garage_id_user_id_fkey" FOREIGN KEY ("garage_id", "user_id") REFERENCES "users"("garage_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "announcement_dismissals" ADD CONSTRAINT "announcement_dismissals_announcement_id_garage_id_fkey" FOREIGN KEY ("announcement_id", "garage_id") REFERENCES "announcement_garages"("announcement_id", "garage_id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Hand-written. Platform role: sends messages and ends a banner early (show_until).
-- gearva_app: reads the messages its garage received and records a closed banner;
-- nobody changes or deletes a recipient or a dismissal.
GRANT SELECT, INSERT, UPDATE ON "announcements" TO gearva_platform;
GRANT SELECT, INSERT ON "announcement_garages", "announcement_dismissals" TO gearva_platform;
GRANT SELECT ON "announcements", "announcement_garages" TO gearva_app;
GRANT SELECT, INSERT ON "announcement_dismissals" TO gearva_app;

-- announcements has no garage_id: a garage reads only the messages it received.
ALTER TABLE "announcements" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "announcements" FORCE ROW LEVEL SECURITY;
CREATE POLICY announcement_read ON "announcements" FOR SELECT TO gearva_app
  USING (EXISTS (
    SELECT 1 FROM "announcement_garages" ag
    WHERE ag."announcement_id" = "announcements"."id"
      AND ag."garage_id" = NULLIF(current_setting('app.garage_id', true), '')::uuid
  ));
CREATE POLICY platform_access ON "announcements" TO gearva_platform
  USING (true) WITH CHECK (true);

-- RLS (database.md 6.2), output of `npm run rls:sql -w @gearva/database -- announcement_garages announcement_dismissals`.
-- RLS: announcement_garages
ALTER TABLE "announcement_garages" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "announcement_garages" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "announcement_garages"
  USING (garage_id = NULLIF(current_setting('app.garage_id', true), '')::uuid)
  WITH CHECK (garage_id = NULLIF(current_setting('app.garage_id', true), '')::uuid);
CREATE POLICY platform_access ON "announcement_garages" TO gearva_platform
  USING (true) WITH CHECK (true);
-- RLS: announcement_dismissals
ALTER TABLE "announcement_dismissals" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "announcement_dismissals" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "announcement_dismissals"
  USING (garage_id = NULLIF(current_setting('app.garage_id', true), '')::uuid)
  WITH CHECK (garage_id = NULLIF(current_setting('app.garage_id', true), '')::uuid);
CREATE POLICY platform_access ON "announcement_dismissals" TO gearva_platform
  USING (true) WITH CHECK (true);
