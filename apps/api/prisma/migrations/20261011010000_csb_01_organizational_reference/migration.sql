-- CSB-01 — référentiel organisationnel du Complexe Scolaire Bilingue.

CREATE TYPE "organizational_unit_code" AS ENUM ('CRECHE', 'MATERNELLE', 'PRIMAIRE', 'SECONDAIRE');
CREATE TYPE "language_section_code" AS ENUM ('FRANCOPHONE', 'ANGLOPHONE');
CREATE TYPE "education_track_code" AS ENUM ('GENERAL', 'TECHNIQUE');
CREATE TYPE "access_scope_type" AS ENUM ('SCHOOL', 'UNIT', 'LANGUAGE_SECTION', 'TRACK', 'CLASS', 'OWN_ASSIGNMENTS');

-- Remplace l'ancien découpage COLLEGE/LYCEE par l'unique cycle SECONDAIRE.
CREATE TYPE "education_cycle_new" AS ENUM ('CRECHE', 'MATERNELLE', 'PRIMAIRE', 'SECONDAIRE');
ALTER TABLE "grade_levels" ALTER COLUMN "cycle" TYPE "education_cycle_new"
USING (
  CASE
    WHEN "cycle"::text IN ('COLLEGE', 'LYCEE') THEN 'SECONDAIRE'
    WHEN "cycle"::text = 'MATERNELLE' THEN 'MATERNELLE'
    WHEN "cycle"::text = 'PRIMAIRE' THEN 'PRIMAIRE'
    ELSE NULL
  END
)::"education_cycle_new";
ALTER TABLE "grading_policies" ALTER COLUMN "cycle" TYPE "education_cycle_new"
USING (
  CASE
    WHEN "cycle"::text IN ('COLLEGE', 'LYCEE') THEN 'SECONDAIRE'
    WHEN "cycle"::text = 'MATERNELLE' THEN 'MATERNELLE'
    WHEN "cycle"::text = 'PRIMAIRE' THEN 'PRIMAIRE'
    ELSE NULL
  END
)::"education_cycle_new";
DROP TYPE "education_cycle";
ALTER TYPE "education_cycle_new" RENAME TO "education_cycle";

CREATE TABLE "organizational_units" (
  "id" uuid PRIMARY KEY DEFAULT uuidv7(),
  "school_id" uuid NOT NULL REFERENCES "schools"("id") ON DELETE CASCADE,
  "code" "organizational_unit_code" NOT NULL,
  "name" text NOT NULL,
  "order_index" integer NOT NULL,
  "status" "reference_status" NOT NULL DEFAULT 'ACTIVE',
  "created_at" timestamptz(3) NOT NULL DEFAULT now(),
  "updated_at" timestamptz(3) NOT NULL DEFAULT now(),
  CONSTRAINT "organizational_units_school_id_code_key" UNIQUE ("school_id", "code")
);

CREATE TABLE "language_sections" (
  "id" uuid PRIMARY KEY DEFAULT uuidv7(),
  "school_id" uuid NOT NULL REFERENCES "schools"("id") ON DELETE CASCADE,
  "organizational_unit_id" uuid NOT NULL REFERENCES "organizational_units"("id") ON DELETE CASCADE,
  "code" "language_section_code" NOT NULL,
  "name" text NOT NULL,
  "status" "reference_status" NOT NULL DEFAULT 'ACTIVE',
  "created_at" timestamptz(3) NOT NULL DEFAULT now(),
  "updated_at" timestamptz(3) NOT NULL DEFAULT now(),
  CONSTRAINT "language_sections_organizational_unit_id_code_key" UNIQUE ("organizational_unit_id", "code")
);

CREATE TABLE "education_tracks" (
  "id" uuid PRIMARY KEY DEFAULT uuidv7(),
  "school_id" uuid NOT NULL REFERENCES "schools"("id") ON DELETE CASCADE,
  "organizational_unit_id" uuid NOT NULL REFERENCES "organizational_units"("id") ON DELETE CASCADE,
  "code" "education_track_code" NOT NULL,
  "name" text NOT NULL,
  "status" "reference_status" NOT NULL DEFAULT 'ACTIVE',
  "created_at" timestamptz(3) NOT NULL DEFAULT now(),
  "updated_at" timestamptz(3) NOT NULL DEFAULT now(),
  CONSTRAINT "education_tracks_organizational_unit_id_code_key" UNIQUE ("organizational_unit_id", "code")
);

