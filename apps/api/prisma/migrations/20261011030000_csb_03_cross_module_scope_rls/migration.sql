-- CSB-03 — seconde barrière de cloisonnement interne par RLS.

CREATE OR REPLACE FUNCTION current_app_user_id() RETURNS uuid AS $$
  SELECT NULLIF(current_setting('app.user_id', true), '')::uuid;
$$ LANGUAGE sql STABLE;

CREATE OR REPLACE FUNCTION has_school_access_scope() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT current_app_user_id() IS NULL OR EXISTS (
    SELECT 1 FROM user_access_scopes s
    WHERE s.school_id = current_school_id()
      AND s.user_id = current_app_user_id()
      AND s.scope_type = 'SCHOOL'
  );
$$;

CREATE OR REPLACE FUNCTION scope_allows_organization(
  target_unit_id uuid,
  target_section_id uuid,
  target_track_id uuid,
  target_class_id uuid
) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT current_app_user_id() IS NULL
    OR has_school_access_scope()
    OR EXISTS (
      SELECT 1 FROM user_access_scopes s
      WHERE s.school_id = current_school_id()
        AND s.user_id = current_app_user_id()
        AND (
          (s.scope_type = 'UNIT' AND s.organizational_unit_id = target_unit_id)
          OR (s.scope_type = 'LANGUAGE_SECTION' AND s.language_section_id = target_section_id)
          OR (s.scope_type = 'TRACK' AND s.education_track_id = target_track_id)
          OR (s.scope_type = 'CLASS' AND s.class_id = target_class_id)
          OR (
            s.scope_type = 'OWN_ASSIGNMENTS'
            AND target_class_id IS NOT NULL
            AND EXISTS (
              SELECT 1 FROM teaching_assignments ta
              WHERE ta.school_id = current_school_id()
                AND ta.class_id = target_class_id
                AND ta.teacher_user_id = current_app_user_id()
                AND ta.status = 'ACTIVE'
            )
          )
        )
    );
$$;

