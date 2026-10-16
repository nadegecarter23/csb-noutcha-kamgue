-- CSB-02 — affectations du personnel et périmètres d’accès indépendants des rôles.

CREATE TABLE "staff_assignments" (
  "id" uuid PRIMARY KEY DEFAULT uuidv7(),
  "school_id" uuid NOT NULL REFERENCES "schools"("id") ON DELETE CASCADE,
  "staff_profile_id" uuid NOT NULL REFERENCES "staff_profiles"("id") ON DELETE CASCADE,
  "scope_type" "access_scope_type" NOT NULL,
  "organizational_unit_id" uuid REFERENCES "organizational_units"("id") ON DELETE RESTRICT,
  "language_section_id" uuid REFERENCES "language_sections"("id") ON DELETE RESTRICT,
  "education_track_id" uuid REFERENCES "education_tracks"("id") ON DELETE RESTRICT,
  "class_id" uuid REFERENCES "classes"("id") ON DELETE RESTRICT,
  "is_primary" boolean NOT NULL DEFAULT false,
  "starts_at" date,
  "ends_at" date,
  "status" "reference_status" NOT NULL DEFAULT 'ACTIVE',
  "created_at" timestamptz(3) NOT NULL DEFAULT now(),
  "updated_at" timestamptz(3) NOT NULL DEFAULT now(),
  CONSTRAINT "staff_assignments_dates_check" CHECK ("ends_at" IS NULL OR "starts_at" IS NULL OR "ends_at" >= "starts_at")
);

CREATE TABLE "user_access_scopes" (
  "id" uuid PRIMARY KEY DEFAULT uuidv7(),
  "school_id" uuid NOT NULL REFERENCES "schools"("id") ON DELETE CASCADE,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "scope_type" "access_scope_type" NOT NULL,
  "organizational_unit_id" uuid REFERENCES "organizational_units"("id") ON DELETE CASCADE,
  "language_section_id" uuid REFERENCES "language_sections"("id") ON DELETE CASCADE,
  "education_track_id" uuid REFERENCES "education_tracks"("id") ON DELETE CASCADE,
  "class_id" uuid REFERENCES "classes"("id") ON DELETE CASCADE,
  "granted_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "created_at" timestamptz(3) NOT NULL DEFAULT now()
);

CREATE INDEX "staff_assignments_school_id_staff_profile_id_status_idx"
  ON "staff_assignments" ("school_id", "staff_profile_id", "status");
CREATE INDEX "staff_assignments_targets_idx"
  ON "staff_assignments" ("organizational_unit_id", "language_section_id", "education_track_id", "class_id");
CREATE INDEX "user_access_scopes_school_id_user_id_scope_type_idx"
  ON "user_access_scopes" ("school_id", "user_id", "scope_type");
CREATE INDEX "user_access_scopes_targets_idx"
  ON "user_access_scopes" ("organizational_unit_id", "language_section_id", "education_track_id", "class_id");
CREATE UNIQUE INDEX "user_access_scopes_school_unique"
  ON "user_access_scopes" ("school_id", "user_id", "scope_type")
  WHERE "scope_type" IN ('SCHOOL', 'OWN_ASSIGNMENTS');
CREATE UNIQUE INDEX "user_access_scopes_unit_unique"
  ON "user_access_scopes" ("school_id", "user_id", "organizational_unit_id")
  WHERE "scope_type" = 'UNIT';
CREATE UNIQUE INDEX "user_access_scopes_section_unique"
  ON "user_access_scopes" ("school_id", "user_id", "language_section_id")
  WHERE "scope_type" = 'LANGUAGE_SECTION';
CREATE UNIQUE INDEX "user_access_scopes_track_unique"
  ON "user_access_scopes" ("school_id", "user_id", "education_track_id")
  WHERE "scope_type" = 'TRACK';
CREATE UNIQUE INDEX "user_access_scopes_class_unique"
  ON "user_access_scopes" ("school_id", "user_id", "class_id")
  WHERE "scope_type" = 'CLASS';

CREATE OR REPLACE FUNCTION validate_access_scope_target() RETURNS trigger AS $$
DECLARE
  target_count integer;
