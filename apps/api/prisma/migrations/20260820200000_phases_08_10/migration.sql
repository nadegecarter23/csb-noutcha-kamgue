-- Phases 08-10: caisse physique, appareils et notifications parent.
CREATE TYPE "cash_session_status" AS ENUM ('OPEN', 'CLOSED', 'RECONCILED');
CREATE TYPE "cash_movement_type" AS ENUM ('OPENING_FLOAT', 'PAYMENT', 'CASH_IN', 'CASH_OUT');
CREATE TYPE "device_platform" AS ENUM ('ANDROID', 'IOS', 'WEB');
CREATE TYPE "device_status" AS ENUM ('ACTIVE', 'REVOKED');

CREATE TABLE "cash_sessions" (
  "id" UUID NOT NULL DEFAULT uuidv7(), "school_id" UUID NOT NULL,
  "cashier_user_id" UUID NOT NULL, "status" "cash_session_status" NOT NULL DEFAULT 'OPEN',
  "opening_float" BIGINT NOT NULL DEFAULT 0, "opened_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "closed_at" TIMESTAMPTZ(3), "expected_amounts" JSONB, "declared_amounts" JSONB,
  "variance" BIGINT, "variance_reason" TEXT, "reconciled_at" TIMESTAMPTZ(3),
  "reconciled_by" UUID, "notes" TEXT, "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "cash_sessions_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "cash_session_movements" (
  "id" UUID NOT NULL DEFAULT uuidv7(), "school_id" UUID NOT NULL, "session_id" UUID NOT NULL,
  "payment_id" UUID, "type" "cash_movement_type" NOT NULL, "amount" BIGINT NOT NULL,
  "note" TEXT, "created_by" UUID, "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "cash_session_movements_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "devices" (
  "id" UUID NOT NULL DEFAULT uuidv7(), "user_id" UUID NOT NULL, "push_token" TEXT NOT NULL,
  "platform" "device_platform" NOT NULL, "status" "device_status" NOT NULL DEFAULT 'ACTIVE',
  "device_label" TEXT, "last_seen_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "devices_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "notifications" (
  "id" UUID NOT NULL DEFAULT uuidv7(), "user_id" UUID NOT NULL, "school_id" UUID,
  "type" TEXT NOT NULL, "title" TEXT NOT NULL, "body" TEXT NOT NULL, "data" JSONB NOT NULL DEFAULT '{}',
  "read_at" TIMESTAMPTZ(3), "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "payments" ADD COLUMN "cash_session_id" UUID, ADD COLUMN "note" TEXT;
ALTER TABLE "cash_sessions" ADD CONSTRAINT "cash_sessions_opening_float_nonnegative" CHECK (opening_float >= 0);
ALTER TABLE "cash_session_movements" ADD CONSTRAINT "cash_session_movements_amount_nonzero" CHECK (amount <> 0);

CREATE UNIQUE INDEX "cash_sessions_one_open_per_cashier" ON "cash_sessions"("cashier_user_id") WHERE status = 'OPEN';
CREATE INDEX "cash_sessions_school_id_status_opened_at_idx" ON "cash_sessions"("school_id", "status", "opened_at" DESC);
CREATE INDEX "cash_sessions_cashier_user_id_status_idx" ON "cash_sessions"("cashier_user_id", "status");
CREATE INDEX "cash_sessions_reconciled_by_idx" ON "cash_sessions"("reconciled_by");
CREATE UNIQUE INDEX "cash_session_movements_payment_id_key" ON "cash_session_movements"("payment_id");
CREATE INDEX "cash_session_movements_session_id_created_at_idx" ON "cash_session_movements"("session_id", "created_at");
CREATE INDEX "cash_session_movements_school_id_created_at_idx" ON "cash_session_movements"("school_id", "created_at");
CREATE INDEX "cash_session_movements_created_by_idx" ON "cash_session_movements"("created_by");
CREATE UNIQUE INDEX "devices_push_token_key" ON "devices"("push_token");
CREATE INDEX "devices_user_id_status_idx" ON "devices"("user_id", "status");
CREATE INDEX "notifications_user_id_read_at_created_at_idx" ON "notifications"("user_id", "read_at", "created_at" DESC);
CREATE INDEX "notifications_school_id_created_at_idx" ON "notifications"("school_id", "created_at" DESC);
CREATE INDEX "payments_cash_session_id_paid_at_idx" ON "payments"("cash_session_id", "paid_at" DESC);

ALTER TABLE "cash_sessions" ADD CONSTRAINT "cash_sessions_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "cash_sessions" ADD CONSTRAINT "cash_sessions_cashier_user_id_fkey" FOREIGN KEY ("cashier_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "cash_sessions" ADD CONSTRAINT "cash_sessions_reconciled_by_fkey" FOREIGN KEY ("reconciled_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "cash_session_movements" ADD CONSTRAINT "cash_session_movements_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "cash_session_movements" ADD CONSTRAINT "cash_session_movements_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "cash_sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "cash_session_movements" ADD CONSTRAINT "cash_session_movements_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "payments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "cash_session_movements" ADD CONSTRAINT "cash_session_movements_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "payments" ADD CONSTRAINT "payments_cash_session_id_fkey" FOREIGN KEY ("cash_session_id") REFERENCES "cash_sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "devices" ADD CONSTRAINT "devices_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "cash_sessions" ENABLE ROW LEVEL SECURITY;
CREATE POLICY school_isolation ON "cash_sessions" USING (current_school_id() IS NULL OR school_id = current_school_id()) WITH CHECK (current_school_id() IS NULL OR school_id = current_school_id());
ALTER TABLE "cash_session_movements" ENABLE ROW LEVEL SECURITY;
CREATE POLICY school_isolation ON "cash_session_movements" USING (current_school_id() IS NULL OR school_id = current_school_id()) WITH CHECK (current_school_id() IS NULL OR school_id = current_school_id());
ALTER TABLE "notifications" ENABLE ROW LEVEL SECURITY;
CREATE POLICY school_isolation ON "notifications" USING (current_school_id() IS NULL OR school_id IS NULL OR school_id = current_school_id()) WITH CHECK (current_school_id() IS NULL OR school_id IS NULL OR school_id = current_school_id());

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'cplan_app') THEN
    EXECUTE 'REVOKE DELETE ON cash_sessions, cash_session_movements FROM cplan_app';
  END IF;
END
$$;
CREATE TRIGGER trg_cash_sessions_updated_at BEFORE UPDATE ON "cash_sessions" FOR EACH ROW EXECUTE FUNCTION set_updated_at();
