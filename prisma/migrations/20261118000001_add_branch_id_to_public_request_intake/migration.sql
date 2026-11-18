-- Make siteId optional and add branchId to public_request_intake
ALTER TABLE "public_request_intake" ALTER COLUMN "siteId" DROP NOT NULL;
ALTER TABLE "public_request_intake" ADD COLUMN "branchId" UUID;
CREATE INDEX IF NOT EXISTS "public_request_intake_branchId_idx" ON "public_request_intake"("branchId");

DO $$ BEGIN
  ALTER TABLE "public_request_intake" ADD CONSTRAINT "public_request_intake_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
