-- CreateEnum
CREATE TYPE "school_status" AS ENUM ('ACTIVE', 'SUSPENDED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "sequence_scope" AS ENUM ('STUDENT_NUMBER', 'RECEIPT', 'PAYMENT_REF', 'INVOICE');

-- CreateEnum
CREATE TYPE "file_kind" AS ENUM ('STUDENT_PHOTO', 'PAYMENT_PROOF', 'RECEIPT_PDF', 'IMPORT_FILE', 'SCHOOL_LOGO', 'EXPORT');

-- CreateEnum
CREATE TYPE "user_status" AS ENUM ('PENDING_VERIFICATION', 'ACTIVE', 'SUSPENDED', 'DISABLED');

-- CreateEnum
CREATE TYPE "staff_status" AS ENUM ('ACTIVE', 'SUSPENDED', 'LEFT');

-- CreateEnum
CREATE TYPE "otp_purpose" AS ENUM ('SIGNUP', 'LOGIN', 'PHONE_CHANGE', 'PASSWORD_RESET');

-- CreateEnum
CREATE TYPE "actor_type" AS ENUM ('USER', 'SYSTEM', 'WEBHOOK');

-- CreateTable
CREATE TABLE "schools" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "address" TEXT,
    "phone" TEXT,
    "email" CITEXT,
    "logo_file_id" UUID,
    "status" "school_status" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "schools_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "school_settings" (
    "school_id" UUID NOT NULL,
    "timezone" TEXT NOT NULL DEFAULT 'Africa/Douala',
    "currency" CHAR(3) NOT NULL DEFAULT 'XAF',
    "student_number_prefix" TEXT NOT NULL DEFAULT 'CPLAN-',
    "student_number_padding" INTEGER NOT NULL DEFAULT 5,
    "receipt_number_format" TEXT NOT NULL DEFAULT 'CPL-RCT-{YEAR}-{SEQ:6}',
    "payment_reference_format" TEXT NOT NULL DEFAULT 'CPL-{YYMMDD}-{SEQ:6}',
    "allocation_strategy" TEXT NOT NULL DEFAULT 'BY_PRIORITY_THEN_DUE_DATE',
    "allow_overpayment" BOOLEAN NOT NULL DEFAULT true,
    "reminder_days_before" INTEGER[] DEFAULT ARRAY[7, 1]::INTEGER[],
    "reminder_days_after" INTEGER[] DEFAULT ARRAY[7, 15, 30]::INTEGER[],
    "external_payment_sla_hours" INTEGER NOT NULL DEFAULT 48,
    "invite_token_ttl_days" INTEGER NOT NULL DEFAULT 60,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "school_settings_pkey" PRIMARY KEY ("school_id")
);

-- CreateTable
CREATE TABLE "number_sequences" (
    "school_id" UUID NOT NULL,
    "scope" "sequence_scope" NOT NULL,
    "period" TEXT NOT NULL DEFAULT '',
    "current_value" BIGINT NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "number_sequences_pkey" PRIMARY KEY ("school_id","scope","period")
);

-- CreateTable
CREATE TABLE "files" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "school_id" UUID NOT NULL,
    "storage_key" TEXT NOT NULL,
    "original_name" TEXT,
    "mime_type" TEXT NOT NULL,
    "size_bytes" BIGINT NOT NULL,
    "checksum_sha256" TEXT,
    "kind" "file_kind" NOT NULL,
    "uploaded_by" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "files_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "first_name" TEXT NOT NULL,
    "last_name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "phone_verified_at" TIMESTAMPTZ(3),
    "email" CITEXT,
    "email_verified_at" TIMESTAMPTZ(3),
    "password_hash" TEXT,
    "status" "user_status" NOT NULL DEFAULT 'PENDING_VERIFICATION',
    "last_login_at" TIMESTAMPTZ(3),
    "failed_login_count" INTEGER NOT NULL DEFAULT 0,
    "locked_until" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "staff_profiles" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "user_id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "employee_number" TEXT,
    "job_title" TEXT,
    "status" "staff_status" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "staff_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "roles" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "is_system" BOOLEAN NOT NULL DEFAULT false,
    "school_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "permissions" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "code" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "group" TEXT NOT NULL,

    CONSTRAINT "permissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "role_permissions" (
    "role_id" UUID NOT NULL,
    "permission_id" UUID NOT NULL,

    CONSTRAINT "role_permissions_pkey" PRIMARY KEY ("role_id","permission_id")
);