BEGIN
  target_count := num_nonnulls(
    NEW.organizational_unit_id,
    NEW.language_section_id,
    NEW.education_track_id,
    NEW.class_id
  );
  IF NEW.scope_type IN ('SCHOOL', 'OWN_ASSIGNMENTS') AND target_count <> 0 THEN
    RAISE EXCEPTION 'Une portée SCHOOL ou OWN_ASSIGNMENTS ne possède pas de cible';
  ELSIF NEW.scope_type = 'UNIT' AND (
    target_count <> 1 OR NEW.organizational_unit_id IS NULL OR
    NOT EXISTS (SELECT 1 FROM organizational_units WHERE id = NEW.organizational_unit_id AND school_id = NEW.school_id)
  ) THEN
    RAISE EXCEPTION 'Cible unité invalide';
  ELSIF NEW.scope_type = 'LANGUAGE_SECTION' AND (
    target_count <> 1 OR NEW.language_section_id IS NULL OR
    NOT EXISTS (SELECT 1 FROM language_sections WHERE id = NEW.language_section_id AND school_id = NEW.school_id)
  ) THEN
    RAISE EXCEPTION 'Cible section invalide';
  ELSIF NEW.scope_type = 'TRACK' AND (
    target_count <> 1 OR NEW.education_track_id IS NULL OR
    NOT EXISTS (SELECT 1 FROM education_tracks WHERE id = NEW.education_track_id AND school_id = NEW.school_id)
  ) THEN
    RAISE EXCEPTION 'Cible filière invalide';
  ELSIF NEW.scope_type = 'CLASS' AND (
    target_count <> 1 OR NEW.class_id IS NULL OR
    NOT EXISTS (SELECT 1 FROM classes WHERE id = NEW.class_id AND school_id = NEW.school_id)
  ) THEN
    RAISE EXCEPTION 'Cible classe invalide';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_staff_assignments_validate BEFORE INSERT OR UPDATE ON "staff_assignments"
  FOR EACH ROW EXECUTE FUNCTION validate_access_scope_target();
CREATE TRIGGER trg_user_access_scopes_validate BEFORE INSERT OR UPDATE ON "user_access_scopes"
  FOR EACH ROW EXECUTE FUNCTION validate_access_scope_target();
CREATE TRIGGER trg_staff_assignments_updated_at BEFORE UPDATE ON "staff_assignments"
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Compatibilité contrôlée : les comptes historiquement globaux gardent leur
-- visibilité. Les comptes exclusivement enseignants sont limités à leurs
-- propres affectations pédagogiques.
INSERT INTO "user_access_scopes" ("school_id", "user_id", "scope_type")
SELECT DISTINCT ur.school_id, ur.user_id,
  CASE
    WHEN bool_and(r.code = 'TEACHER') THEN 'OWN_ASSIGNMENTS'::"access_scope_type"
    ELSE 'SCHOOL'::"access_scope_type"
  END
FROM "user_roles" ur
JOIN "roles" r ON r.id = ur.role_id
WHERE ur.school_id IS NOT NULL
GROUP BY ur.school_id, ur.user_id;

INSERT INTO "staff_assignments" (
  "school_id", "staff_profile_id", "scope_type", "class_id", "is_primary"
)
SELECT DISTINCT ta.school_id, sp.id, 'CLASS'::"access_scope_type", ta.class_id, false
FROM "teaching_assignments" ta
JOIN "staff_profiles" sp
  ON sp.school_id = ta.school_id AND sp.user_id = ta.teacher_user_id
WHERE ta.teacher_user_id IS NOT NULL;

INSERT INTO "staff_assignments" (
  "school_id", "staff_profile_id", "scope_type", "is_primary"
)
SELECT sp.school_id, sp.id, 'SCHOOL'::"access_scope_type", true
FROM "staff_profiles" sp
WHERE NOT EXISTS (
  SELECT 1 FROM "staff_assignments" sa WHERE sa.staff_profile_id = sp.id
);

ALTER TABLE "staff_assignments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "user_access_scopes" ENABLE ROW LEVEL SECURITY;
CREATE POLICY school_isolation ON "staff_assignments"
  USING (current_school_id() IS NULL OR school_id = current_school_id())
  WITH CHECK (current_school_id() IS NULL OR school_id = current_school_id());
CREATE POLICY school_isolation ON "user_access_scopes"
  USING (current_school_id() IS NULL OR school_id = current_school_id())
  WITH CHECK (current_school_id() IS NULL OR school_id = current_school_id());

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'cplan_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON staff_assignments, user_access_scopes TO cplan_app;
  END IF;
END $$;
