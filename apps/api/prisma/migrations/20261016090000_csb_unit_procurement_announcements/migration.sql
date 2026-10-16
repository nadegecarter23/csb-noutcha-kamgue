-- Cohérence métier par cycle (audit du 16/10/2026) :
--   · achats, dépenses et paiements fournisseurs sont rattachés à un cycle et
--     cloisonnés par RLS, comme les autres écritures financières ;
--   · une annonce vise tout le complexe (cycle vide) ou un seul cycle.

-- 1. Rattrapage des données existantes ----------------------------------------
-- Une dépense issue d'un bon d'achat hérite de son cycle ; un paiement hérite de
-- sa dépense. Les lignes restées sans cycle ne sont visibles que des profils à
-- périmètre global, qui doivent les reclasser.
UPDATE expenses e
SET organizational_unit_id = p.organizational_unit_id
FROM purchase_orders p
WHERE e.purchase_order_id = p.id
  AND e.organizational_unit_id IS NULL
  AND p.organizational_unit_id IS NOT NULL;

UPDATE supplier_payments sp
SET organizational_unit_id = e.organizational_unit_id
FROM expenses e
WHERE sp.expense_id = e.id
  AND sp.organizational_unit_id IS NULL
  AND e.organizational_unit_id IS NOT NULL;

-- 2. Cohérence entre pièces liées -----------------------------------------------
CREATE OR REPLACE FUNCTION enforce_procurement_unit() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE expected uuid;
BEGIN
  -- Conditions imbriquées : PL/pgSQL évalue tout le test, et NEW n'a pas de
  -- purchase_order_id pour un paiement fournisseur.
  IF TG_TABLE_NAME = 'expenses' THEN
    IF NEW.purchase_order_id IS NOT NULL THEN
      SELECT organizational_unit_id INTO expected FROM purchase_orders WHERE id = NEW.purchase_order_id;
      IF expected IS DISTINCT FROM NEW.organizational_unit_id THEN
        RAISE EXCEPTION 'expense unit must match purchase order unit';
      END IF;
    END IF;
  ELSIF TG_TABLE_NAME = 'supplier_payments' THEN
    SELECT organizational_unit_id INTO expected FROM expenses WHERE id = NEW.expense_id;
    IF NEW.organizational_unit_id IS NULL THEN
      NEW.organizational_unit_id := expected;
    END IF;
    IF expected IS DISTINCT FROM NEW.organizational_unit_id THEN
      RAISE EXCEPTION 'supplier payment unit must match expense unit';
    END IF;
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER expense_unit_guard BEFORE INSERT OR UPDATE ON expenses
  FOR EACH ROW EXECUTE FUNCTION enforce_procurement_unit();
CREATE TRIGGER supplier_payment_unit_guard BEFORE INSERT OR UPDATE ON supplier_payments
  FOR EACH ROW EXECUTE FUNCTION enforce_procurement_unit();

-- 3. Cloisonnement des achats et dépenses ---------------------------------------
ALTER TABLE purchase_orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY school_and_internal_scope ON purchase_orders FOR ALL
  USING (current_school_id() IS NULL OR (
    school_id = current_school_id()
    AND scope_allows_organization(organizational_unit_id, NULL, NULL, NULL)
  ))
  WITH CHECK (current_school_id() IS NULL OR (
    school_id = current_school_id()
    AND scope_allows_organization(organizational_unit_id, NULL, NULL, NULL)
  ));

ALTER TABLE purchase_order_lines ENABLE ROW LEVEL SECURITY;
CREATE POLICY school_and_internal_scope ON purchase_order_lines FOR ALL
  USING (current_school_id() IS NULL OR (
    school_id = current_school_id()
    AND EXISTS (SELECT 1 FROM purchase_orders p WHERE p.id = purchase_order_id)
  ))
  WITH CHECK (current_school_id() IS NULL OR (
    school_id = current_school_id()
    AND EXISTS (SELECT 1 FROM purchase_orders p WHERE p.id = purchase_order_id)
  ));