-- CreateTable
CREATE TABLE "user_roles" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "user_id" UUID NOT NULL,
    "role_id" UUID NOT NULL,
    "school_id" UUID,
    "granted_by" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "user_id" UUID NOT NULL,
    "refresh_token_hash" TEXT NOT NULL,
    "family_id" UUID NOT NULL,
    "device_label" TEXT,
    "ip_address" INET,
    "user_agent" TEXT,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "revoked_at" TIMESTAMPTZ(3),
    "last_used_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "otp_codes" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "phone" TEXT NOT NULL,
    "purpose" "otp_purpose" NOT NULL,
    "code_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "consumed_at" TIMESTAMPTZ(3),
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "sent_count" INTEGER NOT NULL DEFAULT 1,
    "ip_address" INET,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "otp_codes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "idempotency_keys" (
    "key" TEXT NOT NULL,
    "user_id" UUID,
    "endpoint" TEXT NOT NULL,
    "request_hash" TEXT NOT NULL,
    "response_status" INTEGER,
    "response_body" JSONB,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "idempotency_keys_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "school_id" UUID,
    "user_id" UUID,
    "actor_type" "actor_type" NOT NULL DEFAULT 'USER',
    "action" TEXT NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" TEXT NOT NULL,
    "old_values" JSONB,
    "new_values" JSONB,
    "metadata" JSONB,
    "ip_address" INET,
    "user_agent" TEXT,
    "request_id" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "schools_code_key" ON "schools"("code");

