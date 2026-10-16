CREATE OR REPLACE FUNCTION seed_school_organization() RETURNS trigger AS $$
BEGIN
  INSERT INTO organizational_units (school_id, code, name, order_index) VALUES
    (NEW.id,'CRECHE','Crèche',10),(NEW.id,'MATERNELLE','Maternelle',20),(NEW.id,'PRIMAIRE','Primaire',30),(NEW.id,'SECONDAIRE','Secondaire',40);
  INSERT INTO language_sections (school_id,organizational_unit_id,code,name)
    SELECT NEW.id,u.id,s.code::language_section_code,s.name FROM organizational_units u CROSS JOIN (VALUES('FRANCOPHONE','Francophone'),('ANGLOPHONE','Anglophone')) s(code,name) WHERE u.school_id=NEW.id;
  INSERT INTO education_tracks (school_id,organizational_unit_id,code,name)
    SELECT NEW.id,u.id,s.code::education_track_code,s.name FROM organizational_units u CROSS JOIN (VALUES('GENERAL','Enseignement général'),('TECHNIQUE','Enseignement technique')) s(code,name) WHERE u.school_id=NEW.id AND u.code='SECONDAIRE';
  INSERT INTO staff_departments(id,school_id,code,name) SELECT uuidv7(),NEW.id,v.code,v.name FROM (VALUES('DIRECTION','Direction'),('SCOLARITE','Scolarité'),('VIE_SCOLAIRE','Vie scolaire'),('FINANCES','Finances'),('RESSOURCES_HUMAINES','Ressources humaines'),('INFORMATIQUE','Informatique'),('COMMUNICATION','Communication'))v(code,name);
  INSERT INTO staff_positions(id,school_id,department_id,code,name,rank,is_management)
    SELECT uuidv7(),NEW.id,d.id,v.code,v.name,v.rank,v.management FROM (VALUES
    ('PROMOTEUR','Promoteur','DIRECTION',1,true),('DIRECTEUR','Directeur','DIRECTION',10,true),('PRINCIPAL','Principal','DIRECTION',20,true),('RESP_CRECHE','Responsable crèche','DIRECTION',30,true),('RESP_MATERNELLE','Responsable maternelle','DIRECTION',30,true),('RESP_PRIMAIRE','Responsable primaire','DIRECTION',30,true),('RESP_ANGLOPHONE','Responsable anglophone','SCOLARITE',40,true),('SECRETARIAT','Secrétariat','SCOLARITE',70,false),('PREFET_ETUDES','Préfet des études','VIE_SCOLAIRE',40,true),('SURVEILLANT_GENERAL','Surveillant général','VIE_SCOLAIRE',50,true),('ECONOME','Économe / intendant','FINANCES',40,true),('CAISSIER','Caissier','FINANCES',80,false),('RESP_RH','Responsable RH','RESSOURCES_HUMAINES',40,true),('ADMIN_IT','Administrateur informatique','INFORMATIQUE',50,true),('RESP_COMMUNICATION','Responsable communication','COMMUNICATION',50,true),('ENSEIGNANT','Enseignant','SCOLARITE',100,false)
    )v(code,name,department_code,rank,management) JOIN staff_departments d ON d.school_id=NEW.id AND d.code=v.department_code;
  INSERT INTO cash_registers(id,school_id,organizational_unit_id,code,name) SELECT uuidv7(),NEW.id,u.id,'CAISSE-'||u.code::text,'Caisse '||u.name FROM organizational_units u WHERE u.school_id=NEW.id;
  RETURN NEW;
END; $$ LANGUAGE plpgsql;

DO $$ BEGIN IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='cplan_app') THEN
  GRANT SELECT,INSERT,UPDATE,DELETE ON staff_departments,staff_positions,cash_registers,receipt_sequences,budgets,budget_lines TO cplan_app;
END IF; END $$;
