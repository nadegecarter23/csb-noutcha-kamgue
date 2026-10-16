ALTER TABLE fee_structures ADD COLUMN organizational_unit_id uuid REFERENCES organizational_units(id) ON DELETE RESTRICT;
ALTER TABLE student_fee_assignments ADD COLUMN organizational_unit_id uuid REFERENCES organizational_units(id) ON DELETE RESTRICT;
ALTER TABLE payment_targets ADD COLUMN organizational_unit_id uuid REFERENCES organizational_units(id) ON DELETE RESTRICT;
ALTER TABLE payment_allocations ADD COLUMN organizational_unit_id uuid REFERENCES organizational_units(id) ON DELETE RESTRICT;
ALTER TABLE receipts ADD COLUMN organizational_unit_id uuid REFERENCES organizational_units(id) ON DELETE RESTRICT;
ALTER TABLE cash_sessions ADD COLUMN organizational_unit_id uuid REFERENCES organizational_units(id) ON DELETE RESTRICT;
ALTER TABLE expense_categories ADD COLUMN organizational_unit_id uuid REFERENCES organizational_units(id) ON DELETE RESTRICT;
ALTER TABLE purchase_orders ADD COLUMN organizational_unit_id uuid REFERENCES organizational_units(id) ON DELETE RESTRICT;
ALTER TABLE expenses ADD COLUMN organizational_unit_id uuid REFERENCES organizational_units(id) ON DELETE RESTRICT;
ALTER TABLE supplier_payments ADD COLUMN organizational_unit_id uuid REFERENCES organizational_units(id) ON DELETE RESTRICT;

UPDATE fee_structures f SET organizational_unit_id=COALESCE((SELECT c.organizational_unit_id FROM classes c WHERE c.id=f.class_id),(SELECT g.organizational_unit_id FROM grade_levels g WHERE g.id=f.grade_level_id)) WHERE f.organizational_unit_id IS NULL;
UPDATE student_fee_assignments a SET organizational_unit_id=c.organizational_unit_id FROM enrollments e JOIN classes c ON c.id=e.class_id WHERE e.id=a.enrollment_id;
UPDATE payment_targets t SET organizational_unit_id=c.organizational_unit_id FROM enrollments e JOIN classes c ON c.id=e.class_id WHERE e.id=t.enrollment_id;
UPDATE payment_allocations a SET organizational_unit_id=c.organizational_unit_id FROM enrollments e JOIN classes c ON c.id=e.class_id WHERE e.id=a.enrollment_id;
UPDATE receipts r SET organizational_unit_id=x.organizational_unit_id FROM (SELECT payment_id,min(organizational_unit_id::text)::uuid organizational_unit_id FROM payment_allocations WHERE organizational_unit_id IS NOT NULL GROUP BY payment_id HAVING count(DISTINCT organizational_unit_id)=1) x WHERE x.payment_id=r.payment_id;

CREATE TABLE cash_registers(id uuid PRIMARY KEY DEFAULT uuidv7(),school_id uuid NOT NULL REFERENCES schools(id) ON DELETE RESTRICT,organizational_unit_id uuid NOT NULL REFERENCES organizational_units(id) ON DELETE RESTRICT,code text NOT NULL,name text NOT NULL,status reference_status NOT NULL DEFAULT 'ACTIVE',created_at timestamptz(3) NOT NULL DEFAULT now(),updated_at timestamptz(3) NOT NULL DEFAULT now(),UNIQUE(school_id,code));
CREATE INDEX cash_registers_school_unit_status_idx ON cash_registers(school_id,organizational_unit_id,status);
INSERT INTO cash_registers(id,school_id,organizational_unit_id,code,name) SELECT uuidv7(),school_id,id,'CAISSE-'||code::text,'Caisse '||name FROM organizational_units ON CONFLICT DO NOTHING;
ALTER TABLE cash_sessions ADD COLUMN cash_register_id uuid REFERENCES cash_registers(id) ON DELETE RESTRICT;
UPDATE cash_sessions s SET organizational_unit_id=r.organizational_unit_id,cash_register_id=r.id FROM cash_registers r WHERE r.school_id=s.school_id AND r.code=(SELECT 'CAISSE-'||code::text FROM organizational_units WHERE school_id=s.school_id ORDER BY order_index LIMIT 1);

CREATE TABLE receipt_sequences(school_id uuid NOT NULL,organizational_unit_id uuid NOT NULL,cash_register_id uuid NOT NULL REFERENCES cash_registers(id) ON DELETE RESTRICT,period text NOT NULL,current_value bigint NOT NULL DEFAULT 0,PRIMARY KEY(school_id,organizational_unit_id,cash_register_id,period));
CREATE TABLE budgets(id uuid PRIMARY KEY DEFAULT uuidv7(),school_id uuid NOT NULL REFERENCES schools(id) ON DELETE RESTRICT,organizational_unit_id uuid NOT NULL REFERENCES organizational_units(id) ON DELETE RESTRICT,fiscal_year integer NOT NULL,name text NOT NULL,status reference_status NOT NULL DEFAULT 'ACTIVE',created_at timestamptz(3) NOT NULL DEFAULT now(),updated_at timestamptz(3) NOT NULL DEFAULT now(),UNIQUE(organizational_unit_id,fiscal_year));
CREATE INDEX budgets_school_year_status_idx ON budgets(school_id,fiscal_year,status);
CREATE TABLE budget_lines(id uuid PRIMARY KEY DEFAULT uuidv7(),budget_id uuid NOT NULL REFERENCES budgets(id) ON DELETE CASCADE,expense_category_id uuid NOT NULL REFERENCES expense_categories(id) ON DELETE RESTRICT,planned_amount bigint NOT NULL CHECK(planned_amount>=0),UNIQUE(budget_id,expense_category_id));

