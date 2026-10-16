-- Phase 18 — fondation pédagogique

CREATE TYPE "teaching_assignment_status" AS ENUM ('PLANNED', 'ACTIVE', 'INACTIVE');

CREATE TABLE "subjects" (
  "id" UUID NOT NULL DEFAULT uuidv7(),
  "school_id" UUID NOT NULL,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "color" TEXT NOT NULL DEFAULT '#2B6CB0',
  "status" "reference_status" NOT NULL DEFAULT 'ACTIVE',
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "subjects_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "subjects_color_format" CHECK (color ~ '^#[0-9A-Fa-f]{6}$'),
  CONSTRAINT "subjects_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE
);

CREATE TABLE "teaching_assignments" (
  "id" UUID NOT NULL DEFAULT uuidv7(),
  "school_id" UUID NOT NULL,
  "academic_year_id" UUID NOT NULL,
  "class_id" UUID NOT NULL,
  "subject_id" UUID NOT NULL,
  "teacher_user_id" UUID,
  "weekly_hours" INTEGER NOT NULL,
  "status" "teaching_assignment_status" NOT NULL DEFAULT 'PLANNED',
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "teaching_assignments_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "teaching_assignments_hours_valid" CHECK (weekly_hours BETWEEN 1 AND 40),
  CONSTRAINT "teaching_assignments_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE,
  CONSTRAINT "teaching_assignments_academic_year_id_fkey" FOREIGN KEY ("academic_year_id") REFERENCES "academic_years"("id") ON DELETE CASCADE,
  CONSTRAINT "teaching_assignments_class_id_fkey" FOREIGN KEY ("class_id") REFERENCES "classes"("id") ON DELETE CASCADE,
  CONSTRAINT "teaching_assignments_subject_id_fkey" FOREIGN KEY ("subject_id") REFERENCES "subjects"("id") ON DELETE RESTRICT,
  CONSTRAINT "teaching_assignments_teacher_user_id_fkey" FOREIGN KEY ("teacher_user_id") REFERENCES "users"("id") ON DELETE SET NULL
);

CREATE UNIQUE INDEX "subjects_school_id_code_key" ON "subjects"("school_id", "code");
CREATE INDEX "subjects_school_id_status_name_idx" ON "subjects"("school_id", "status", "name");
CREATE UNIQUE INDEX "teaching_assignments_academic_year_id_class_id_subject_id_key" ON "teaching_assignments"("academic_year_id", "class_id", "subject_id");
CREATE INDEX "teaching_assignments_school_id_academic_year_id_status_idx" ON "teaching_assignments"("school_id", "academic_year_id", "status");
CREATE INDEX "teaching_assignments_teacher_user_id_academic_year_id_idx" ON "teaching_assignments"("teacher_user_id", "academic_year_id");

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['subjects', 'teaching_assignments'] LOOP
    EXECUTE format('CREATE TRIGGER trg_%1$s_updated_at BEFORE UPDATE ON %1$I FOR EACH ROW EXECUTE FUNCTION set_updated_at()', t);
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'CREATE POLICY school_isolation ON %I USING (current_school_id() IS NULL OR school_id = current_school_id()) WITH CHECK (current_school_id() IS NULL OR school_id = current_school_id())', t
    );
  END LOOP;
END $$;