CREATE INDEX "organizational_units_school_id_status_order_index_idx"
  ON "organizational_units" ("school_id", "status", "order_index");
CREATE INDEX "language_sections_school_id_organizational_unit_id_status_idx"
  ON "language_sections" ("school_id", "organizational_unit_id", "status");
CREATE INDEX "education_tracks_school_id_organizational_unit_id_status_idx"
  ON "education_tracks" ("school_id", "organizational_unit_id", "status");

INSERT INTO "organizational_units" ("school_id", "code", "name", "order_index")
SELECT s.id, seed.code::"organizational_unit_code", seed.name, seed.order_index
FROM "schools" s
CROSS JOIN (VALUES
  ('CRECHE', 'Crèche', 10),
  ('MATERNELLE', 'Maternelle', 20),
  ('PRIMAIRE', 'Primaire', 30),
  ('SECONDAIRE', 'Secondaire', 40)
) AS seed(code, name, order_index);

INSERT INTO "language_sections" ("school_id", "organizational_unit_id", "code", "name")
SELECT u.school_id, u.id, seed.code::"language_section_code", seed.name
FROM "organizational_units" u
CROSS JOIN (VALUES
  ('FRANCOPHONE', 'Francophone'),
  ('ANGLOPHONE', 'Anglophone')
) AS seed(code, name);

INSERT INTO "education_tracks" ("school_id", "organizational_unit_id", "code", "name")
SELECT u.school_id, u.id, seed.code::"education_track_code", seed.name
FROM "organizational_units" u
CROSS JOIN (VALUES
  ('GENERAL', 'Enseignement général'),
  ('TECHNIQUE', 'Enseignement technique')
) AS seed(code, name)
WHERE u.code = 'SECONDAIRE';

ALTER TABLE "grade_levels" ADD COLUMN "organizational_unit_id" uuid;
UPDATE "grade_levels" g
SET "organizational_unit_id" = u.id
FROM "organizational_units" u
WHERE u.school_id = g.school_id
  AND u.code::text = g.cycle::text;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "grade_levels" WHERE "organizational_unit_id" IS NULL) THEN
    RAISE EXCEPTION 'CSB-01: niveau sans cycle classable; corriger les données avant migration';
  END IF;
END $$;

ALTER TABLE "grade_levels" ALTER COLUMN "organizational_unit_id" SET NOT NULL;
ALTER TABLE "grade_levels" ADD CONSTRAINT "grade_levels_organizational_unit_id_fkey"
  FOREIGN KEY ("organizational_unit_id") REFERENCES "organizational_units"("id") ON DELETE RESTRICT;
CREATE INDEX "grade_levels_school_id_organizational_unit_id_status_order_idx"
  ON "grade_levels" ("school_id", "organizational_unit_id", "status", "order_index");

ALTER TABLE "classes" ADD COLUMN "organizational_unit_id" uuid;
ALTER TABLE "classes" ADD COLUMN "language_section_id" uuid;
ALTER TABLE "classes" ADD COLUMN "education_track_id" uuid;

UPDATE "classes" c
SET "organizational_unit_id" = g.organizational_unit_id
FROM "grade_levels" g
WHERE g.id = c.grade_level_id;

-- Les données historiques de démonstration ne comportaient pas la langue ni
-- la filière. Ce choix explicite est documenté dans ADR-021 et doit faire
-- l'objet d'une validation humaine avant toute migration de données réelles.
UPDATE "classes" c
SET "language_section_id" = ls.id
FROM "language_sections" ls
WHERE ls.school_id = c.school_id
  AND ls.organizational_unit_id = c.organizational_unit_id
  AND ls.code = 'FRANCOPHONE';

UPDATE "classes" c
SET "education_track_id" = et.id
FROM "education_tracks" et, "organizational_units" u
WHERE u.id = c.organizational_unit_id
  AND u.code = 'SECONDAIRE'
  AND et.organizational_unit_id = u.id
  AND et.code = 'GENERAL';

