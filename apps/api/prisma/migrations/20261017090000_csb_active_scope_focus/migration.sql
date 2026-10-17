-- Périmètre actif réellement appliqué (audit du 17/10/2026).
--
-- Le sélecteur « Périmètre actif » n'avait aucun effet sur les données : la RLS
-- appliquait toujours l'ensemble des périmètres de l'utilisateur. L'API transmet
-- désormais le périmètre choisi (app.active_*), et la règle centrale le combine
-- aux droits : on ne voit que ce que l'on a le droit de voir ET qui appartient
-- au cycle, à la section, à la filière ou à la classe choisis.
--
-- Les données qui ne relèvent d'aucun cycle (audit, notifications, messages,
-- exports) gardent leur comportement : le choix d'un cycle ne les masque pas.

CREATE OR REPLACE FUNCTION active_scope_value(setting_name text) RETURNS uuid
LANGUAGE sql STABLE AS $$
  SELECT NULLIF(current_setting(setting_name, true), '')::uuid;
$$;

CREATE OR REPLACE FUNCTION active_scope_set() RETURNS boolean
LANGUAGE sql STABLE AS $$
  SELECT active_scope_value('app.active_unit_id') IS NOT NULL
    OR active_scope_value('app.active_section_id') IS NOT NULL
    OR active_scope_value('app.active_track_id') IS NOT NULL
    OR active_scope_value('app.active_class_id') IS NOT NULL;
$$;

-- Vrai sans périmètre actif ; sinon la cible doit appartenir au périmètre choisi.
-- Une cible sans cycle (NULL) n'appartient à aucun cycle choisi.
CREATE OR REPLACE FUNCTION active_scope_allows(
  target_unit_id uuid,
  target_section_id uuid,
  target_track_id uuid,
  target_class_id uuid
) RETURNS boolean
LANGUAGE sql STABLE AS $$
  SELECT (active_scope_value('app.active_unit_id') IS NULL
          OR COALESCE(target_unit_id = active_scope_value('app.active_unit_id'), false))
     AND (active_scope_value('app.active_section_id') IS NULL
          OR COALESCE(target_section_id = active_scope_value('app.active_section_id'), false))
     AND (active_scope_value('app.active_track_id') IS NULL
          OR COALESCE(target_track_id = active_scope_value('app.active_track_id'), false))
     AND (active_scope_value('app.active_class_id') IS NULL
          OR COALESCE(target_class_id = active_scope_value('app.active_class_id'), false));
$$;

-- Règle centrale : droits de l'utilisateur ET périmètre actif.
CREATE OR REPLACE FUNCTION scope_allows_organization(
  target_unit_id uuid,
  target_section_id uuid,
  target_track_id uuid,
  target_class_id uuid
) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT current_app_user_id() IS NULL OR (
    active_scope_allows(target_unit_id, target_section_id, target_track_id, target_class_id)
    AND (
      has_school_access_scope()
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
      )
    )
  );
$$;

-- Fonctions dérivées : le raccourci « accès global » ne s'applique plus quand un
-- périmètre est choisi ; elles retombent alors sur la règle centrale ci-dessus.

