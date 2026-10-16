CREATE TABLE staff_departments (
  id uuid PRIMARY KEY DEFAULT uuidv7(), school_id uuid NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  organizational_unit_id uuid REFERENCES organizational_units(id) ON DELETE RESTRICT,
  code text NOT NULL, name text NOT NULL, status reference_status NOT NULL DEFAULT 'ACTIVE',
  CONSTRAINT staff_departments_school_code_key UNIQUE (school_id, code)
);
CREATE INDEX staff_departments_school_unit_status_idx ON staff_departments(school_id, organizational_unit_id, status);

CREATE TABLE staff_positions (
  id uuid PRIMARY KEY DEFAULT uuidv7(), school_id uuid NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  department_id uuid REFERENCES staff_departments(id) ON DELETE SET NULL,
  code text NOT NULL, name text NOT NULL, rank integer NOT NULL DEFAULT 100,
  is_management boolean NOT NULL DEFAULT false, status reference_status NOT NULL DEFAULT 'ACTIVE',
  CONSTRAINT staff_positions_school_code_key UNIQUE (school_id, code)
);
CREATE INDEX staff_positions_school_department_status_rank_idx ON staff_positions(school_id, department_id, status, rank);

ALTER TABLE staff_profiles ADD COLUMN department_id uuid REFERENCES staff_departments(id) ON DELETE SET NULL;
ALTER TABLE staff_profiles ADD COLUMN position_id uuid REFERENCES staff_positions(id) ON DELETE SET NULL;
ALTER TABLE staff_profiles ADD COLUMN supervisor_id uuid REFERENCES staff_profiles(id) ON DELETE SET NULL;
ALTER TABLE staff_profiles ADD COLUMN is_staff_delegate boolean NOT NULL DEFAULT false;
CREATE INDEX staff_profiles_school_department_position_status_idx ON staff_profiles(school_id, department_id, position_id, status);
CREATE INDEX staff_profiles_supervisor_id_idx ON staff_profiles(supervisor_id);

INSERT INTO staff_departments(id, school_id, code, name)
SELECT uuidv7(), s.id, v.code, v.name FROM schools s CROSS JOIN (VALUES
 ('DIRECTION','Direction'),('SCOLARITE','Scolarité'),('VIE_SCOLAIRE','Vie scolaire'),('FINANCES','Finances'),
 ('RESSOURCES_HUMAINES','Ressources humaines'),('INFORMATIQUE','Informatique'),('COMMUNICATION','Communication')
) v(code,name) ON CONFLICT DO NOTHING;

INSERT INTO staff_positions(id, school_id, department_id, code, name, rank, is_management)
SELECT uuidv7(), s.id, d.id, v.code, v.name, v.rank, v.management
FROM schools s CROSS JOIN (VALUES
 ('PROMOTEUR','Promoteur','DIRECTION',1,true),('DIRECTEUR','Directeur','DIRECTION',10,true),
 ('PRINCIPAL','Principal','DIRECTION',20,true),('RESP_CRECHE','Responsable crèche','DIRECTION',30,true),
 ('RESP_MATERNELLE','Responsable maternelle','DIRECTION',30,true),('RESP_PRIMAIRE','Responsable primaire','DIRECTION',30,true),
 ('RESP_ANGLOPHONE','Responsable anglophone','SCOLARITE',40,true),('SECRETARIAT','Secrétariat','SCOLARITE',70,false),
 ('PREFET_ETUDES','Préfet des études','VIE_SCOLAIRE',40,true),('SURVEILLANT_GENERAL','Surveillant général','VIE_SCOLAIRE',50,true),
 ('ECONOME','Économe / intendant','FINANCES',40,true),('CAISSIER','Caissier','FINANCES',80,false),
 ('RESP_RH','Responsable RH','RESSOURCES_HUMAINES',40,true),('ADMIN_IT','Administrateur informatique','INFORMATIQUE',50,true),
 ('RESP_COMMUNICATION','Responsable communication','COMMUNICATION',50,true),('ENSEIGNANT','Enseignant','SCOLARITE',100,false)
) v(code,name,department_code,rank,management)
JOIN staff_departments d ON d.school_id=s.id AND d.code=v.department_code ON CONFLICT DO NOTHING;

ALTER TABLE staff_departments ENABLE ROW LEVEL SECURITY;
ALTER TABLE staff_positions ENABLE ROW LEVEL SECURITY;
CREATE POLICY school_and_internal_scope ON staff_departments FOR ALL USING
 (current_school_id() IS NULL OR (school_id=current_school_id() AND scope_allows_organization(organizational_unit_id,NULL,NULL,NULL)))
 WITH CHECK (current_school_id() IS NULL OR (school_id=current_school_id() AND scope_allows_organization(organizational_unit_id,NULL,NULL,NULL)));
CREATE POLICY school_and_internal_scope ON staff_positions FOR ALL USING
 (current_school_id() IS NULL OR school_id=current_school_id()) WITH CHECK (current_school_id() IS NULL OR school_id=current_school_id());