ALTER TABLE "classes" ALTER COLUMN "organizational_unit_id" SET NOT NULL;
ALTER TABLE "classes" ALTER COLUMN "language_section_id" SET NOT NULL;
ALTER TABLE "classes" ADD CONSTRAINT "classes_organizational_unit_id_fkey"
  FOREIGN KEY ("organizational_unit_id") REFERENCES "organizational_units"("id") ON DELETE RESTRICT;
ALTER TABLE "classes" ADD CONSTRAINT "classes_language_section_id_fkey"
  FOREIGN KEY ("language_section_id") REFERENCES "language_sections"("id") ON DELETE RESTRICT;
ALTER TABLE "classes" ADD CONSTRAINT "classes_education_track_id_fkey"
  FOREIGN KEY ("education_track_id") REFERENCES "education_tracks"("id") ON DELETE RESTRICT;
CREATE INDEX "classes_school_org_language_track_status_idx"
  ON "classes" ("school_id", "organizational_unit_id", "language_section_id", "education_track_id", "status");

CREATE OR REPLACE FUNCTION validate_organizational_reference() RETURNS trigger AS $$
DECLARE
  unit_code "organizational_unit_code";
BEGIN
  SELECT code INTO unit_code FROM organizational_units
  WHERE id = NEW.organizational_unit_id AND school_id = NEW.school_id;
  IF unit_code IS NULL THEN
    RAISE EXCEPTION 'Unité organisationnelle étrangère à l’établissement';
  END IF;
  IF TG_TABLE_NAME = 'education_tracks' AND unit_code <> 'SECONDAIRE' THEN
    RAISE EXCEPTION 'Une filière ne peut appartenir qu’au secondaire';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION validate_class_organization() RETURNS trigger AS $$
DECLARE
  unit_code "organizational_unit_code";
BEGIN
  -- Compatibilité des anciens imports/tests : le serveur moderne envoie ces
  -- champs explicitement, mais une insertion historique est normalisée avant
  -- le contrôle NOT NULL au lieu de créer une classe orpheline.
  IF NEW.organizational_unit_id IS NULL THEN
    SELECT organizational_unit_id INTO NEW.organizational_unit_id
    FROM grade_levels WHERE id = NEW.grade_level_id AND school_id = NEW.school_id;
  END IF;
  IF NEW.language_section_id IS NULL THEN
    SELECT id INTO NEW.language_section_id FROM language_sections
    WHERE school_id = NEW.school_id AND organizational_unit_id = NEW.organizational_unit_id
      AND code = 'FRANCOPHONE';
  END IF;
  IF NEW.education_track_id IS NULL THEN
    SELECT t.id INTO NEW.education_track_id
    FROM education_tracks t JOIN organizational_units u ON u.id = t.organizational_unit_id
    WHERE t.school_id = NEW.school_id AND t.organizational_unit_id = NEW.organizational_unit_id
      AND u.code = 'SECONDAIRE' AND t.code = 'GENERAL';
  END IF;
  SELECT u.code INTO unit_code
  FROM organizational_units u
  JOIN grade_levels g ON g.organizational_unit_id = u.id
  WHERE u.id = NEW.organizational_unit_id
    AND u.school_id = NEW.school_id
    AND g.id = NEW.grade_level_id
    AND g.school_id = NEW.school_id;
  IF unit_code IS NULL THEN
    RAISE EXCEPTION 'Le niveau, la classe et l’unité doivent appartenir au même périmètre';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM language_sections s
    WHERE s.id = NEW.language_section_id
      AND s.school_id = NEW.school_id
      AND s.organizational_unit_id = NEW.organizational_unit_id
  ) THEN
    RAISE EXCEPTION 'La section linguistique ne correspond pas à l’unité de la classe';
  END IF;
  IF unit_code = 'SECONDAIRE' THEN
    IF NEW.education_track_id IS NULL OR NOT EXISTS (
      SELECT 1 FROM education_tracks t
      WHERE t.id = NEW.education_track_id
        AND t.school_id = NEW.school_id
        AND t.organizational_unit_id = NEW.organizational_unit_id
    ) THEN
      RAISE EXCEPTION 'Une classe du secondaire doit avoir une filière valide';
    END IF;
  ELSIF NEW.education_track_id IS NOT NULL THEN
    RAISE EXCEPTION 'Une filière est interdite hors du secondaire';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION normalize_grade_level_organization() RETURNS trigger AS $$
