-- Step 6.2 (database.md 6.4): the owner app's context. The API runs an owner's requests
-- as gearva_app in a transaction with app.owner_id set (runAsOwner) and app.garage_id
-- empty, so every tenant_isolation policy matches nothing and only these owner_*
-- policies apply. Step 6.3 adds the same read policy to cars, visits and invoices.
-- All of them are for gearva_app only and match nothing when app.owner_id is not set.

-- The owner's own account row (owners_linked_read is for garages; this is for the owner).
CREATE POLICY owner_self_read ON "owners" FOR SELECT TO gearva_app
  USING (id = NULLIF(current_setting('app.owner_id', true), '')::uuid);

-- Their customer rows at every garage (the garage list, and the preferences below).
CREATE POLICY owner_read ON "garage_customers" FOR SELECT TO gearva_app
  USING (owner_id = NULLIF(current_setting('app.owner_id', true), '')::uuid);

-- mobile-api.md 3.3: the owner turns reminders or offers from one garage on or off.
-- Only those two columns may change; the trigger below enforces it.
CREATE POLICY owner_preferences ON "garage_customers" FOR UPDATE TO gearva_app
  USING (owner_id = NULLIF(current_setting('app.owner_id', true), '')::uuid
         AND deleted_at IS NULL)
  WITH CHECK (owner_id = NULLIF(current_setting('app.owner_id', true), '')::uuid);

CREATE FUNCTION garage_customers_owner_update_guard() RETURNS trigger
LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  IF NULLIF(current_setting('app.owner_id', true), '') IS NOT NULL
     AND NULLIF(current_setting('app.garage_id', true), '') IS NULL
     AND (to_jsonb(NEW) - 'reminders_opt_out' - 'marketing_opt_out' - 'updated_at')
         IS DISTINCT FROM
         (to_jsonb(OLD) - 'reminders_opt_out' - 'marketing_opt_out' - 'updated_at') THEN
    RAISE EXCEPTION 'an owner may change only their reminder and offer preferences'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER garage_customers_owner_update_guard
  BEFORE UPDATE ON "garage_customers"
  FOR EACH ROW EXECUTE FUNCTION garage_customers_owner_update_guard();

-- The garages where the person is a (not removed) customer, and their settings (the logo).
CREATE POLICY owner_read ON "garages" FOR SELECT TO gearva_app
  USING (deleted_at IS NULL AND EXISTS (
    SELECT 1 FROM "garage_customers" gc
    WHERE gc."garage_id" = "garages"."id"
      AND gc."owner_id" = NULLIF(current_setting('app.owner_id', true), '')::uuid
      AND gc."deleted_at" IS NULL
  ));

CREATE POLICY owner_read ON "garage_settings" FOR SELECT TO gearva_app
  USING (EXISTS (
    SELECT 1 FROM "garage_customers" gc
    WHERE gc."garage_id" = "garage_settings"."garage_id"
      AND gc."owner_id" = NULLIF(current_setting('app.owner_id', true), '')::uuid
      AND gc."deleted_at" IS NULL
  ));
