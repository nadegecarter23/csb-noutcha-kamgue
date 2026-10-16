-- Phases 12-13 : preuves de paiements externes et moteur de notifications.
CREATE TYPE "external_payment_status" AS ENUM ('AWAITING_VALIDATION', 'CORRECTION_REQUESTED', 'VALIDATED', 'REJECTED', 'CANCELLED');
CREATE TYPE "notification_channel" AS ENUM ('IN_APP', 'PUSH', 'SMS', 'EMAIL');
CREATE TYPE "notification_delivery_status" AS ENUM ('PENDING', 'SENDING', 'DELIVERED', 'FAILED', 'DEAD_LETTER', 'SKIPPED');

ALTER TABLE "school_settings"
  ADD COLUMN "sms_enabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "sms_allowed_types" TEXT[] NOT NULL DEFAULT ARRAY['PAYMENT_CONFIRMED','EXTERNAL_PAYMENT_REJECTED','INSTALLMENT_OVERDUE']::TEXT[],
  ADD COLUMN "sms_monthly_limit" BIGINT NOT NULL DEFAULT 50000,
  ADD COLUMN "notification_start_hour" INTEGER NOT NULL DEFAULT 8,
  ADD COLUMN "notification_end_hour" INTEGER NOT NULL DEFAULT 19,
  ADD COLUMN "balance_reminder_enabled" BOOLEAN NOT NULL DEFAULT false,
  ADD CONSTRAINT "school_settings_notification_hours_check" CHECK (notification_start_hour >= 0 AND notification_start_hour <= 23 AND notification_end_hour > notification_start_hour AND notification_end_hour <= 24),
  ADD CONSTRAINT "school_settings_sms_limit_check" CHECK (sms_monthly_limit >= 0);

ALTER TABLE "devices" ADD COLUMN "app_version" TEXT;
ALTER TABLE "notifications"
  ADD COLUMN "dedup_key" TEXT,
  ADD COLUMN "is_critical" BOOLEAN NOT NULL DEFAULT false;
CREATE UNIQUE INDEX "notifications_user_id_dedup_key_key" ON "notifications"("user_id", "dedup_key");

CREATE TABLE "external_payment_declarations" (
  "id" UUID NOT NULL DEFAULT uuidv7(), "school_id" UUID NOT NULL,
  "payment_id" UUID NOT NULL, "enrollment_id" UUID NOT NULL, "student_id" UUID NOT NULL,
  "declared_by_user_id" UUID NOT NULL, "declared_amount" BIGINT NOT NULL,
  "credited_amount" BIGINT, "bank_name" TEXT, "payment_date" DATE NOT NULL,
  "external_reference" TEXT NOT NULL, "notes" TEXT, "internal_note" TEXT,
  "correction_message" TEXT, "rejection_reason" TEXT,
  "duplicate_warning" BOOLEAN NOT NULL DEFAULT false,
  "status" "external_payment_status" NOT NULL DEFAULT 'AWAITING_VALIDATION',
  "submitted_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "decided_at" TIMESTAMPTZ(3), "decided_by" UUID,
  CONSTRAINT "external_payment_declarations_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "external_payment_declarations_amount_check" CHECK (declared_amount > 0 AND (credited_amount IS NULL OR credited_amount > 0))
);
CREATE UNIQUE INDEX "external_payment_declarations_payment_id_key" ON "external_payment_declarations"("payment_id");
CREATE INDEX "external_payment_declarations_school_id_status_submitted_at_idx" ON "external_payment_declarations"("school_id", "status", "submitted_at");
CREATE INDEX "external_payment_declarations_declared_by_user_id_submitted_at_idx" ON "external_payment_declarations"("declared_by_user_id", "submitted_at" DESC);
CREATE INDEX "external_payment_declarations_student_id_external_reference_payment_date_idx" ON "external_payment_declarations"("student_id", "external_reference", "payment_date");
CREATE INDEX "external_payment_declarations_pending_idx" ON "external_payment_declarations"("school_id", "submitted_at") WHERE status IN ('AWAITING_VALIDATION','CORRECTION_REQUESTED');

