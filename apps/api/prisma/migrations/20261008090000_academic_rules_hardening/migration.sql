-- Fiabilisation des matières, évaluations et bulletins.

CREATE TYPE "absence_handling" AS ENUM ('EXCLUDE', 'ZERO');

ALTER TABLE "teaching_assignments"
  ADD COLUMN "coefficient" INTEGER NOT NULL DEFAULT 100,
  ADD CONSTRAINT "teaching_assignments_coefficient_valid"
    CHECK (coefficient BETWEEN 1 AND 10000);

ALTER TABLE "grading_policies"
  ADD COLUMN "absence_handling" "absence_handling" NOT NULL DEFAULT 'EXCLUDE';

-- Une seule règle générale active et une seule règle active par cycle.
CREATE UNIQUE INDEX "grading_policies_one_active_general_key"
  ON "grading_policies" ("school_id", "academic_year_id")
  WHERE "is_active" = true AND "cycle" IS NULL;

CREATE UNIQUE INDEX "grading_policies_one_active_cycle_key"
  ON "grading_policies" ("school_id", "academic_year_id", "cycle")
  WHERE "is_active" = true AND "cycle" IS NOT NULL;

-- Les périodes d'une même année ne doivent jamais se chevaucher.
CREATE EXTENSION IF NOT EXISTS btree_gist;
ALTER TABLE "academic_periods"
  ADD CONSTRAINT "academic_periods_no_overlap"
  EXCLUDE USING gist (
    "academic_year_id" WITH =,
    daterange("start_date", "end_date", '[]') WITH &&
  );

CREATE INDEX "teaching_assignments_subject_id_idx"
  ON "teaching_assignments" ("subject_id");
