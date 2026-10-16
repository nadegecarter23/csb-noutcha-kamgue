ALTER TABLE suppliers ADD COLUMN organizational_unit_id uuid REFERENCES organizational_units(id) ON DELETE RESTRICT;
CREATE INDEX suppliers_school_unit_status_name_idx ON suppliers(school_id,organizational_unit_id,status,name);
