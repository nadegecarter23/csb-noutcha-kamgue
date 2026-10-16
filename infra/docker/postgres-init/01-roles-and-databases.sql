-- =============================================================================
-- CSB Noutcha KAMGUE — initialisation PostgreSQL (développement local)
--
-- Deux rôles distincts, conformément à ADR-011 et ADR-015
-- (docs/02-ARCHITECTURE-TECHNIQUE.md) :
--
--   cplan      → propriétaire du schéma, utilisé UNIQUEMENT par les migrations.
--                Contourne la RLS (superuser).
--   cplan_app  → rôle applicatif. Ne pourra pas supprimer une donnée financière :
--                le privilège DELETE lui sera retiré sur payments,
--                payment_allocations, receipts et audit_logs par une migration
--                dédiée (Phase 07 / Phase 16).
--
-- Ce script n'est exécuté qu'à la CRÉATION du volume PostgreSQL.
-- Pour le rejouer : pnpm infra:reset
-- =============================================================================

-- Rôle applicatif
CREATE ROLE cplan_app WITH LOGIN PASSWORD 'cplan_dev_password';

-- Base de test dédiée (Testcontainers l'ignore, mais elle sert aux tests locaux)
CREATE DATABASE cplan_test OWNER cplan;

\connect cplan

GRANT CONNECT ON DATABASE cplan TO cplan_app;
GRANT USAGE ON SCHEMA public TO cplan_app;

-- Les privilèges par défaut s'appliquent automatiquement aux tables créées
-- ENSUITE par le rôle cplan. Sans cela, il faudrait un GRANT après chaque
-- migration qui ajoute une table — oubli garanti.
ALTER DEFAULT PRIVILEGES FOR ROLE cplan IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO cplan_app;

ALTER DEFAULT PRIVILEGES FOR ROLE cplan IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO cplan_app;

ALTER DEFAULT PRIVILEGES FOR ROLE cplan IN SCHEMA public
  GRANT EXECUTE ON FUNCTIONS TO cplan_app;

-- Même chose sur la base de test
\connect cplan_test

GRANT CONNECT ON DATABASE cplan_test TO cplan_app;
GRANT USAGE ON SCHEMA public TO cplan_app;

ALTER DEFAULT PRIVILEGES FOR ROLE cplan IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO cplan_app;

ALTER DEFAULT PRIVILEGES FOR ROLE cplan IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO cplan_app;

ALTER DEFAULT PRIVILEGES FOR ROLE cplan IN SCHEMA public
  GRANT EXECUTE ON FUNCTIONS TO cplan_app;
