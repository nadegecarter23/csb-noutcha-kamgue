CREATE TYPE evaluation_mode AS ENUM ('NUMERIC','QUALITATIVE');
ALTER TABLE subjects ADD COLUMN organizational_unit_id uuid REFERENCES organizational_units(id) ON DELETE RESTRICT;
ALTER TABLE subjects ADD COLUMN language_section_id uuid REFERENCES language_sections(id) ON DELETE RESTRICT;
ALTER TABLE subjects ADD COLUMN education_track_id uuid REFERENCES education_tracks(id) ON DELETE RESTRICT;
CREATE INDEX subjects_school_scope_status_idx ON subjects(school_id, organizational_unit_id, language_section_id, education_track_id, status);

ALTER TABLE grading_policies ADD COLUMN organizational_unit_id uuid REFERENCES organizational_units(id) ON DELETE RESTRICT;
ALTER TABLE grading_policies ADD COLUMN language_section_id uuid REFERENCES language_sections(id) ON DELETE RESTRICT;
ALTER TABLE grading_policies ADD COLUMN education_track_id uuid REFERENCES education_tracks(id) ON DELETE RESTRICT;
ALTER TABLE grading_policies ADD COLUMN evaluation_mode evaluation_mode NOT NULL DEFAULT 'NUMERIC';
CREATE INDEX grading_policies_scope_idx ON grading_policies(academic_year_id, organizational_unit_id, language_section_id, education_track_id, is_active);

CREATE OR REPLACE FUNCTION validate_subject_scope() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE u uuid; s uuid;
BEGIN
 IF NEW.language_section_id IS NOT NULL THEN SELECT organizational_unit_id, school_id INTO u,s FROM language_sections WHERE id=NEW.language_section_id; IF u IS DISTINCT FROM NEW.organizational_unit_id OR s IS DISTINCT FROM NEW.school_id THEN RAISE EXCEPTION 'invalid subject language scope'; END IF; END IF;
 IF NEW.education_track_id IS NOT NULL THEN SELECT organizational_unit_id, school_id INTO u,s FROM education_tracks WHERE id=NEW.education_track_id; IF u IS DISTINCT FROM NEW.organizational_unit_id OR s IS DISTINCT FROM NEW.school_id THEN RAISE EXCEPTION 'invalid subject track scope'; END IF; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER subjects_validate_scope BEFORE INSERT OR UPDATE ON subjects FOR EACH ROW EXECUTE FUNCTION validate_subject_scope();

INSERT INTO grade_levels(id,school_id,name,code,order_index,cycle,organizational_unit_id,status,updated_at)
SELECT uuidv7(),s.id,v.name,v.code,v.ord,v.cycle::education_cycle,u.id,'ACTIVE',now()
FROM schools s CROSS JOIN (VALUES
 ('Petite crèche','CRECHE-1',1,'CRECHE'),('Grande crèche','CRECHE-2',2,'CRECHE'),
 ('Petite section','MAT-PS',10,'MATERNELLE'),('Moyenne section','MAT-MS',11,'MATERNELLE'),('Grande section','MAT-GS',12,'MATERNELLE'),
 ('SIL / Class 1','PRI-1',20,'PRIMAIRE'),('CP / Class 2','PRI-2',21,'PRIMAIRE'),('CE1 / Class 3','PRI-3',22,'PRIMAIRE'),
 ('CE2 / Class 4','PRI-4',23,'PRIMAIRE'),('CM1 / Class 5','PRI-5',24,'PRIMAIRE'),('CM2 / Class 6','PRI-6',25,'PRIMAIRE'),
 ('Sixième / Form 1','SEC-1',30,'SECONDAIRE'),('Cinquième / Form 2','SEC-2',31,'SECONDAIRE'),
 ('Quatrième / Form 3','SEC-3',32,'SECONDAIRE'),('Troisième / Form 4','SEC-4',33,'SECONDAIRE'),
 ('Seconde / Form 5','SEC-5',34,'SECONDAIRE'),('Première / Lower Sixth','SEC-6',35,'SECONDAIRE'),('Terminale / Upper Sixth','SEC-7',36,'SECONDAIRE')
) v(name,code,ord,cycle) JOIN organizational_units u ON u.school_id=s.id AND u.code::text=v.cycle
ON CONFLICT (school_id,code) DO NOTHING;

UPDATE grading_policies SET evaluation_mode='QUALITATIVE' WHERE cycle IN ('CRECHE','MATERNELLE');