ALTER TABLE expenses ENABLE ROW LEVEL SECURITY;
CREATE POLICY school_and_internal_scope ON expenses FOR ALL
  USING (current_school_id() IS NULL OR (
    school_id = current_school_id()
    AND scope_allows_organization(organizational_unit_id, NULL, NULL, NULL)
  ))
  WITH CHECK (current_school_id() IS NULL OR (
    school_id = current_school_id()
    AND scope_allows_organization(organizational_unit_id, NULL, NULL, NULL)
  ));

ALTER TABLE supplier_payments ENABLE ROW LEVEL SECURITY;
CREATE POLICY school_and_internal_scope ON supplier_payments FOR ALL
  USING (current_school_id() IS NULL OR (
    school_id = current_school_id()
    AND scope_allows_organization(organizational_unit_id, NULL, NULL, NULL)
  ))
  WITH CHECK (current_school_id() IS NULL OR (
    school_id = current_school_id()
    AND scope_allows_organization(organizational_unit_id, NULL, NULL, NULL)
  ));

-- 4. Annonces par cycle -----------------------------------------------------------
ALTER TABLE announcements
  ADD COLUMN organizational_unit_id uuid REFERENCES organizational_units(id) ON DELETE RESTRICT;
CREATE INDEX announcements_school_unit_published_idx
  ON announcements(school_id, organizational_unit_id, published_at DESC);