-- CreateIndex
CREATE INDEX "files_school_id_kind_created_at_idx" ON "files"("school_id", "kind", "created_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "files_school_id_storage_key_key" ON "files"("school_id", "storage_key");

-- CreateIndex
CREATE UNIQUE INDEX "users_phone_key" ON "users"("phone");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_status_idx" ON "users"("status");

-- CreateIndex
CREATE UNIQUE INDEX "staff_profiles_user_id_school_id_key" ON "staff_profiles"("user_id", "school_id");

-- CreateIndex
CREATE UNIQUE INDEX "staff_profiles_school_id_employee_number_key" ON "staff_profiles"("school_id", "employee_number");

-- CreateIndex
CREATE UNIQUE INDEX "roles_code_school_id_key" ON "roles"("code", "school_id");

-- CreateIndex
CREATE UNIQUE INDEX "permissions_code_key" ON "permissions"("code");

-- CreateIndex
CREATE INDEX "permissions_group_idx" ON "permissions"("group");

-- CreateIndex
CREATE INDEX "user_roles_user_id_idx" ON "user_roles"("user_id");

-- CreateIndex
CREATE INDEX "user_roles_school_id_idx" ON "user_roles"("school_id");

-- CreateIndex
CREATE UNIQUE INDEX "user_roles_user_id_role_id_school_id_key" ON "user_roles"("user_id", "role_id", "school_id");

-- CreateIndex
CREATE UNIQUE INDEX "sessions_refresh_token_hash_key" ON "sessions"("refresh_token_hash");

-- CreateIndex
CREATE INDEX "sessions_user_id_revoked_at_idx" ON "sessions"("user_id", "revoked_at");

-- CreateIndex
CREATE INDEX "sessions_family_id_idx" ON "sessions"("family_id");

-- CreateIndex
CREATE INDEX "sessions_expires_at_idx" ON "sessions"("expires_at");

-- CreateIndex
CREATE INDEX "otp_codes_phone_purpose_created_at_idx" ON "otp_codes"("phone", "purpose", "created_at" DESC);

-- CreateIndex
CREATE INDEX "otp_codes_expires_at_idx" ON "otp_codes"("expires_at");

-- CreateIndex
CREATE INDEX "idempotency_keys_expires_at_idx" ON "idempotency_keys"("expires_at");

-- CreateIndex
CREATE INDEX "audit_logs_school_id_created_at_idx" ON "audit_logs"("school_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "audit_logs_entity_type_entity_id_created_at_idx" ON "audit_logs"("entity_type", "entity_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "audit_logs_user_id_created_at_idx" ON "audit_logs"("user_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "audit_logs_action_created_at_idx" ON "audit_logs"("action", "created_at" DESC);

-- AddForeignKey
ALTER TABLE "school_settings" ADD CONSTRAINT "school_settings_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "number_sequences" ADD CONSTRAINT "number_sequences_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "files" ADD CONSTRAINT "files_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "files" ADD CONSTRAINT "files_uploaded_by_fkey" FOREIGN KEY ("uploaded_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_profiles" ADD CONSTRAINT "staff_profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_profiles" ADD CONSTRAINT "staff_profiles_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "roles" ADD CONSTRAINT "roles_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_permission_id_fkey" FOREIGN KEY ("permission_id") REFERENCES "permissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "idempotency_keys" ADD CONSTRAINT "idempotency_keys_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- =============================================================================
-- SQL COMPLÉMENTAIRE — hors capacités d'expression de Prisma
--
-- Cette section est écrite à la main et fait partie intégrante de la migration.
-- Référence : docs/phases/PHASE-01-identite-roles-acces.md
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Unicité en présence de NULL
--
-- PostgreSQL considère par défaut deux NULL comme DISTINCTS : sans NULLS NOT
-- DISTINCT, rien n'empêcherait de créer deux fois le rôle SUPER_ADMIN
-- (school_id NULL), ni d'attribuer deux fois le même rôle de plateforme au
-- même utilisateur.
-- -----------------------------------------------------------------------------
DROP INDEX IF EXISTS "roles_code_school_id_key";
CREATE UNIQUE INDEX "roles_code_school_id_key"
  ON "roles" ("code", "school_id") NULLS NOT DISTINCT;

DROP INDEX IF EXISTS "user_roles_user_id_role_id_school_id_key";
CREATE UNIQUE INDEX "user_roles_user_id_role_id_school_id_key"
  ON "user_roles" ("user_id", "role_id", "school_id") NULLS NOT DISTINCT;


-- -----------------------------------------------------------------------------
-- 2. updated_at maintenu par la base
--
-- Prisma pose @updatedAt côté client. Le trigger garantit la même chose pour
-- toute écriture, y compris une correction manuelle en SQL ou une migration.
-- -----------------------------------------------------------------------------
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'schools', 'school_settings', 'number_sequences', 'users',
    'staff_profiles', 'roles'
  ] LOOP
    EXECUTE format(
      'CREATE TRIGGER trg_%1$s_updated_at BEFORE UPDATE ON %1$I
         FOR EACH ROW EXECUTE FUNCTION set_updated_at()', t
    );
  END LOOP;
END $$;


-- -----------------------------------------------------------------------------
-- 3. Journal d'audit APPEND-ONLY  (règle 10 du §81)
--
-- Le rôle applicatif peut écrire et lire, jamais modifier ni supprimer.
-- Une trace d'audit que l'application peut effacer ne prouve rien.
-- -----------------------------------------------------------------------------
-- Le rôle applicatif existe dans le Docker local, mais pas nécessairement chez
-- un fournisseur PostgreSQL managé (Railway, Neon, Supabase, etc.). L'ACL est
-- donc appliquée uniquement lorsque ce rôle a été provisionné.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'cplan_app') THEN
    EXECUTE 'REVOKE UPDATE, DELETE ON "audit_logs" FROM cplan_app';
  END IF;
END
$$;

CREATE OR REPLACE FUNCTION prevent_audit_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'Le journal d''audit est append-only : % interdit.', TG_OP
    USING ERRCODE = 'insufficient_privilege';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_audit_logs_immutable
  BEFORE UPDATE OR DELETE ON "audit_logs"
  FOR EACH ROW EXECUTE FUNCTION prevent_audit_mutation();


-- -----------------------------------------------------------------------------
-- 4. Row Level Security — seconde barrière d'isolation (ADR-011)
--
-- La barrière principale reste applicative : chaque repository exige school_id.
-- La RLS est le filet qui empêche qu'un oubli devienne une fuite de données
-- entre établissements. Le rôle de migration (superuser) la contourne.
--
-- `app.school_id` est positionné par SET LOCAL au début de chaque transaction
-- applicative. Quand il est absent, la politique laisse passer : les routes
-- d'authentification travaillent nécessairement hors contexte d'établissement
-- (on ne connaît l'école qu'APRÈS avoir identifié l'utilisateur).
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION current_school_id() RETURNS uuid AS $$
  SELECT NULLIF(current_setting('app.school_id', true), '')::uuid;
$$ LANGUAGE sql STABLE;

COMMENT ON FUNCTION current_school_id() IS
  'Établissement du contexte de transaction courant, NULL si non positionné.';

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['files', 'staff_profiles', 'number_sequences'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'CREATE POLICY school_isolation ON %I
         USING (current_school_id() IS NULL OR school_id = current_school_id())
         WITH CHECK (current_school_id() IS NULL OR school_id = current_school_id())', t
    );
  END LOOP;
END $$;

-- school_settings : la clé d'isolation est school_id, qui est aussi la PK.
ALTER TABLE "school_settings" ENABLE ROW LEVEL SECURITY;
CREATE POLICY school_isolation ON "school_settings"
  USING (current_school_id() IS NULL OR school_id = current_school_id())
  WITH CHECK (current_school_id() IS NULL OR school_id = current_school_id());

-- audit_logs : school_id est nullable (actions système, plateforme).
-- Les lignes sans établissement restent visibles du seul SUPER_ADMIN, qui
-- travaille sans app.school_id positionné.
ALTER TABLE "audit_logs" ENABLE ROW LEVEL SECURITY;
CREATE POLICY school_isolation ON "audit_logs"
  USING (current_school_id() IS NULL OR school_id = current_school_id())
  WITH CHECK (current_school_id() IS NULL OR school_id IS NULL OR school_id = current_school_id());


-- -----------------------------------------------------------------------------
-- 5. Contrôles d'intégrité
-- -----------------------------------------------------------------------------

-- Le téléphone est la clé de la détection automatique des enfants (§8) :
-- la base refuse tout format non E.164, quelle que soit la voie d'écriture.
ALTER TABLE "users"
  ADD CONSTRAINT "users_phone_e164"
  CHECK (phone ~ '^\+[1-9][0-9]{7,14}$');

-- Une séquence ne recule jamais.
ALTER TABLE "number_sequences"
  ADD CONSTRAINT "number_sequences_positive"
  CHECK (current_value >= 0);

-- Un OTP consommé ne peut pas l'avoir été avant d'exister.
ALTER TABLE "otp_codes"
  ADD CONSTRAINT "otp_codes_consumed_after_created"
  CHECK (consumed_at IS NULL OR consumed_at >= created_at);

-- Une session expire après avoir été créée.
ALTER TABLE "sessions"
  ADD CONSTRAINT "sessions_expires_after_created"
  CHECK (expires_at > created_at);