CREATE TABLE "external_payment_proofs" (
  "id" UUID NOT NULL DEFAULT uuidv7(), "school_id" UUID NOT NULL,
  "declaration_id" UUID NOT NULL, "file_id" UUID NOT NULL,
  "order_index" INTEGER NOT NULL DEFAULT 0,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "external_payment_proofs_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "external_payment_proofs_file_id_key" ON "external_payment_proofs"("file_id");
CREATE UNIQUE INDEX "external_payment_proofs_declaration_id_order_index_key" ON "external_payment_proofs"("declaration_id", "order_index");
CREATE INDEX "external_payment_proofs_school_id_created_at_idx" ON "external_payment_proofs"("school_id", "created_at" DESC);

CREATE TABLE "notification_preferences" (
  "user_id" UUID NOT NULL, "push_enabled" BOOLEAN NOT NULL DEFAULT true,
  "sms_enabled" BOOLEAN NOT NULL DEFAULT true, "email_enabled" BOOLEAN NOT NULL DEFAULT true,
  "payment_enabled" BOOLEAN NOT NULL DEFAULT true, "reminder_enabled" BOOLEAN NOT NULL DEFAULT true,
  "news_enabled" BOOLEAN NOT NULL DEFAULT false, "updated_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "notification_preferences_pkey" PRIMARY KEY ("user_id")
);
CREATE TABLE "notification_templates" (
  "id" UUID NOT NULL DEFAULT uuidv7(), "school_id" UUID NOT NULL,
  "type" TEXT NOT NULL, "channel" "notification_channel" NOT NULL,
  "title" TEXT, "body" TEXT NOT NULL, "is_active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "notification_templates_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "notification_templates_school_id_type_channel_key" ON "notification_templates"("school_id","type","channel");
CREATE INDEX "notification_templates_school_id_type_idx" ON "notification_templates"("school_id","type");
CREATE TABLE "notification_deliveries" (
  "id" UUID NOT NULL DEFAULT uuidv7(), "notification_id" UUID NOT NULL,
  "school_id" UUID, "channel" "notification_channel" NOT NULL,
  "status" "notification_delivery_status" NOT NULL DEFAULT 'PENDING',
  "attempts" INTEGER NOT NULL DEFAULT 0, "max_attempts" INTEGER NOT NULL DEFAULT 3,
  "provider_message_id" TEXT, "error" TEXT, "cost" BIGINT NOT NULL DEFAULT 0,
  "next_attempt_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "sent_at" TIMESTAMPTZ(3), "delivered_at" TIMESTAMPTZ(3),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "notification_deliveries_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "notification_deliveries_notification_id_channel_key" ON "notification_deliveries"("notification_id","channel");
CREATE INDEX "notification_deliveries_status_next_attempt_at_idx" ON "notification_deliveries"("status","next_attempt_at");
CREATE INDEX "notification_deliveries_school_id_channel_created_at_idx" ON "notification_deliveries"("school_id","channel","created_at");
CREATE INDEX "notification_deliveries_pending_idx" ON "notification_deliveries"("next_attempt_at") WHERE status IN ('PENDING','FAILED');

ALTER TABLE "external_payment_declarations" ADD CONSTRAINT "external_payment_declarations_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "external_payment_declarations" ADD CONSTRAINT "external_payment_declarations_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "payments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "external_payment_declarations" ADD CONSTRAINT "external_payment_declarations_enrollment_id_fkey" FOREIGN KEY ("enrollment_id") REFERENCES "enrollments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "external_payment_declarations" ADD CONSTRAINT "external_payment_declarations_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "external_payment_declarations" ADD CONSTRAINT "external_payment_declarations_declared_by_user_id_fkey" FOREIGN KEY ("declared_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "external_payment_declarations" ADD CONSTRAINT "external_payment_declarations_decided_by_fkey" FOREIGN KEY ("decided_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "external_payment_proofs" ADD CONSTRAINT "external_payment_proofs_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "external_payment_proofs" ADD CONSTRAINT "external_payment_proofs_declaration_id_fkey" FOREIGN KEY ("declaration_id") REFERENCES "external_payment_declarations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "external_payment_proofs" ADD CONSTRAINT "external_payment_proofs_file_id_fkey" FOREIGN KEY ("file_id") REFERENCES "files"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "notification_preferences" ADD CONSTRAINT "notification_preferences_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "notification_templates" ADD CONSTRAINT "notification_templates_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "notification_deliveries" ADD CONSTRAINT "notification_deliveries_notification_id_fkey" FOREIGN KEY ("notification_id") REFERENCES "notifications"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "notification_deliveries" ADD CONSTRAINT "notification_deliveries_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "external_payment_declarations" ENABLE ROW LEVEL SECURITY;
CREATE POLICY school_isolation ON "external_payment_declarations" USING (current_school_id() IS NULL OR school_id = current_school_id()) WITH CHECK (current_school_id() IS NULL OR school_id = current_school_id());
ALTER TABLE "external_payment_proofs" ENABLE ROW LEVEL SECURITY;
CREATE POLICY school_isolation ON "external_payment_proofs" USING (current_school_id() IS NULL OR school_id = current_school_id()) WITH CHECK (current_school_id() IS NULL OR school_id = current_school_id());
ALTER TABLE "notification_templates" ENABLE ROW LEVEL SECURITY;
CREATE POLICY school_isolation ON "notification_templates" USING (current_school_id() IS NULL OR school_id = current_school_id()) WITH CHECK (current_school_id() IS NULL OR school_id = current_school_id());
ALTER TABLE "notification_deliveries" ENABLE ROW LEVEL SECURITY;
CREATE POLICY school_isolation ON "notification_deliveries" USING (current_school_id() IS NULL OR school_id IS NULL OR school_id = current_school_id()) WITH CHECK (current_school_id() IS NULL OR school_id IS NULL OR school_id = current_school_id());

INSERT INTO "permissions" ("id","code","description","group") VALUES
  (uuidv7(),'notifications.manage','Configurer les modèles de notification','notifications'),
  (uuidv7(),'notifications.broadcast','Envoyer une annonce aux familles','notifications'),
  (uuidv7(),'notifications.read_stats','Consulter les statistiques de livraison','notifications')
ON CONFLICT ("code") DO NOTHING;
INSERT INTO "role_permissions" ("role_id","permission_id")
SELECT r.id, p.id FROM roles r CROSS JOIN permissions p
WHERE r.code = 'SCHOOL_ADMIN' AND p.code IN ('notifications.manage','notifications.broadcast','notifications.read_stats')
   OR r.code = 'DIRECTOR' AND p.code = 'notifications.read_stats'
   OR r.code = 'ACCOUNTANT' AND p.code IN ('notifications.manage','notifications.read_stats')
ON CONFLICT DO NOTHING;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'cplan_app') THEN
    EXECUTE 'REVOKE DELETE ON external_payment_declarations, external_payment_proofs, notification_deliveries FROM cplan_app';
  END IF;
END
$$;
