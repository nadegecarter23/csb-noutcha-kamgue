-- Les tables de liaison pédagogiques contiennent des données métier et doivent
-- porter explicitement l'établissement afin que PostgreSQL applique la RLS.

ALTER TABLE "assessment_competencies" ADD COLUMN "school_id" UUID;
UPDATE "assessment_competencies" ac
SET "school_id" = a."school_id"
FROM "assessments" a
WHERE a."id" = ac."assessment_id";
ALTER TABLE "assessment_competencies"
  ALTER COLUMN "school_id" SET NOT NULL,
  ADD CONSTRAINT "assessment_competencies_school_id_fkey"
    FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE;
CREATE INDEX "assessment_competencies_school_id_idx"
  ON "assessment_competencies"("school_id");
ALTER TABLE "assessment_competencies" ENABLE ROW LEVEL SECURITY;
CREATE POLICY school_isolation ON "assessment_competencies"
  USING (current_school_id() IS NULL OR school_id = current_school_id())
  WITH CHECK (current_school_id() IS NULL OR school_id = current_school_id());

ALTER TABLE "report_card_subjects" ADD COLUMN "school_id" UUID;
UPDATE "report_card_subjects" rcs
SET "school_id" = rc."school_id"
FROM "report_cards" rc
WHERE rc."id" = rcs."report_card_id";
ALTER TABLE "report_card_subjects"
  ALTER COLUMN "school_id" SET NOT NULL,
  ADD CONSTRAINT "report_card_subjects_school_id_fkey"
    FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE;
CREATE INDEX "report_card_subjects_school_id_idx"
  ON "report_card_subjects"("school_id");
ALTER TABLE "report_card_subjects" ENABLE ROW LEVEL SECURITY;
CREATE POLICY school_isolation ON "report_card_subjects"
  USING (current_school_id() IS NULL OR school_id = current_school_id())
  WITH CHECK (current_school_id() IS NULL OR school_id = current_school_id());
