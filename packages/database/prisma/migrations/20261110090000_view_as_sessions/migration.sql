-- Step 5.5 (flow.md 11.3): an admin's read-only "view as garage" session names its garage.

-- AlterTable
ALTER TABLE "sessions" ADD COLUMN     "view_as_garage_id" UUID;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_view_as_garage_id_fkey" FOREIGN KEY ("view_as_garage_id") REFERENCES "garages"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Hand-written: only an admin's session can view a garage.
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_view_as_admin_check"
  CHECK ("view_as_garage_id" IS NULL OR "subject_type" = 'ADMIN');