BEGIN
  IF NEW.organizational_unit_id IS NULL THEN
    SELECT id INTO NEW.organizational_unit_id FROM organizational_units
    WHERE school_id = NEW.school_id
      AND code = COALESCE(NEW.cycle, 'PRIMAIRE')::text::organizational_unit_code;
  END IF;
  SELECT code::text::education_cycle INTO NEW.cycle
  FROM organizational_units
  WHERE id = NEW.organizational_unit_id AND school_id = NEW.school_id;
  IF NEW.organizational_unit_id IS NULL THEN
    RAISE EXCEPTION 'Un niveau doit appartenir à une unité organisationnelle';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_organizational_units_updated_at BEFORE UPDATE ON "organizational_units"
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_language_sections_updated_at BEFORE UPDATE ON "language_sections"
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_education_tracks_updated_at BEFORE UPDATE ON "education_tracks"
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_language_sections_validate BEFORE INSERT OR UPDATE ON "language_sections"
  FOR EACH ROW EXECUTE FUNCTION validate_organizational_reference();
CREATE TRIGGER trg_education_tracks_validate BEFORE INSERT OR UPDATE ON "education_tracks"
  FOR EACH ROW EXECUTE FUNCTION validate_organizational_reference();
CREATE TRIGGER trg_grade_levels_normalize_organization BEFORE INSERT OR UPDATE OF
  "school_id", "cycle", "organizational_unit_id" ON "grade_levels"
  FOR EACH ROW EXECUTE FUNCTION normalize_grade_level_organization();
CREATE TRIGGER trg_classes_validate_organization BEFORE INSERT OR UPDATE OF
  "school_id", "grade_level_id", "organizational_unit_id", "language_section_id", "education_track_id"
  ON "classes" FOR EACH ROW EXECUTE FUNCTION validate_class_organization();

CREATE OR REPLACE FUNCTION seed_school_organization() RETURNS trigger AS $$
BEGIN
  INSERT INTO organizational_units (school_id, code, name, order_index) VALUES
    (NEW.id, 'CRECHE', 'Crèche', 10),
    (NEW.id, 'MATERNELLE', 'Maternelle', 20),
    (NEW.id, 'PRIMAIRE', 'Primaire', 30),
    (NEW.id, 'SECONDAIRE', 'Secondaire', 40);
  INSERT INTO language_sections (school_id, organizational_unit_id, code, name)
  SELECT NEW.id, u.id, seed.code::language_section_code, seed.name
  FROM organizational_units u CROSS JOIN (VALUES
    ('FRANCOPHONE', 'Francophone'), ('ANGLOPHONE', 'Anglophone')
  ) AS seed(code, name)
  WHERE u.school_id = NEW.id;
  INSERT INTO education_tracks (school_id, organizational_unit_id, code, name)
  SELECT NEW.id, u.id, seed.code::education_track_code, seed.name
  FROM organizational_units u CROSS JOIN (VALUES
    ('GENERAL', 'Enseignement général'), ('TECHNIQUE', 'Enseignement technique')
  ) AS seed(code, name)
  WHERE u.school_id = NEW.id AND u.code = 'SECONDAIRE';
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER trg_schools_seed_organization AFTER INSERT ON schools
  FOR EACH ROW EXECUTE FUNCTION seed_school_organization();

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['organizational_units', 'language_sections', 'education_tracks'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'CREATE POLICY school_isolation ON %I USING (current_school_id() IS NULL OR school_id = current_school_id()) WITH CHECK (current_school_id() IS NULL OR school_id = current_school_id())',
      t
    );
  END LOOP;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'cplan_app') THEN
    GRANT SELECT, INSERT, UPDATE ON organizational_units, language_sections, education_tracks TO cplan_app;
  END IF;
END $$;
