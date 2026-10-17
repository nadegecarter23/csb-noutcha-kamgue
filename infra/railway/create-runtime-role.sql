-- =============================================================================
-- CSB Noutcha KAMGUE — rôle PostgreSQL applicatif pour Railway (ou toute base
-- managée).
--
-- Pourquoi : le compte fourni par Railway (`postgres`) est super-utilisateur et
-- propriétaire des tables ; il contourne la RLS. Si l'API s'y connecte, le
-- cloisonnement entre cycles et l'interdiction de supprimer les données
-- financières ne s'appliquent plus. L'API doit se connecter avec `cplan_app`,
-- les migrations continuent d'utiliser le compte propriétaire.
--
-- Utilisation (depuis le poste de l'administrateur, mot de passe généré à part) :
--
--   psql "$DATABASE_PUBLIC_URL" -v app_password='MOT_DE_PASSE_FORT' \
--        -f infra/railway/create-runtime-role.sql
--
-- `DATABASE_PUBLIC_URL` est l'URL propriétaire exposée par le service Postgres
-- Railway. Le script est idempotent : il peut être rejoué (rotation du mot de
-- passe, base déjà migrée ou non).
-- =============================================================================

\set ON_ERROR_STOP on

-- 1. Rôle applicatif sans aucun privilège d'administration ni contournement RLS.
SELECT format('CREATE ROLE cplan_app LOGIN PASSWORD %L', :'app_password')
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'cplan_app') \gexec
SELECT format(
  'ALTER ROLE cplan_app WITH LOGIN PASSWORD %L NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOREPLICATION',
  :'app_password'
) \gexec

SELECT format('GRANT CONNECT ON DATABASE %I TO cplan_app', current_database()) \gexec
GRANT USAGE ON SCHEMA public TO cplan_app;

-- 2. Objets déjà créés (base déjà migrée).
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO cplan_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO cplan_app;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO cplan_app;

-- 3. Objets créés ensuite par les migrations, exécutées avec le compte courant.
SELECT format(
  'ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO cplan_app',
  current_user
) \gexec
SELECT format(
  'ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO cplan_app',
  current_user
) \gexec
SELECT format(
  'ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO cplan_app',
  current_user
) \gexec

-- 4. Retraits imposés par les migrations (journal d'audit en ajout seul, pièces
--    financières jamais supprimées). Les migrations ne les appliquent que si le
--    rôle existe déjà : on les rejoue ici pour une base migrée avant ce script.
DO $$
DECLARE item record;
BEGIN
  FOR item IN SELECT * FROM (VALUES
    ('audit_logs', 'UPDATE, DELETE'),
    ('payments', 'DELETE'),
    ('payment_allocations', 'DELETE'),
    ('receipts', 'DELETE'),
    ('cash_sessions', 'DELETE'),
    ('cash_session_movements', 'DELETE'),
    ('payment_targets', 'DELETE'),
    ('payment_provider_events', 'DELETE'),
    ('mobile_money_reconciliations', 'DELETE'),
    ('external_payment_declarations', 'DELETE'),
    ('external_payment_proofs', 'DELETE'),
    ('notification_deliveries', 'DELETE'),
    ('export_jobs', 'DELETE')
  ) AS x(table_name, privileges)
  LOOP
    IF to_regclass(format('public.%I', item.table_name)) IS NOT NULL THEN
      EXECUTE format('REVOKE %s ON public.%I FROM cplan_app', item.privileges, item.table_name);
    END IF;
  END LOOP;
END $$;

-- 5. Contrôle : le rôle ne doit ni être super-utilisateur, ni contourner la RLS,
--    ni posséder de table.
SELECT
  r.rolname AS role,
  r.rolsuper AS super_utilisateur,
  r.rolbypassrls AS contourne_rls,
  (SELECT count(*) FROM pg_tables t WHERE t.schemaname = 'public' AND t.tableowner = r.rolname)
    AS tables_possedees
FROM pg_roles r
WHERE r.rolname = 'cplan_app';