CREATE OR REPLACE FUNCTION scope_allows_class(target_class_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT current_app_user_id() IS NULL OR has_school_access_scope() OR EXISTS (
    SELECT 1 FROM classes c
    WHERE c.id = target_class_id
      AND c.school_id = current_school_id()
      AND scope_allows_organization(
        c.organizational_unit_id,
        c.language_section_id,
        c.education_track_id,
        c.id
      )
  );
$$;

CREATE OR REPLACE FUNCTION current_user_is_student_guardian(target_student_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT current_app_user_id() IS NOT NULL AND (
    EXISTS (
      SELECT 1 FROM students s
      WHERE s.id = target_student_id
        AND s.school_id = current_school_id()
        AND s.portal_user_id = current_app_user_id()
    )
    OR EXISTS (
      SELECT 1
      FROM student_guardians sg
      JOIN guardians g ON g.id = sg.guardian_id
      WHERE sg.student_id = target_student_id
        AND sg.status = 'ACCEPTED'
        AND g.school_id = current_school_id()
        AND g.user_id = current_app_user_id()
    )
  );
$$;

CREATE OR REPLACE FUNCTION scope_allows_enrollment(target_enrollment_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT current_app_user_id() IS NULL OR has_school_access_scope() OR EXISTS (
    SELECT 1 FROM enrollments e
    WHERE e.id = target_enrollment_id
      AND e.school_id = current_school_id()
      AND (
        current_user_is_student_guardian(e.student_id)
        OR (e.class_id IS NOT NULL AND scope_allows_class(e.class_id))
      )
  );
$$;

CREATE OR REPLACE FUNCTION scope_allows_student(target_student_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT current_app_user_id() IS NULL
    OR has_school_access_scope()
    OR current_user_is_student_guardian(target_student_id)
    OR EXISTS (
    SELECT 1 FROM enrollments e
    WHERE e.student_id = target_student_id
      AND e.school_id = current_school_id()
      AND e.class_id IS NOT NULL
      AND scope_allows_class(e.class_id)
  );
$$;

CREATE OR REPLACE FUNCTION scope_allows_payment(
  target_payment_id uuid,
  target_created_by uuid
) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT current_app_user_id() IS NULL
    OR has_school_access_scope()
    OR target_created_by = current_app_user_id()
    OR (
      EXISTS (
        SELECT 1 FROM payment_targets pt
        WHERE pt.payment_id = target_payment_id
          AND scope_allows_enrollment(pt.enrollment_id)
      )
      AND NOT EXISTS (
        SELECT 1 FROM payment_targets pt
        WHERE pt.payment_id = target_payment_id
          AND NOT scope_allows_enrollment(pt.enrollment_id)
      )
    );
$$;

CREATE OR REPLACE FUNCTION scope_allows_staff_profile(
  target_profile_id uuid,
  target_user_id uuid
) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT current_app_user_id() IS NULL
    OR has_school_access_scope()
    OR target_user_id = current_app_user_id()
    OR EXISTS (
      SELECT 1 FROM staff_assignments a
      LEFT JOIN language_sections ls ON ls.id = a.language_section_id
      LEFT JOIN education_tracks et ON et.id = a.education_track_id
      LEFT JOIN classes c ON c.id = a.class_id
      WHERE a.staff_profile_id = target_profile_id
        AND a.school_id = current_school_id()
        AND a.status = 'ACTIVE'
        AND (a.starts_at IS NULL OR a.starts_at <= current_date)
        AND (a.ends_at IS NULL OR a.ends_at >= current_date)
        AND scope_allows_organization(
          COALESCE(a.organizational_unit_id, ls.organizational_unit_id, et.organizational_unit_id, c.organizational_unit_id),
          a.language_section_id,
          a.education_track_id,
          a.class_id
        )
    );
$$;

CREATE OR REPLACE FUNCTION scope_allows_file(target_file_id uuid, target_uploader uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT current_app_user_id() IS NULL
    OR has_school_access_scope()
    OR target_uploader = current_app_user_id()
    OR EXISTS (SELECT 1 FROM students s WHERE s.photo_file_id = target_file_id AND scope_allows_student(s.id))
    OR EXISTS (
      SELECT 1 FROM receipts r JOIN payments p ON p.id = r.payment_id
      WHERE r.file_id = target_file_id AND scope_allows_payment(p.id, p.created_by)
    )
    OR EXISTS (
      SELECT 1 FROM external_payment_proofs ep
      JOIN external_payment_declarations ed ON ed.id = ep.declaration_id
      WHERE ep.file_id = target_file_id AND scope_allows_enrollment(ed.enrollment_id)
    )
    OR EXISTS (
      SELECT 1 FROM export_jobs ej
      WHERE ej.file_id = target_file_id AND ej.user_id = current_app_user_id()
    );
$$;

-- Ancrages organisationnels.
DROP POLICY IF EXISTS school_isolation ON "classes";
CREATE POLICY school_and_internal_scope ON "classes" FOR ALL
  USING (current_school_id() IS NULL OR (
    school_id = current_school_id()
    AND scope_allows_organization(organizational_unit_id, language_section_id, education_track_id, id)
  ))
  WITH CHECK (current_school_id() IS NULL OR (
    school_id = current_school_id()
    AND scope_allows_organization(organizational_unit_id, language_section_id, education_track_id, id)
  ));

DROP POLICY IF EXISTS school_isolation ON "grade_levels";
CREATE POLICY school_and_internal_scope ON "grade_levels" FOR ALL
  USING (current_school_id() IS NULL OR (
    school_id = current_school_id()
    AND scope_allows_organization(organizational_unit_id, NULL, NULL, NULL)
  ))
  WITH CHECK (current_school_id() IS NULL OR (
    school_id = current_school_id()
    AND scope_allows_organization(organizational_unit_id, NULL, NULL, NULL)
  ));

-- Entités scolaires héritant d’une classe.
DO $$
DECLARE item record;
BEGIN
  FOR item IN SELECT * FROM (VALUES
    ('teaching_assignments', 'class_id'),
    ('timetable_entries', 'class_id'),
    ('attendance_sessions', 'class_id'),
    ('assessments', 'class_id'),
    ('homework', 'class_id')
  ) AS x(table_name, class_column)
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS school_isolation ON %I', item.table_name);
    EXECUTE format(
      'CREATE POLICY school_and_internal_scope ON %I FOR ALL USING (current_school_id() IS NULL OR (school_id = current_school_id() AND scope_allows_class(%I))) WITH CHECK (current_school_id() IS NULL OR (school_id = current_school_id() AND scope_allows_class(%I)))',
      item.table_name, item.class_column, item.class_column
    );
  END LOOP;
END $$;

DROP POLICY IF EXISTS school_isolation ON "enrollments";
CREATE POLICY school_and_internal_scope ON "enrollments" FOR ALL
  USING (current_school_id() IS NULL OR (
    school_id = current_school_id() AND class_id IS NOT NULL AND scope_allows_class(class_id)
  ))
  WITH CHECK (current_school_id() IS NULL OR (
    school_id = current_school_id() AND class_id IS NOT NULL AND scope_allows_class(class_id)
  ));

DROP POLICY IF EXISTS school_isolation ON "students";
CREATE POLICY school_and_internal_scope ON "students" FOR ALL
  USING (current_school_id() IS NULL OR (school_id = current_school_id() AND scope_allows_student(id)))
  -- La création d'un élève précède son inscription et ne peut donc pas
  -- encore être reliée à une classe. La permission applicative contrôle
  -- l'écriture ; la lecture devient visible seulement après l'inscription.
  WITH CHECK (current_school_id() IS NULL OR school_id = current_school_id());

DO $$
DECLARE item record;
BEGIN
  FOR item IN SELECT * FROM (VALUES
    ('grades', 'enrollment_id'),
    ('report_cards', 'enrollment_id'),
    ('student_incidents', 'enrollment_id'),
    ('health_visits', 'enrollment_id'),
    ('library_loans', 'enrollment_id'),
    ('transport_enrollments', 'enrollment_id'),
    ('student_fee_assignments', 'enrollment_id'),
    ('external_payment_declarations', 'enrollment_id')
  ) AS x(table_name, enrollment_column)
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS school_isolation ON %I', item.table_name);
    EXECUTE format(
      'CREATE POLICY school_and_internal_scope ON %I FOR ALL USING (current_school_id() IS NULL OR (school_id = current_school_id() AND scope_allows_enrollment(%I))) WITH CHECK (current_school_id() IS NULL OR (school_id = current_school_id() AND scope_allows_enrollment(%I)))',
      item.table_name, item.enrollment_column, item.enrollment_column
    );
  END LOOP;
END $$;

-- Responsables visibles seulement à travers au moins un enfant visible.
DROP POLICY IF EXISTS school_isolation ON "guardians";
CREATE POLICY school_and_internal_scope ON "guardians" FOR ALL
  USING (current_school_id() IS NULL OR (
    school_id = current_school_id() AND (
      has_school_access_scope() OR EXISTS (
        SELECT 1 FROM student_guardians sg
        WHERE sg.guardian_id = id AND scope_allows_student(sg.student_id)
      )
    )
  ))
  WITH CHECK (current_school_id() IS NULL OR school_id = current_school_id());

DO $$
DECLARE item record;
BEGIN
  FOR item IN SELECT * FROM (VALUES
    ('guardian_invites', 'student_id'),
    ('guardian_link_requests', 'student_id')
  ) AS x(table_name, student_column)
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS school_isolation ON %I', item.table_name);
    EXECUTE format(
      'CREATE POLICY school_and_internal_scope ON %I FOR ALL USING (current_school_id() IS NULL OR (school_id = current_school_id() AND scope_allows_student(%I))) WITH CHECK (current_school_id() IS NULL OR (school_id = current_school_id() AND scope_allows_student(%I)))',
      item.table_name, item.student_column, item.student_column
    );
  END LOOP;
END $$;

-- Paiements, allocations, cibles et reçus.
DROP POLICY IF EXISTS school_isolation ON "payments";
CREATE POLICY school_and_internal_scope ON "payments" FOR ALL
  USING (current_school_id() IS NULL OR (
    school_id = current_school_id() AND scope_allows_payment(id, created_by)
  ))
  WITH CHECK (current_school_id() IS NULL OR (
    school_id = current_school_id() AND (has_school_access_scope() OR created_by = current_app_user_id())
  ));

DO $$
DECLARE item record;
BEGIN
  FOR item IN SELECT * FROM (VALUES
    ('payment_targets', 'enrollment_id'),
    ('payment_allocations', 'enrollment_id')
  ) AS x(table_name, enrollment_column)
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS school_isolation ON %I', item.table_name);
    EXECUTE format(
      'CREATE POLICY school_and_internal_scope ON %I FOR ALL USING (current_school_id() IS NULL OR (school_id = current_school_id() AND scope_allows_enrollment(%I))) WITH CHECK (current_school_id() IS NULL OR (school_id = current_school_id() AND scope_allows_enrollment(%I)))',
      item.table_name, item.enrollment_column, item.enrollment_column
    );
  END LOOP;
END $$;

DROP POLICY IF EXISTS school_isolation ON "receipts";
CREATE POLICY school_and_internal_scope ON "receipts" FOR ALL
  USING (current_school_id() IS NULL OR (
    school_id = current_school_id() AND EXISTS (
      SELECT 1 FROM payments p WHERE p.id = payment_id AND scope_allows_payment(p.id, p.created_by)
    )
  ))
  WITH CHECK (current_school_id() IS NULL OR school_id = current_school_id());

-- RH : soi-même, portée globale ou affectation recoupant le périmètre.
DROP POLICY IF EXISTS school_isolation ON "staff_profiles";
CREATE POLICY school_and_internal_scope ON "staff_profiles" FOR ALL
  USING (current_school_id() IS NULL OR (
    school_id = current_school_id() AND scope_allows_staff_profile(id, user_id)
  ))
  WITH CHECK (current_school_id() IS NULL OR school_id = current_school_id());

-- Imports et exports restent attachés à leur demandeur si celui-ci n’est pas global.
DROP POLICY IF EXISTS school_isolation ON "import_batches";
CREATE POLICY school_and_internal_scope ON "import_batches" FOR ALL
  USING (current_school_id() IS NULL OR (
    school_id = current_school_id() AND (has_school_access_scope() OR created_by = current_app_user_id())
  ))
  WITH CHECK (current_school_id() IS NULL OR (
    school_id = current_school_id() AND (has_school_access_scope() OR created_by = current_app_user_id())
  ));

DROP POLICY IF EXISTS school_isolation ON "export_jobs";
CREATE POLICY school_and_internal_scope ON "export_jobs" FOR ALL
  USING (current_school_id() IS NULL OR (
    school_id = current_school_id() AND (has_school_access_scope() OR user_id = current_app_user_id())
  ))
  WITH CHECK (current_school_id() IS NULL OR (
    school_id = current_school_id() AND user_id = current_app_user_id()
  ));

DROP POLICY IF EXISTS school_isolation ON "files";
CREATE POLICY school_and_internal_scope ON "files" FOR ALL
  USING (current_school_id() IS NULL OR (
    school_id = current_school_id() AND scope_allows_file(id, uploaded_by)
  ))
  WITH CHECK (current_school_id() IS NULL OR (
    school_id = current_school_id() AND (has_school_access_scope() OR uploaded_by = current_app_user_id())
  ));

-- Messages, notifications et audit ne révèlent jamais l’activité d’un tiers à
-- un utilisateur restreint. Les fonctions globales conservent leur vue complète.
DROP POLICY IF EXISTS school_isolation ON "school_messages";
CREATE POLICY school_and_internal_scope ON "school_messages" FOR ALL
  USING (current_school_id() IS NULL OR (
    school_id = current_school_id() AND (
      has_school_access_scope() OR sender_user_id = current_app_user_id() OR recipient_user_id = current_app_user_id()
    )
  ))
  WITH CHECK (current_school_id() IS NULL OR (
    school_id = current_school_id() AND sender_user_id = current_app_user_id()
  ));

DROP POLICY IF EXISTS school_isolation ON "notifications";
CREATE POLICY school_and_internal_scope ON "notifications" FOR ALL
  USING (current_school_id() IS NULL OR (
    (school_id IS NULL OR school_id = current_school_id())
    AND (has_school_access_scope() OR user_id = current_app_user_id())
  ))
  WITH CHECK (current_school_id() IS NULL OR school_id IS NULL OR school_id = current_school_id());

DROP POLICY IF EXISTS school_isolation ON "audit_logs";
CREATE POLICY school_and_internal_scope ON "audit_logs" FOR SELECT
  USING (current_school_id() IS NULL OR (
    school_id = current_school_id() AND (has_school_access_scope() OR user_id = current_app_user_id())
  ));
CREATE POLICY school_and_internal_scope_insert ON "audit_logs" FOR INSERT
  WITH CHECK (current_school_id() IS NULL OR school_id IS NULL OR school_id = current_school_id());

ALTER VIEW "v_enrollment_balance" SET (security_invoker = true);
ALTER VIEW "v_enrollment_balance_audit" SET (security_invoker = true);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'cplan_app') THEN
    GRANT EXECUTE ON FUNCTION current_app_user_id() TO cplan_app;
    GRANT EXECUTE ON FUNCTION has_school_access_scope() TO cplan_app;
    GRANT EXECUTE ON FUNCTION scope_allows_organization(uuid, uuid, uuid, uuid) TO cplan_app;
    GRANT EXECUTE ON FUNCTION scope_allows_class(uuid) TO cplan_app;
    GRANT EXECUTE ON FUNCTION current_user_is_student_guardian(uuid) TO cplan_app;
    GRANT EXECUTE ON FUNCTION scope_allows_enrollment(uuid) TO cplan_app;
    GRANT EXECUTE ON FUNCTION scope_allows_student(uuid) TO cplan_app;
    GRANT EXECUTE ON FUNCTION scope_allows_payment(uuid, uuid) TO cplan_app;
    GRANT EXECUTE ON FUNCTION scope_allows_staff_profile(uuid, uuid) TO cplan_app;
    GRANT EXECUTE ON FUNCTION scope_allows_file(uuid, uuid) TO cplan_app;
  END IF;
END $$;
