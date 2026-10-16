CREATE TYPE "employment_type" AS ENUM ('PERMANENT', 'FIXED_TERM', 'VACATION', 'INTERN');
CREATE TYPE "staff_leave_status" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

ALTER TYPE "staff_status" ADD VALUE IF NOT EXISTS 'ON_LEAVE';

ALTER TABLE "staff_profiles"
  ADD COLUMN "employment_type" "employment_type",
  ADD COLUMN "hired_at" DATE,
  ADD COLUMN "contract_end" DATE,
  ADD COLUMN "weekly_workload" INTEGER NOT NULL DEFAULT 0;

CREATE TABLE "staff_leaves" (
  "id" UUID NOT NULL DEFAULT uuidv7(),
  "school_id" UUID NOT NULL,
  "staff_profile_id" UUID NOT NULL,
  "type" TEXT NOT NULL,
  "starts_at" DATE NOT NULL,
  "ends_at" DATE NOT NULL,
  "reason" TEXT NOT NULL,
  "status" "staff_leave_status" NOT NULL DEFAULT 'PENDING',
  "decided_at" TIMESTAMPTZ(3),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "staff_leaves_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "staff_leaves_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "staff_leaves_staff_profile_id_fkey" FOREIGN KEY ("staff_profile_id") REFERENCES "staff_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "staff_leaves_dates_check" CHECK ("ends_at" >= "starts_at")
);

CREATE INDEX "staff_leaves_school_id_status_starts_at_idx" ON "staff_leaves"("school_id", "status", "starts_at");
CREATE INDEX "staff_leaves_staff_profile_id_starts_at_idx" ON "staff_leaves"("staff_profile_id", "starts_at");