-- Rattachement d'un utilisateur à un cycle sans périmètre de gestion : membre du
-- personnel affecté, enseignant d'une classe du cycle, parent ou élève inscrit.
CREATE OR REPLACE FUNCTION current_user_belongs_to_unit(target_unit_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT current_app_user_id() IS NOT NULL AND (
    EXISTS (
      SELECT 1 FROM staff_assignments sa
      JOIN staff_profiles sp ON sp.id = sa.staff_profile_id
      WHERE sa.school_id = current_school_id()
        AND sp.user_id = current_app_user_id()
        AND sa.status = 'ACTIVE'
        AND sa.organizational_unit_id = target_unit_id
    )
    OR EXISTS (
      SELECT 1 FROM teaching_assignments ta
      JOIN classes c ON c.id = ta.class_id
      WHERE ta.school_id = current_school_id()
        AND ta.teacher_user_id = current_app_user_id()
        AND ta.status = 'ACTIVE'
        AND c.organizational_unit_id = target_unit_id
    )
    OR EXISTS (
      SELECT 1 FROM enrollments e
      JOIN classes c ON c.id = e.class_id
      WHERE e.school_id = current_school_id()
        AND e.status = 'ACTIVE'
        AND c.organizational_unit_id = target_unit_id
        AND current_user_is_student_guardian(e.student_id)
    )
  );
$$;

-- Lecture : annonces du complexe, ou du cycle géré ou fréquenté.
-- Écriture : un cycle autorisé ; une annonce pour tout le complexe exige un
-- périmètre global (scope_allows_organization(NULL, …) n'est vrai qu'à ce niveau).
ALTER TABLE announcements ENABLE ROW LEVEL SECURITY;
CREATE POLICY school_and_internal_scope ON announcements FOR SELECT
  USING (current_school_id() IS NULL OR (
    school_id = current_school_id()
    AND (
      organizational_unit_id IS NULL
      OR scope_allows_organization(organizational_unit_id, NULL, NULL, NULL)
      OR current_user_belongs_to_unit(organizational_unit_id)
    )
  ));
CREATE POLICY school_and_internal_scope_write ON announcements FOR INSERT
  WITH CHECK (current_school_id() IS NULL OR (
    school_id = current_school_id()
    AND scope_allows_organization(organizational_unit_id, NULL, NULL, NULL)
  ));
CREATE POLICY school_and_internal_scope_update ON announcements FOR UPDATE
  USING (current_school_id() IS NULL OR (
    school_id = current_school_id()
    AND scope_allows_organization(organizational_unit_id, NULL, NULL, NULL)
  ))
  WITH CHECK (current_school_id() IS NULL OR (
    school_id = current_school_id()
    AND scope_allows_organization(organizational_unit_id, NULL, NULL, NULL)
  ));
CREATE POLICY school_and_internal_scope_delete ON announcements FOR DELETE
  USING (current_school_id() IS NULL OR (
    school_id = current_school_id()
    AND scope_allows_organization(organizational_unit_id, NULL, NULL, NULL)
  ));

-- 5. Correctif : visibilité des responsables -------------------------------------
-- Dans la politique CSB-03, `id` non qualifié désignait `student_guardians.id` :
-- la condition était toujours fausse. Un personnel limité à un cycle ne voyait
-- aucun responsable, et un parent ne retrouvait pas sa propre fiche (portail vide
-- avec le rôle applicatif restreint).
DROP POLICY IF EXISTS school_and_internal_scope ON "guardians";
CREATE POLICY school_and_internal_scope ON "guardians" FOR ALL
  USING (current_school_id() IS NULL OR (
    school_id = current_school_id() AND (
      has_school_access_scope()
      OR user_id = current_app_user_id()
      OR EXISTS (
        SELECT 1 FROM student_guardians sg
        WHERE sg.guardian_id = guardians.id AND scope_allows_student(sg.student_id)
      )
    )
  ))
  WITH CHECK (current_school_id() IS NULL OR school_id = current_school_id());

-- 6. Correctif : lecture par les familles ----------------------------------------
-- Les politiques CSB-03 des inscriptions, classes, devoirs et emplois du temps ne
-- prévoyaient que le personnel. Avec le rôle restreint, le portail web d'un parent
-- ou d'un élève restait vide. On ouvre la LECTURE de ses propres enfants ;
-- l'écriture reste réservée au personnel habilité.
CREATE OR REPLACE FUNCTION current_user_has_learner_in_class(target_class_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT current_app_user_id() IS NOT NULL AND EXISTS (
    SELECT 1 FROM enrollments e
    WHERE e.class_id = target_class_id
      AND e.school_id = current_school_id()
      AND e.status = 'ACTIVE'
      AND current_user_is_student_guardian(e.student_id)
  );
$$;

DROP POLICY IF EXISTS school_and_internal_scope ON "enrollments";
CREATE POLICY school_and_internal_scope ON "enrollments" FOR ALL
  USING (current_school_id() IS NULL OR (
    school_id = current_school_id() AND (
      (class_id IS NOT NULL AND scope_allows_class(class_id))
      OR current_user_is_student_guardian(student_id)
    )
  ))
  WITH CHECK (current_school_id() IS NULL OR (
    school_id = current_school_id() AND class_id IS NOT NULL AND scope_allows_class(class_id)
  ));

DROP POLICY IF EXISTS school_and_internal_scope ON "classes";
CREATE POLICY school_and_internal_scope ON "classes" FOR ALL
  USING (current_school_id() IS NULL OR (
    school_id = current_school_id() AND (
      scope_allows_organization(organizational_unit_id, language_section_id, education_track_id, id)
      OR current_user_has_learner_in_class(id)
    )
  ))
  WITH CHECK (current_school_id() IS NULL OR (
    school_id = current_school_id()
    AND scope_allows_organization(organizational_unit_id, language_section_id, education_track_id, id)
  ));

DO $$
DECLARE item text;
BEGIN
  FOREACH item IN ARRAY ARRAY['homework', 'timetable_entries'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS school_and_internal_scope ON %I', item);
    EXECUTE format(
      'CREATE POLICY school_and_internal_scope ON %I FOR ALL '
      'USING (current_school_id() IS NULL OR (school_id = current_school_id() AND (scope_allows_class(class_id) OR current_user_has_learner_in_class(class_id)))) '
      'WITH CHECK (current_school_id() IS NULL OR (school_id = current_school_id() AND scope_allows_class(class_id)))',
      item
    );
  END LOOP;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'cplan_app') THEN
    GRANT EXECUTE ON FUNCTION current_user_has_learner_in_class(uuid) TO cplan_app;
    GRANT EXECUTE ON FUNCTION current_user_belongs_to_unit(uuid) TO cplan_app;
    GRANT EXECUTE ON FUNCTION enforce_procurement_unit() TO cplan_app;
  END IF;
END $$;
