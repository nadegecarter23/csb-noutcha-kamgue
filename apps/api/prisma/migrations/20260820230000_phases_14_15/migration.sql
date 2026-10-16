CREATE TYPE "export_type" AS ENUM ('STUDENTS_LIST','STUDENTS_BY_CLASS','PAID_STUDENTS','UNPAID_STUDENTS','STUDENT_FINANCIAL_STATEMENT','PAYMENTS_BY_PERIOD','PAYMENTS_BY_OPERATOR','PAYMENTS_BY_CLASS','RECEIPTS','OUTSTANDING');
CREATE TYPE "export_format" AS ENUM ('PDF','XLSX','CSV');
CREATE TYPE "export_status" AS ENUM ('PROCESSING','READY','FAILED','EXPIRED');

CREATE TABLE "saved_report_queries" (
  "id" uuid PRIMARY KEY DEFAULT uuidv7(), "school_id" uuid NOT NULL, "user_id" uuid NOT NULL,
  "name" text NOT NULL, "criteria" jsonb NOT NULL, "created_at" timestamptz(3) NOT NULL DEFAULT now(),
  "updated_at" timestamptz(3) NOT NULL DEFAULT now(),
  CONSTRAINT "saved_report_queries_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT,
  CONSTRAINT "saved_report_queries_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT
);

CREATE TABLE "export_jobs" (
  "id" uuid PRIMARY KEY DEFAULT uuidv7(), "school_id" uuid NOT NULL, "user_id" uuid NOT NULL,
  "type" export_type NOT NULL, "format" export_format NOT NULL, "filters" jsonb NOT NULL DEFAULT '{}',
  "options" jsonb NOT NULL DEFAULT '{}', "status" export_status NOT NULL DEFAULT 'PROCESSING',
  "row_count" integer, "file_id" uuid UNIQUE, "error" text, "requested_at" timestamptz(3) NOT NULL DEFAULT now(),
  "completed_at" timestamptz(3), "expires_at" timestamptz(3),
  CONSTRAINT "export_jobs_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT,
  CONSTRAINT "export_jobs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT,
  CONSTRAINT "export_jobs_file_id_fkey" FOREIGN KEY ("file_id") REFERENCES "files"("id") ON DELETE SET NULL
);

CREATE TABLE "document_templates" (
  "school_id" uuid PRIMARY KEY, "header_text" text, "footer_text" text, "legal_notice" text,
  "default_signatory" text, "updated_at" timestamptz(3) NOT NULL DEFAULT now(),
  CONSTRAINT "document_templates_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE
);

CREATE INDEX "saved_report_queries_school_user_updated_idx" ON "saved_report_queries" ("school_id","user_id","updated_at" DESC);
CREATE INDEX "export_jobs_school_user_requested_idx" ON "export_jobs" ("school_id","user_id","requested_at" DESC);
CREATE INDEX "export_jobs_status_requested_idx" ON "export_jobs" ("status","requested_at");
CREATE INDEX "export_jobs_expires_idx" ON "export_jobs" ("expires_at");

-- Index couvrants des parcours de reporting : égalités avant les plages temporelles.
DROP INDEX IF EXISTS "payments_school_id_status_paid_at_idx";
CREATE INDEX "payments_reporting_idx" ON "payments" ("school_id","status","paid_at" DESC) INCLUDE ("amount","payment_method","provider");
DROP INDEX IF EXISTS "payment_allocations_school_id_enrollment_id_idx";
CREATE INDEX "payment_allocations_reporting_idx" ON "payment_allocations" ("school_id","enrollment_id") INCLUDE ("amount","payment_id");
CREATE INDEX "student_fee_assignments_reporting_idx" ON "student_fee_assignments" ("school_id","enrollment_id","status") INCLUDE ("final_amount","paid_amount");
CREATE INDEX "enrollments_reporting_idx" ON "enrollments" ("school_id","academic_year_id","class_id","status");
CREATE INDEX "payments_provider_reference_search_idx" ON "payments" ("school_id","provider_reference") WHERE "provider_reference" IS NOT NULL;

ALTER TABLE "saved_report_queries" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "export_jobs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "document_templates" ENABLE ROW LEVEL SECURITY;
CREATE POLICY school_isolation ON "saved_report_queries" USING (current_school_id() IS NULL OR school_id = current_school_id()) WITH CHECK (current_school_id() IS NULL OR school_id = current_school_id());
CREATE POLICY school_isolation ON "export_jobs" USING (current_school_id() IS NULL OR school_id = current_school_id()) WITH CHECK (current_school_id() IS NULL OR school_id = current_school_id());
CREATE POLICY school_isolation ON "document_templates" USING (current_school_id() IS NULL OR school_id = current_school_id()) WITH CHECK (current_school_id() IS NULL OR school_id = current_school_id());

CREATE TRIGGER trg_saved_report_queries_updated_at BEFORE UPDATE ON "saved_report_queries" FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_document_templates_updated_at BEFORE UPDATE ON "document_templates" FOR EACH ROW EXECUTE FUNCTION set_updated_at();
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'cplan_app') THEN
    EXECUTE 'REVOKE DELETE ON export_jobs FROM cplan_app';
  END IF;
END
$$;
