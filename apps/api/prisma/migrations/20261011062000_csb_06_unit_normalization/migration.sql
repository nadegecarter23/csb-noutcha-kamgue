CREATE OR REPLACE FUNCTION enforce_unit_accounting() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE expected uuid;
BEGIN
  IF TG_TABLE_NAME IN ('student_fee_assignments','payment_targets','payment_allocations') THEN
    SELECT c.organizational_unit_id INTO expected FROM enrollments e JOIN classes c ON c.id=e.class_id WHERE e.id=NEW.enrollment_id;
    IF NEW.organizational_unit_id IS NULL THEN NEW.organizational_unit_id:=expected; END IF;
    IF expected IS NOT NULL AND NEW.organizational_unit_id IS DISTINCT FROM expected THEN RAISE EXCEPTION 'accounting unit must match enrollment unit'; END IF;
  END IF;
  RETURN NEW;
END $$;
