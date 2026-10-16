-- Phase 03–04 — élèves, inscriptions, responsables et associations

-- CreateEnum
CREATE TYPE "gender" AS ENUM ('M', 'F');

-- CreateEnum
CREATE TYPE "student_status" AS ENUM ('ACTIVE', 'INACTIVE', 'GRADUATED', 'TRANSFERRED', 'SUSPENDED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "enrollment_type" AS ENUM ('NEW', 'RE_ENROLLMENT', 'TRANSFER_IN');

-- CreateEnum
CREATE TYPE "enrollment_status" AS ENUM ('DRAFT', 'ACTIVE', 'SUSPENDED', 'COMPLETED', 'WITHDRAWN', 'CANCELLED');

-- CreateEnum
CREATE TYPE "guardian_status" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "guardian_relationship" AS ENUM ('PERE', 'MERE', 'TUTEUR', 'ONCLE', 'TANTE', 'GRAND_PARENT', 'AUTRE');

-- CreateEnum
CREATE TYPE "guardian_link_status" AS ENUM ('PENDING', 'ACCEPTED', 'REJECTED', 'REVOKED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "guardian_invite_type" AS ENUM ('PHONE', 'SMS', 'CODE', 'QR_CODE');

-- CreateEnum
CREATE TYPE "guardian_invite_status" AS ENUM ('ACTIVE', 'USED', 'EXPIRED', 'REVOKED');

-- CreateEnum
CREATE TYPE "guardian_invite_use_result" AS ENUM ('SUCCESS', 'EXPIRED', 'REVOKED', 'MAX_USES', 'INVALID');

-- CreateEnum
CREATE TYPE "guardian_request_kind" AS ENUM ('LINK_REQUEST', 'DISPUTE');

-- CreateEnum
CREATE TYPE "guardian_request_status" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED');

-- DropForeignKey
ALTER TABLE "academic_years" DROP CONSTRAINT "academic_years_school_id_fkey";

-- DropForeignKey
ALTER TABLE "classes" DROP CONSTRAINT "classes_academic_year_id_fkey";

-- DropForeignKey
ALTER TABLE "classes" DROP CONSTRAINT "classes_grade_level_id_fkey";

-- DropForeignKey
ALTER TABLE "classes" DROP CONSTRAINT "classes_head_teacher_user_id_fkey";

-- DropForeignKey
ALTER TABLE "classes" DROP CONSTRAINT "classes_school_id_fkey";

-- DropForeignKey
ALTER TABLE "grade_levels" DROP CONSTRAINT "grade_levels_school_id_fkey";

-- DropForeignKey
ALTER TABLE "student_categories" DROP CONSTRAINT "student_categories_school_id_fkey";

-- CreateTable
CREATE TABLE "students" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "school_id" UUID NOT NULL,
    "student_number" TEXT NOT NULL,
    "first_name" TEXT NOT NULL,
    "last_name" TEXT NOT NULL,
    "date_of_birth" DATE,
    "place_of_birth" TEXT,
    "gender" "gender",
    "photo_file_id" UUID,
    "status" "student_status" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "students_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "enrollments" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "student_id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "academic_year_id" UUID NOT NULL,
    "class_id" UUID,
    "student_category_id" UUID,
    "enrollment_date" DATE NOT NULL,
    "enrollment_type" "enrollment_type" NOT NULL DEFAULT 'NEW',
    "status" "enrollment_status" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "enrollments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "student_class_changes" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "enrollment_id" UUID NOT NULL,
    "from_class_id" UUID,
    "to_class_id" UUID,
    "reason" TEXT NOT NULL,
    "effective_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "changed_by" UUID,
    "changed_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "student_class_changes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "guardians" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "school_id" UUID NOT NULL,
    "user_id" UUID,
    "first_name" TEXT NOT NULL,
    "last_name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "phone_secondary" TEXT,
    "email" CITEXT,
    "occupation" TEXT,
    "address" TEXT,
    "status" "guardian_status" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "guardians_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "student_guardians" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "student_id" UUID NOT NULL,
    "guardian_id" UUID NOT NULL,
    "relationship" "guardian_relationship" NOT NULL,
    "is_primary" BOOLEAN NOT NULL DEFAULT false,
    "is_financial_responsible" BOOLEAN NOT NULL DEFAULT false,
    "can_pay" BOOLEAN NOT NULL DEFAULT true,
    "can_view_finances" BOOLEAN NOT NULL DEFAULT true,
    "can_receive_notifications" BOOLEAN NOT NULL DEFAULT true,
    "status" "guardian_link_status" NOT NULL DEFAULT 'PENDING',
    "accepted_at" TIMESTAMPTZ(3),
    "rejected_at" TIMESTAMPTZ(3),
    "revoked_at" TIMESTAMPTZ(3),
    "revoked_by" UUID,
    "revoke_reason" TEXT,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "student_guardians_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "guardian_invites" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "school_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "guardian_id" UUID,
    "phone" TEXT,
    "token_hash" TEXT NOT NULL,
    "short_code" TEXT NOT NULL,
    "type" "guardian_invite_type" NOT NULL,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "max_uses" INTEGER NOT NULL DEFAULT 1,
    "used_count" INTEGER NOT NULL DEFAULT 0,
    "status" "guardian_invite_status" NOT NULL DEFAULT 'ACTIVE',
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "guardian_invites_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "guardian_invite_uses" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "invite_id" UUID NOT NULL,
    "user_id" UUID,
    "ip_address" INET,
    "user_agent" TEXT,
    "result" "guardian_invite_use_result" NOT NULL,
    "used_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "guardian_invite_uses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "guardian_link_requests" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "school_id" UUID NOT NULL,
    "requested_by_user_id" UUID NOT NULL,
    "student_id" UUID,
    "claimed_student_number" TEXT,
    "claimed_student_name" TEXT,
    "relationship" "guardian_relationship",
    "kind" "guardian_request_kind" NOT NULL,
    "message" TEXT,
    "status" "guardian_request_status" NOT NULL DEFAULT 'PENDING',
    "handled_by" UUID,
    "handled_at" TIMESTAMPTZ(3),
    "resolution_note" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "guardian_link_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "students_school_id_status_idx" ON "students"("school_id", "status");

-- CreateIndex
CREATE INDEX "students_school_id_last_name_first_name_idx" ON "students"("school_id", "last_name", "first_name");

-- CreateIndex
CREATE UNIQUE INDEX "students_school_id_student_number_key" ON "students"("school_id", "student_number");

-- CreateIndex
CREATE INDEX "enrollments_school_id_academic_year_id_status_idx" ON "enrollments"("school_id", "academic_year_id", "status");

-- CreateIndex
CREATE INDEX "enrollments_class_id_status_idx" ON "enrollments"("class_id", "status");

-- CreateIndex
CREATE INDEX "enrollments_student_category_id_idx" ON "enrollments"("student_category_id");

-- CreateIndex
CREATE UNIQUE INDEX "enrollments_student_id_academic_year_id_key" ON "enrollments"("student_id", "academic_year_id");

-- CreateIndex
CREATE INDEX "student_class_changes_enrollment_id_changed_at_idx" ON "student_class_changes"("enrollment_id", "changed_at" DESC);

-- CreateIndex
CREATE INDEX "student_class_changes_from_class_id_idx" ON "student_class_changes"("from_class_id");

-- CreateIndex
CREATE INDEX "student_class_changes_to_class_id_idx" ON "student_class_changes"("to_class_id");

-- CreateIndex
CREATE INDEX "guardians_phone_idx" ON "guardians"("phone");

-- CreateIndex
CREATE INDEX "guardians_user_id_status_idx" ON "guardians"("user_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "guardians_school_id_phone_key" ON "guardians"("school_id", "phone");

-- CreateIndex
CREATE INDEX "student_guardians_guardian_id_status_idx" ON "student_guardians"("guardian_id", "status");

-- CreateIndex
CREATE INDEX "student_guardians_student_id_status_idx" ON "student_guardians"("student_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "student_guardians_student_id_guardian_id_key" ON "student_guardians"("student_id", "guardian_id");

-- CreateIndex
CREATE UNIQUE INDEX "guardian_invites_token_hash_key" ON "guardian_invites"("token_hash");

-- CreateIndex
CREATE UNIQUE INDEX "guardian_invites_short_code_key" ON "guardian_invites"("short_code");

-- CreateIndex
CREATE INDEX "guardian_invites_school_id_student_id_status_idx" ON "guardian_invites"("school_id", "student_id", "status");

-- CreateIndex
CREATE INDEX "guardian_invites_expires_at_status_idx" ON "guardian_invites"("expires_at", "status");

-- CreateIndex
CREATE INDEX "guardian_invite_uses_invite_id_used_at_idx" ON "guardian_invite_uses"("invite_id", "used_at" DESC);

-- CreateIndex
CREATE INDEX "guardian_invite_uses_user_id_used_at_idx" ON "guardian_invite_uses"("user_id", "used_at" DESC);

-- CreateIndex
CREATE INDEX "guardian_link_requests_school_id_status_kind_created_at_idx" ON "guardian_link_requests"("school_id", "status", "kind", "created_at" DESC);

-- CreateIndex
CREATE INDEX "guardian_link_requests_requested_by_user_id_status_idx" ON "guardian_link_requests"("requested_by_user_id", "status");

-- CreateIndex
CREATE INDEX "guardian_link_requests_student_id_idx" ON "guardian_link_requests"("student_id");

-- AddForeignKey
ALTER TABLE "academic_years" ADD CONSTRAINT "academic_years_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grade_levels" ADD CONSTRAINT "grade_levels_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "classes" ADD CONSTRAINT "classes_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "classes" ADD CONSTRAINT "classes_academic_year_id_fkey" FOREIGN KEY ("academic_year_id") REFERENCES "academic_years"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "classes" ADD CONSTRAINT "classes_grade_level_id_fkey" FOREIGN KEY ("grade_level_id") REFERENCES "grade_levels"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "classes" ADD CONSTRAINT "classes_head_teacher_user_id_fkey" FOREIGN KEY ("head_teacher_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_categories" ADD CONSTRAINT "student_categories_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "students" ADD CONSTRAINT "students_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "students" ADD CONSTRAINT "students_photo_file_id_fkey" FOREIGN KEY ("photo_file_id") REFERENCES "files"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enrollments" ADD CONSTRAINT "enrollments_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enrollments" ADD CONSTRAINT "enrollments_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enrollments" ADD CONSTRAINT "enrollments_academic_year_id_fkey" FOREIGN KEY ("academic_year_id") REFERENCES "academic_years"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enrollments" ADD CONSTRAINT "enrollments_class_id_fkey" FOREIGN KEY ("class_id") REFERENCES "classes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enrollments" ADD CONSTRAINT "enrollments_student_category_id_fkey" FOREIGN KEY ("student_category_id") REFERENCES "student_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_class_changes" ADD CONSTRAINT "student_class_changes_enrollment_id_fkey" FOREIGN KEY ("enrollment_id") REFERENCES "enrollments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_class_changes" ADD CONSTRAINT "student_class_changes_from_class_id_fkey" FOREIGN KEY ("from_class_id") REFERENCES "classes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_class_changes" ADD CONSTRAINT "student_class_changes_to_class_id_fkey" FOREIGN KEY ("to_class_id") REFERENCES "classes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_class_changes" ADD CONSTRAINT "student_class_changes_changed_by_fkey" FOREIGN KEY ("changed_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "guardians" ADD CONSTRAINT "guardians_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "guardians" ADD CONSTRAINT "guardians_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_guardians" ADD CONSTRAINT "student_guardians_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_guardians" ADD CONSTRAINT "student_guardians_guardian_id_fkey" FOREIGN KEY ("guardian_id") REFERENCES "guardians"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_guardians" ADD CONSTRAINT "student_guardians_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_guardians" ADD CONSTRAINT "student_guardians_revoked_by_fkey" FOREIGN KEY ("revoked_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "guardian_invites" ADD CONSTRAINT "guardian_invites_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "guardian_invites" ADD CONSTRAINT "guardian_invites_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "guardian_invites" ADD CONSTRAINT "guardian_invites_guardian_id_fkey" FOREIGN KEY ("guardian_id") REFERENCES "guardians"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "guardian_invites" ADD CONSTRAINT "guardian_invites_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "guardian_invite_uses" ADD CONSTRAINT "guardian_invite_uses_invite_id_fkey" FOREIGN KEY ("invite_id") REFERENCES "guardian_invites"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "guardian_invite_uses" ADD CONSTRAINT "guardian_invite_uses_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "guardian_link_requests" ADD CONSTRAINT "guardian_link_requests_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "guardian_link_requests" ADD CONSTRAINT "guardian_link_requests_requested_by_user_id_fkey" FOREIGN KEY ("requested_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "guardian_link_requests" ADD CONSTRAINT "guardian_link_requests_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "guardian_link_requests" ADD CONSTRAINT "guardian_link_requests_handled_by_fkey" FOREIGN KEY ("handled_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Invariants métier et index de recherche.
ALTER TABLE "guardians" ADD CONSTRAINT "guardians_phone_e164"
  CHECK (phone ~ '^\+[1-9][0-9]{7,14}$');
ALTER TABLE "guardian_invites" ADD CONSTRAINT "guardian_invites_usage_valid"
  CHECK (max_uses > 0 AND used_count >= 0 AND used_count <= max_uses AND expires_at > created_at);
ALTER TABLE "student_guardians" ADD CONSTRAINT "student_guardians_revocation_reason"
  CHECK (status <> 'REVOKED' OR (revoke_reason IS NOT NULL AND length(trim(revoke_reason)) > 0));

CREATE UNIQUE INDEX "uq_student_primary_guardian"
  ON "student_guardians"("student_id") WHERE is_primary AND status = 'ACCEPTED';
CREATE INDEX "idx_students_search" ON "students"
  USING GIN (unaccent_immutable(lower(first_name || ' ' || last_name)) gin_trgm_ops);
CREATE INDEX "idx_students_number_search" ON "students"
  USING GIN (lower(student_number) gin_trgm_ops);

-- updated_at est maintenu par la base, y compris pour les écritures hors Prisma.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['students', 'enrollments', 'guardians', 'student_guardians', 'guardian_link_requests'] LOOP
    EXECUTE format('CREATE TRIGGER trg_%1$s_updated_at BEFORE UPDATE ON %1$I FOR EACH ROW EXECUTE FUNCTION set_updated_at()', t);
  END LOOP;
END $$;

-- Isolation directe des tables portant school_id.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['students', 'enrollments', 'guardians', 'guardian_invites', 'guardian_link_requests'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'CREATE POLICY school_isolation ON %I USING (current_school_id() IS NULL OR school_id = current_school_id()) WITH CHECK (current_school_id() IS NULL OR school_id = current_school_id())', t
    );
  END LOOP;
END $$;

-- Les tables de relation héritent du périmètre de leur parent indexé.
ALTER TABLE "student_class_changes" ENABLE ROW LEVEL SECURITY;
CREATE POLICY school_isolation ON "student_class_changes"
  USING (current_school_id() IS NULL OR EXISTS (
    SELECT 1 FROM enrollments e WHERE e.id = enrollment_id AND e.school_id = current_school_id()
  ))
  WITH CHECK (current_school_id() IS NULL OR EXISTS (
    SELECT 1 FROM enrollments e WHERE e.id = enrollment_id AND e.school_id = current_school_id()
  ));

ALTER TABLE "student_guardians" ENABLE ROW LEVEL SECURITY;
CREATE POLICY school_isolation ON "student_guardians"
  USING (current_school_id() IS NULL OR EXISTS (
    SELECT 1 FROM students s WHERE s.id = student_id AND s.school_id = current_school_id()
  ))
  WITH CHECK (current_school_id() IS NULL OR EXISTS (
    SELECT 1 FROM students s WHERE s.id = student_id AND s.school_id = current_school_id()
  ));

ALTER TABLE "guardian_invite_uses" ENABLE ROW LEVEL SECURITY;
CREATE POLICY school_isolation ON "guardian_invite_uses"
  USING (current_school_id() IS NULL OR EXISTS (
    SELECT 1 FROM guardian_invites i WHERE i.id = invite_id AND i.school_id = current_school_id()
  ))
  WITH CHECK (current_school_id() IS NULL OR EXISTS (
    SELECT 1 FROM guardian_invites i WHERE i.id = invite_id AND i.school_id = current_school_id()
  ));
