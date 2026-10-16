-- Phase 02 — référentiel scolaire

CREATE TYPE "academic_year_status" AS ENUM ('DRAFT', 'ACTIVE', 'CLOSED', 'ARCHIVED');
CREATE TYPE "reference_status" AS ENUM ('ACTIVE', 'INACTIVE');
CREATE TYPE "education_cycle" AS ENUM ('MATERNELLE', 'PRIMAIRE', 'COLLEGE', 'LYCEE', 'AUTRE');

ALTER TABLE "school_settings"
  ADD COLUMN "discount_approval_threshold" INTEGER NOT NULL DEFAULT 0,
  ADD CONSTRAINT "school_settings_discount_threshold_positive"
    CHECK (discount_approval_threshold >= 0);

CREATE TABLE "academic_years" (
  "id" UUID NOT NULL DEFAULT uuidv7(),
  "school_id" UUID NOT NULL,
  "name" TEXT NOT NULL,
  "start_date" DATE NOT NULL,
  "end_date" DATE NOT NULL,
  "status" "academic_year_status" NOT NULL DEFAULT 'DRAFT',
  "is_current" BOOLEAN NOT NULL DEFAULT false,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "academic_years_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "academic_years_dates_valid" CHECK (end_date > start_date),
  CONSTRAINT "academic_years_current_active" CHECK (NOT is_current OR status = 'ACTIVE'),
  CONSTRAINT "academic_years_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE
);

CREATE TABLE "grade_levels" (
  "id" UUID NOT NULL DEFAULT uuidv7(),
  "school_id" UUID NOT NULL,
  "name" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "order_index" INTEGER NOT NULL,
  "cycle" "education_cycle",
  "status" "reference_status" NOT NULL DEFAULT 'ACTIVE',
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "grade_levels_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "grade_levels_order_positive" CHECK (order_index >= 0),
  CONSTRAINT "grade_levels_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE
);

CREATE TABLE "classes" (
  "id" UUID NOT NULL DEFAULT uuidv7(),
  "school_id" UUID NOT NULL,
  "academic_year_id" UUID NOT NULL,
  "grade_level_id" UUID NOT NULL,
  "name" TEXT NOT NULL,
  "capacity" INTEGER,
  "head_teacher_user_id" UUID,
  "status" "reference_status" NOT NULL DEFAULT 'ACTIVE',
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "classes_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "classes_capacity_positive" CHECK (capacity IS NULL OR capacity > 0),
  CONSTRAINT "classes_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE,
  CONSTRAINT "classes_academic_year_id_fkey" FOREIGN KEY ("academic_year_id") REFERENCES "academic_years"("id") ON DELETE CASCADE,
  CONSTRAINT "classes_grade_level_id_fkey" FOREIGN KEY ("grade_level_id") REFERENCES "grade_levels"("id") ON DELETE RESTRICT,
  CONSTRAINT "classes_head_teacher_user_id_fkey" FOREIGN KEY ("head_teacher_user_id") REFERENCES "users"("id") ON DELETE SET NULL
);

CREATE TABLE "student_categories" (
  "id" UUID NOT NULL DEFAULT uuidv7(),
  "school_id" UUID NOT NULL,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "status" "reference_status" NOT NULL DEFAULT 'ACTIVE',
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "student_categories_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "student_categories_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE
);

CREATE UNIQUE INDEX "academic_years_school_id_name_key" ON "academic_years"("school_id", "name");
CREATE UNIQUE INDEX "uq_academic_years_current" ON "academic_years"("school_id") WHERE is_current;
CREATE INDEX "academic_years_school_id_status_idx" ON "academic_years"("school_id", "status");
CREATE UNIQUE INDEX "grade_levels_school_id_code_key" ON "grade_levels"("school_id", "code");
CREATE INDEX "grade_levels_school_id_status_order_index_idx" ON "grade_levels"("school_id", "status", "order_index");
CREATE UNIQUE INDEX "uq_classes_year_name" ON "classes"("school_id", "academic_year_id", lower("name"));
CREATE INDEX "classes_school_id_academic_year_id_grade_level_id_status_idx" ON "classes"("school_id", "academic_year_id", "grade_level_id", "status");
CREATE UNIQUE INDEX "student_categories_school_id_code_key" ON "student_categories"("school_id", "code");
CREATE INDEX "student_categories_school_id_status_idx" ON "student_categories"("school_id", "status");

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['academic_years', 'grade_levels', 'classes', 'student_categories'] LOOP
    EXECUTE format('CREATE TRIGGER trg_%1$s_updated_at BEFORE UPDATE ON %1$I FOR EACH ROW EXECUTE FUNCTION set_updated_at()', t);
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'CREATE POLICY school_isolation ON %I USING (current_school_id() IS NULL OR school_id = current_school_id()) WITH CHECK (current_school_id() IS NULL OR school_id = current_school_id())', t
    );
  END LOOP;
END $$;
