-- Phase 11: Mobile Money, événements opérateurs et rapprochement.
CREATE TYPE "provider_event_status" AS ENUM ('RECEIVED', 'INVALID_SIGNATURE', 'ORPHAN', 'AMOUNT_MISMATCH', 'PROCESSED', 'IGNORED', 'ERROR');
CREATE TYPE "mobile_money_reconciliation_status" AS ENUM ('MATCHED', 'OPERATOR_ONLY', 'LOCAL_ONLY', 'AMOUNT_MISMATCH');

ALTER TABLE "payments"
  ADD COLUMN "provider_financial_id" TEXT,
  ADD COLUMN "provider_status_checked_at" TIMESTAMPTZ(3),
  ADD COLUMN "tracking_abandoned_at" TIMESTAMPTZ(3),
  ADD COLUMN "investigation_at" TIMESTAMPTZ(3);

CREATE TABLE "payment_targets" (
  "id" UUID NOT NULL DEFAULT uuidv7(), "payment_id" UUID NOT NULL,
  "school_id" UUID NOT NULL, "student_id" UUID NOT NULL, "enrollment_id" UUID NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "payment_targets_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "payment_provider_events" (
  "id" UUID NOT NULL DEFAULT uuidv7(), "school_id" UUID, "payment_id" UUID,
  "provider" TEXT NOT NULL, "event_id" TEXT NOT NULL,
  "status" "provider_event_status" NOT NULL DEFAULT 'RECEIVED',
  "signature_valid" BOOLEAN, "amount" BIGINT, "raw_payload" JSONB NOT NULL,
  "headers" JSONB NOT NULL DEFAULT '{}', "reason" TEXT,
  "received_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "processed_at" TIMESTAMPTZ(3),
  CONSTRAINT "payment_provider_events_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "mobile_money_reconciliations" (
  "id" UUID NOT NULL DEFAULT uuidv7(), "school_id" UUID, "payment_id" UUID,
  "provider" TEXT NOT NULL, "provider_reference" TEXT,
  "status" "mobile_money_reconciliation_status" NOT NULL,
  "operator_amount" BIGINT, "local_amount" BIGINT, "details" JSONB NOT NULL DEFAULT '{}',
  "detected_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "resolved_at" TIMESTAMPTZ(3),
  CONSTRAINT "mobile_money_reconciliations_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "payment_targets_payment_id_enrollment_id_key" ON "payment_targets"("payment_id", "enrollment_id");
CREATE INDEX "payment_targets_school_id_student_id_idx" ON "payment_targets"("school_id", "student_id");
CREATE INDEX "payment_targets_enrollment_id_idx" ON "payment_targets"("enrollment_id");
CREATE UNIQUE INDEX "payment_provider_events_provider_event_id_key" ON "payment_provider_events"("provider", "event_id");
CREATE INDEX "payment_provider_events_payment_id_idx" ON "payment_provider_events"("payment_id");
CREATE INDEX "payment_provider_events_school_id_status_received_at_idx" ON "payment_provider_events"("school_id", "status", "received_at" DESC);
CREATE INDEX "mobile_money_reconciliations_provider_status_detected_at_idx" ON "mobile_money_reconciliations"("provider", "status", "detected_at" DESC);
CREATE INDEX "mobile_money_reconciliations_school_id_status_idx" ON "mobile_money_reconciliations"("school_id", "status");
CREATE INDEX "payments_provider_status_initiated_at_idx" ON "payments"("provider", "status", "initiated_at");
CREATE INDEX "payments_mobile_money_processing_idx" ON "payments"("provider", "initiated_at") WHERE status IN ('PROCESSING', 'PENDING_INVESTIGATION');

ALTER TABLE "payment_targets" ADD CONSTRAINT "payment_targets_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "payments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "payment_targets" ADD CONSTRAINT "payment_targets_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "payment_targets" ADD CONSTRAINT "payment_targets_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "payment_targets" ADD CONSTRAINT "payment_targets_enrollment_id_fkey" FOREIGN KEY ("enrollment_id") REFERENCES "enrollments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "payment_provider_events" ADD CONSTRAINT "payment_provider_events_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "payment_provider_events" ADD CONSTRAINT "payment_provider_events_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "payments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "mobile_money_reconciliations" ADD CONSTRAINT "mobile_money_reconciliations_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "mobile_money_reconciliations" ADD CONSTRAINT "mobile_money_reconciliations_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "payments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "payment_targets" ENABLE ROW LEVEL SECURITY;
CREATE POLICY school_isolation ON "payment_targets" USING (current_school_id() IS NULL OR school_id = current_school_id()) WITH CHECK (current_school_id() IS NULL OR school_id = current_school_id());
ALTER TABLE "payment_provider_events" ENABLE ROW LEVEL SECURITY;
CREATE POLICY school_isolation ON "payment_provider_events" USING (current_school_id() IS NULL OR school_id IS NULL OR school_id = current_school_id()) WITH CHECK (current_school_id() IS NULL OR school_id IS NULL OR school_id = current_school_id());
ALTER TABLE "mobile_money_reconciliations" ENABLE ROW LEVEL SECURITY;
CREATE POLICY school_isolation ON "mobile_money_reconciliations" USING (current_school_id() IS NULL OR school_id IS NULL OR school_id = current_school_id()) WITH CHECK (current_school_id() IS NULL OR school_id IS NULL OR school_id = current_school_id());

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'cplan_app') THEN
    EXECUTE 'REVOKE DELETE ON payment_targets, payment_provider_events, mobile_money_reconciliations FROM cplan_app';
  END IF;
END
$$;