CREATE INDEX fee_structures_school_unit_year_status_idx ON fee_structures(school_id,organizational_unit_id,academic_year_id,status);
CREATE INDEX student_fee_assignments_school_unit_status_idx ON student_fee_assignments(school_id,organizational_unit_id,status);
CREATE INDEX payment_targets_school_unit_idx ON payment_targets(school_id,organizational_unit_id);
CREATE INDEX payment_allocations_school_unit_created_idx ON payment_allocations(school_id,organizational_unit_id,created_at);
CREATE INDEX receipts_school_unit_issued_idx ON receipts(school_id,organizational_unit_id,issued_at);
CREATE INDEX cash_sessions_school_unit_status_opened_idx ON cash_sessions(school_id,organizational_unit_id,status,opened_at DESC);
CREATE INDEX purchase_orders_school_unit_status_created_idx ON purchase_orders(school_id,organizational_unit_id,status,created_at DESC);
CREATE INDEX expenses_school_unit_status_due_idx ON expenses(school_id,organizational_unit_id,status,due_date);
CREATE INDEX supplier_payments_school_unit_paid_idx ON supplier_payments(school_id,organizational_unit_id,paid_at DESC);

ALTER TABLE cash_registers ENABLE ROW LEVEL SECURITY; ALTER TABLE receipt_sequences ENABLE ROW LEVEL SECURITY; ALTER TABLE budgets ENABLE ROW LEVEL SECURITY; ALTER TABLE budget_lines ENABLE ROW LEVEL SECURITY;
CREATE POLICY school_and_internal_scope ON cash_registers FOR ALL USING(current_school_id() IS NULL OR (school_id=current_school_id() AND scope_allows_organization(organizational_unit_id,NULL,NULL,NULL))) WITH CHECK(current_school_id() IS NULL OR (school_id=current_school_id() AND scope_allows_organization(organizational_unit_id,NULL,NULL,NULL)));
CREATE POLICY school_and_internal_scope ON budgets FOR ALL USING(current_school_id() IS NULL OR (school_id=current_school_id() AND scope_allows_organization(organizational_unit_id,NULL,NULL,NULL))) WITH CHECK(current_school_id() IS NULL OR (school_id=current_school_id() AND scope_allows_organization(organizational_unit_id,NULL,NULL,NULL)));
CREATE POLICY school_and_internal_scope ON receipt_sequences FOR ALL USING(current_school_id() IS NULL OR (school_id=current_school_id() AND scope_allows_organization(organizational_unit_id,NULL,NULL,NULL))) WITH CHECK(current_school_id() IS NULL OR (school_id=current_school_id() AND scope_allows_organization(organizational_unit_id,NULL,NULL,NULL)));
CREATE POLICY school_and_internal_scope ON budget_lines FOR ALL USING(current_school_id() IS NULL OR EXISTS(SELECT 1 FROM budgets b WHERE b.id=budget_id AND b.school_id=current_school_id() AND scope_allows_organization(b.organizational_unit_id,NULL,NULL,NULL))) WITH CHECK(current_school_id() IS NULL OR EXISTS(SELECT 1 FROM budgets b WHERE b.id=budget_id AND b.school_id=current_school_id() AND scope_allows_organization(b.organizational_unit_id,NULL,NULL,NULL)));

CREATE OR REPLACE FUNCTION enforce_unit_accounting() RETURNS trigger LANGUAGE plpgsql AS $$ DECLARE expected uuid; BEGIN
 IF TG_TABLE_NAME IN ('student_fee_assignments','payment_targets','payment_allocations') THEN SELECT c.organizational_unit_id INTO expected FROM enrollments e JOIN classes c ON c.id=e.class_id WHERE e.id=NEW.enrollment_id; IF expected IS NOT NULL AND NEW.organizational_unit_id IS DISTINCT FROM expected THEN RAISE EXCEPTION 'accounting unit must match enrollment unit'; END IF; END IF; RETURN NEW; END $$;
CREATE TRIGGER fee_assignment_unit_guard BEFORE INSERT OR UPDATE ON student_fee_assignments FOR EACH ROW EXECUTE FUNCTION enforce_unit_accounting();
CREATE TRIGGER payment_target_unit_guard BEFORE INSERT OR UPDATE ON payment_targets FOR EACH ROW EXECUTE FUNCTION enforce_unit_accounting();
CREATE TRIGGER payment_allocation_unit_guard BEFORE INSERT OR UPDATE ON payment_allocations FOR EACH ROW EXECUTE FUNCTION enforce_unit_accounting();

