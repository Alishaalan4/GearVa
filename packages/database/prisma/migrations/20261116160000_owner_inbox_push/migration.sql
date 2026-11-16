-- Step 6.4 (database.md 4.1, 4.6, 6.4): the owner app's inbox and push devices.

-- CreateTable
CREATE TABLE "device_tokens" (
    "id" UUID NOT NULL,
    "owner_id" UUID NOT NULL,
    "token" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "last_seen_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "device_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "device_tokens_token_key" ON "device_tokens"("token");

-- CreateIndex
CREATE INDEX "device_tokens_owner_id_idx" ON "device_tokens"("owner_id");

-- AddForeignKey
ALTER TABLE "device_tokens" ADD CONSTRAINT "device_tokens_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "owners"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Hand-written. A platform table: the owner's own devices, managed by the API's platform
-- role like sessions (no garage, no RLS); gearva_app has no right on it.
ALTER TABLE "device_tokens" ADD CONSTRAINT "device_tokens_platform_check"
  CHECK ("platform" IN ('android', 'ios'));
GRANT SELECT, INSERT, UPDATE, DELETE ON "device_tokens" TO gearva_platform;

-- The inbox (mobile-api.md 6.1, 6.2): an owner reads their own IN_APP notifications from
-- every garage, and may only mark them read (the trigger below). Same pattern as
-- owner_preferences on garage_customers (step 6.2).
CREATE POLICY owner_inbox_read ON "notifications" FOR SELECT TO gearva_app
  USING (owner_id = NULLIF(current_setting('app.owner_id', true), '')::uuid
         AND channel = 'IN_APP');
CREATE POLICY owner_inbox_mark_read ON "notifications" FOR UPDATE TO gearva_app
  USING (owner_id = NULLIF(current_setting('app.owner_id', true), '')::uuid
         AND channel = 'IN_APP')
  WITH CHECK (owner_id = NULLIF(current_setting('app.owner_id', true), '')::uuid
              AND channel = 'IN_APP');

CREATE FUNCTION notifications_owner_update_guard() RETURNS trigger
LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  IF NULLIF(current_setting('app.owner_id', true), '') IS NOT NULL
     AND NULLIF(current_setting('app.garage_id', true), '') IS NULL
     AND (to_jsonb(NEW) - 'read_at' - 'updated_at')
         IS DISTINCT FROM (to_jsonb(OLD) - 'read_at' - 'updated_at') THEN
    RAISE EXCEPTION 'an owner may only mark their notifications read'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER notifications_owner_update_guard
  BEFORE UPDATE ON "notifications"
  FOR EACH ROW EXECUTE FUNCTION notifications_owner_update_guard();
