-- Step 6.1 (flow.md 2.4, database.md 4.1): owner app accounts. The owner sets a password
-- through a one-time link that a garage sends. (owner_otps was planned but never created,
-- so there is nothing to drop.)

-- AlterTable
ALTER TABLE "owners" ADD COLUMN     "invite_expires_at" TIMESTAMPTZ(3),
ADD COLUMN     "invite_token_hash" TEXT,
ADD COLUMN     "password_hash" TEXT,
ADD COLUMN     "password_set_at" TIMESTAMPTZ(3);

-- CreateIndex
CREATE UNIQUE INDEX "owners_email_key" ON "owners"("email");

-- CreateIndex
CREATE UNIQUE INDEX "owners_invite_token_hash_key" ON "owners"("invite_token_hash");

-- Hand-written: the login email is stored in lower case, so the unique index is exact.
ALTER TABLE "owners" ADD CONSTRAINT "owners_email_lower_check"
  CHECK ("email" IS NULL OR "email" = lower("email"));

-- flow.md 2.4 step 1: a garage invites one of its own customers to the owner app.
-- gearva_app may only read owners (database.md 6.6), so the change goes through this
-- SECURITY DEFINER function, like find_or_create_owner(). It works only inside a tenant
-- transaction and only for an owner linked to a live customer of that garage. Returns:
--   'INVITED'         the email and the link are saved (a new link replaces the old one)
--   'ALREADY_ACTIVE'  the owner already set a password: nothing changes
--   'EMAIL_USED'      another owner uses this email for the app: nothing changes
CREATE FUNCTION invite_owner(
  p_owner_id uuid, p_email text, p_token_hash text, p_expires_at timestamptz
) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_garage uuid := NULLIF(current_setting('app.garage_id', true), '')::uuid;
  v_active boolean;
BEGIN
  IF v_garage IS NULL THEN
    RAISE EXCEPTION 'invite_owner needs a tenant context';
  END IF;
  IF p_email IS NULL OR p_email <> lower(btrim(p_email)) OR p_email !~ '^[^@\s]+@[^@\s]+$' THEN
    RAISE EXCEPTION 'email must be lower case' USING ERRCODE = '22023';
  END IF;
  IF p_token_hash IS NULL OR p_expires_at IS NULL THEN
    RAISE EXCEPTION 'token hash and expiry are required' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM garage_customers
    WHERE garage_id = v_garage AND owner_id = p_owner_id AND deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'owner is not a customer of this garage' USING ERRCODE = '42501';
  END IF;

  SELECT password_hash IS NOT NULL INTO v_active FROM owners WHERE id = p_owner_id FOR UPDATE;
  IF v_active THEN
    RETURN 'ALREADY_ACTIVE';
  END IF;
  IF EXISTS (SELECT 1 FROM owners WHERE email = p_email AND id <> p_owner_id) THEN
    RETURN 'EMAIL_USED';
  END IF;

  BEGIN
    UPDATE owners
    SET email = p_email, invite_token_hash = p_token_hash, invite_expires_at = p_expires_at,
        updated_at = now()
    WHERE id = p_owner_id;
  EXCEPTION WHEN unique_violation THEN
    -- Another owner took the email at the same moment.
    RETURN 'EMAIL_USED';
  END;
  RETURN 'INVITED';
END;
$$;
REVOKE ALL ON FUNCTION invite_owner(uuid, text, text, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION invite_owner(uuid, text, text, timestamptz) TO gearva_app;