CREATE OR REPLACE FUNCTION public.scope_allows_class(target_class_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT current_app_user_id() IS NULL OR (has_school_access_scope() AND NOT active_scope_set()) OR EXISTS (
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
$function$;

CREATE OR REPLACE FUNCTION public.scope_allows_enrollment(target_enrollment_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT current_app_user_id() IS NULL OR (has_school_access_scope() AND NOT active_scope_set()) OR EXISTS (
    SELECT 1 FROM enrollments e
    WHERE e.id = target_enrollment_id
      AND e.school_id = current_school_id()
      AND (
        current_user_is_student_guardian(e.student_id)
        OR (e.class_id IS NOT NULL AND scope_allows_class(e.class_id))
      )
  );
$function$;

CREATE OR REPLACE FUNCTION public.scope_allows_student(target_student_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT current_app_user_id() IS NULL
    OR (has_school_access_scope() AND NOT active_scope_set())
    OR current_user_is_student_guardian(target_student_id)
    OR EXISTS (
    SELECT 1 FROM enrollments e
    WHERE e.student_id = target_student_id
      AND e.school_id = current_school_id()
      AND e.class_id IS NOT NULL
      AND scope_allows_class(e.class_id)
  );
$function$;

CREATE OR REPLACE FUNCTION public.scope_allows_payment(target_payment_id uuid, target_created_by uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT current_app_user_id() IS NULL
    OR (has_school_access_scope() AND NOT active_scope_set())
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
$function$;

CREATE OR REPLACE FUNCTION public.scope_allows_staff_profile(target_profile_id uuid, target_user_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT current_app_user_id() IS NULL
    OR (has_school_access_scope() AND NOT active_scope_set())
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
$function$;

CREATE OR REPLACE FUNCTION public.scope_allows_file(target_file_id uuid, target_uploader uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT current_app_user_id() IS NULL
    OR (has_school_access_scope() AND NOT active_scope_set())
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
$function$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'cplan_app') THEN
    GRANT EXECUTE ON FUNCTION active_scope_value(text) TO cplan_app;
    GRANT EXECUTE ON FUNCTION active_scope_set() TO cplan_app;
    GRANT EXECUTE ON FUNCTION active_scope_allows(uuid, uuid, uuid, uuid) TO cplan_app;
  END IF;
END $$;

-- Niveaux : référentiel lisible par tout l'établissement (comme les cycles,
-- sections et filières). Une classe porte un niveau obligatoire ; masquer ce
-- niveau à un enseignant qui voit la classe faisait échouer la lecture.
-- L'écriture reste limitée au cycle autorisé.
DROP POLICY IF EXISTS school_and_internal_scope ON "grade_levels";
CREATE POLICY school_read ON "grade_levels" FOR SELECT
  USING (current_school_id() IS NULL OR school_id = current_school_id());
CREATE POLICY school_and_internal_scope_insert ON "grade_levels" FOR INSERT
  WITH CHECK (current_school_id() IS NULL OR (
    school_id = current_school_id()
    AND scope_allows_organization(organizational_unit_id, NULL, NULL, NULL)
  ));
CREATE POLICY school_and_internal_scope_update ON "grade_levels" FOR UPDATE
  USING (current_school_id() IS NULL OR (
    school_id = current_school_id()
    AND scope_allows_organization(organizational_unit_id, NULL, NULL, NULL)
  ))
  WITH CHECK (current_school_id() IS NULL OR (
    school_id = current_school_id()
    AND scope_allows_organization(organizational_unit_id, NULL, NULL, NULL)
  ));
CREATE POLICY school_and_internal_scope_delete ON "grade_levels" FOR DELETE
  USING (current_school_id() IS NULL OR (
    school_id = current_school_id()
    AND scope_allows_organization(organizational_unit_id, NULL, NULL, NULL)
  ));

-- RLS activée là où une politique existait sans effet (RLS jamais activée sur
-- la table : la politique était ignorée et toutes les lignes restaient visibles).
ALTER TABLE homework ENABLE ROW LEVEL SECURITY;
ALTER TABLE library_loans ENABLE ROW LEVEL SECURITY;
ALTER TABLE transport_enrollments ENABLE ROW LEVEL SECURITY;
ALTER TABLE school_messages ENABLE ROW LEVEL SECURITY;

-- Messages internes : strictement privés entre l'expéditeur et le destinataire,
-- y compris pour un profil à périmètre global.
DROP POLICY IF EXISTS school_and_internal_scope ON school_messages;
CREATE POLICY school_and_internal_scope ON school_messages FOR ALL
  USING (current_school_id() IS NULL OR (
    school_id = current_school_id()
    AND (sender_user_id = current_app_user_id() OR recipient_user_id = current_app_user_id())
  ))
  WITH CHECK (current_school_id() IS NULL OR (
    school_id = current_school_id() AND sender_user_id = current_app_user_id()
  ));

-- Congés : visibles avec la fiche du membre du personnel concerné.
ALTER TABLE staff_leaves ENABLE ROW LEVEL SECURITY;
CREATE POLICY school_and_internal_scope ON staff_leaves FOR ALL
  USING (current_school_id() IS NULL OR (
    school_id = current_school_id()
    AND EXISTS (SELECT 1 FROM staff_profiles sp WHERE sp.id = staff_profile_id)
  ))
  WITH CHECK (current_school_id() IS NULL OR (
    school_id = current_school_id()
    AND EXISTS (SELECT 1 FROM staff_profiles sp WHERE sp.id = staff_profile_id)
  ));

-- Isolation par établissement des tables qui n'avaient aucune protection en base.
DO $$
DECLARE item text;
BEGIN
  FOREACH item IN ARRAY ARRAY[
    'canteen_meals', 'expense_categories', 'inventory_items', 'inventory_movements',
    'library_books', 'school_events', 'suppliers', 'transport_routes', 'school_module_settings'
  ] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', item);
    EXECUTE format('DROP POLICY IF EXISTS school_isolation ON %I', item);
    EXECUTE format(
      'CREATE POLICY school_isolation ON %I FOR ALL '
      'USING (current_school_id() IS NULL OR school_id = current_school_id()) '
      'WITH CHECK (current_school_id() IS NULL OR school_id = current_school_id())',
      item
    );
  END LOOP;
END $$;

-- Rôles et attributions : les rôles système et de plateforme n'ont pas
-- d'établissement (school_id NULL) et restent lisibles par tous.
DO $$
DECLARE item text;
BEGIN
  FOREACH item IN ARRAY ARRAY['roles', 'user_roles'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', item);
    EXECUTE format('DROP POLICY IF EXISTS school_isolation ON %I', item);
    EXECUTE format(
      'CREATE POLICY school_isolation ON %I FOR ALL '
      'USING (current_school_id() IS NULL OR school_id IS NULL OR school_id = current_school_id()) '
      'WITH CHECK (current_school_id() IS NULL OR school_id = current_school_id())',
      item
    );
  END LOOP;
END $$;
