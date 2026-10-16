-- CreateEnum
CREATE TYPE "import_batch_type" AS ENUM ('STUDENTS', 'GUARDIANS', 'FEES');

-- CreateEnum
CREATE TYPE "import_batch_status" AS ENUM ('UPLOADED', 'MAPPED', 'VALIDATED', 'IMPORTING', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "import_row_status" AS ENUM ('PENDING', 'VALID', 'ERROR', 'IMPORTED', 'SKIPPED');

-- CreateEnum
CREATE TYPE "fee_status" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "fee_structure_status" AS ENUM ('DRAFT', 'ACTIVE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "fee_installment_status" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "student_fee_status" AS ENUM ('PENDING', 'PARTIALLY_PAID', 'PAID', 'WAIVED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "student_installment_status" AS ENUM ('UPCOMING', 'DUE', 'PARTIALLY_PAID', 'PAID', 'OVERDUE', 'CANCELLED');

-- CreateEnum
CREATE TYPE "discount_type" AS ENUM ('PERCENTAGE', 'FIXED_AMOUNT');

-- CreateEnum
CREATE TYPE "discount_category" AS ENUM ('FRATRIE', 'BOURSE', 'PERSONNEL', 'SOCIAL', 'COMMERCIAL', 'AUTRE');

-- CreateEnum
CREATE TYPE "discount_status" AS ENUM ('PENDING_APPROVAL', 'APPROVED', 'REJECTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "payment_method" AS ENUM ('MOBILE_MONEY', 'CASH', 'BANK_TRANSFER', 'BANK_DEPOSIT', 'CHEQUE', 'OTHER');

-- CreateEnum
CREATE TYPE "payment_status" AS ENUM ('PENDING', 'PROCESSING', 'AWAITING_VALIDATION', 'SUCCESS', 'FAILED', 'REJECTED', 'CANCELLED', 'REVERSED', 'REFUNDED');

-- CreateEnum
CREATE TYPE "payment_channel" AS ENUM ('PARENT_APP', 'CASHIER', 'BACKOFFICE', 'WEBHOOK');

-- CreateTable
CREATE TABLE "import_batches" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "school_id" UUID NOT NULL,
    "file_id" UUID,
    "type" "import_batch_type" NOT NULL DEFAULT 'STUDENTS',
    "academic_year_id" UUID,
    "column_mapping" JSONB NOT NULL DEFAULT '{}',
    "status" "import_batch_status" NOT NULL DEFAULT 'UPLOADED',
    "total_rows" INTEGER NOT NULL DEFAULT 0,
    "valid_rows" INTEGER NOT NULL DEFAULT 0,
    "error_rows" INTEGER NOT NULL DEFAULT 0,
    "imported_rows" INTEGER NOT NULL DEFAULT 0,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "import_batches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "import_rows" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "batch_id" UUID NOT NULL,
    "row_number" INTEGER NOT NULL,
    "raw_data" JSONB NOT NULL,
    "normalized_data" JSONB,
    "errors" JSONB NOT NULL DEFAULT '[]',
    "status" "import_row_status" NOT NULL DEFAULT 'PENDING',
    "created_entity_id" UUID,

    CONSTRAINT "import_rows_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fee_types" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "school_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT,
    "is_mandatory" BOOLEAN NOT NULL DEFAULT true,
    "priority" INTEGER NOT NULL DEFAULT 100,
    "status" "fee_status" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "fee_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fee_structures" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "school_id" UUID NOT NULL,
    "academic_year_id" UUID NOT NULL,
    "fee_type_id" UUID NOT NULL,
    "grade_level_id" UUID,
    "class_id" UUID,
    "student_category_id" UUID,
    "name" TEXT NOT NULL,
    "amount" BIGINT NOT NULL,
    "is_mandatory" BOOLEAN NOT NULL DEFAULT true,
    "allow_partial_payment" BOOLEAN NOT NULL DEFAULT true,
    "allow_full_payment" BOOLEAN NOT NULL DEFAULT true,
    "allow_free_amount" BOOLEAN NOT NULL DEFAULT true,
    "enforce_installment_order" BOOLEAN NOT NULL DEFAULT false,
    "opens_at" DATE,
    "due_date" DATE,
    "status" "fee_structure_status" NOT NULL DEFAULT 'DRAFT',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "fee_structures_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fee_installments" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "fee_structure_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "amount" BIGINT NOT NULL,
    "due_date" DATE NOT NULL,
    "order_index" INTEGER NOT NULL,
    "status" "fee_installment_status" NOT NULL DEFAULT 'ACTIVE',

    CONSTRAINT "fee_installments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "student_fee_assignments" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "school_id" UUID NOT NULL,
    "enrollment_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "fee_structure_id" UUID NOT NULL,
    "fee_type_id" UUID NOT NULL,
    "original_amount" BIGINT NOT NULL,
    "discount_amount" BIGINT NOT NULL DEFAULT 0,
    "final_amount" BIGINT NOT NULL,
    "paid_amount" BIGINT NOT NULL DEFAULT 0,
    "status" "student_fee_status" NOT NULL DEFAULT 'PENDING',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "student_fee_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "student_fee_installments" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "student_fee_assignment_id" UUID NOT NULL,
    "fee_installment_id" UUID,
    "name" TEXT NOT NULL,
    "amount" BIGINT NOT NULL,
    "due_date" DATE NOT NULL,
    "order_index" INTEGER NOT NULL,
    "paid_amount" BIGINT NOT NULL DEFAULT 0,
    "status" "student_installment_status" NOT NULL DEFAULT 'UPCOMING',

    CONSTRAINT "student_fee_installments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "discounts" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "student_fee_assignment_id" UUID NOT NULL,
    "type" "discount_type" NOT NULL,
    "value" DECIMAL(7,2) NOT NULL,
    "amount" BIGINT NOT NULL,
    "reason" TEXT NOT NULL,
    "category" "discount_category" NOT NULL,
    "status" "discount_status" NOT NULL DEFAULT 'PENDING_APPROVAL',
    "approved_by" UUID,
    "approved_at" TIMESTAMPTZ(3),
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "discounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payments" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "school_id" UUID NOT NULL,
    "reference" TEXT NOT NULL,
    "payer_user_id" UUID,
    "payer_name" TEXT,
    "payer_phone" TEXT,
    "amount" BIGINT NOT NULL,
    "currency" CHAR(3) NOT NULL DEFAULT 'XAF',
    "payment_method" "payment_method" NOT NULL,
    "provider" TEXT,
    "provider_reference" TEXT,
    "external_reference" TEXT,
    "status" "payment_status" NOT NULL DEFAULT 'PENDING',
    "status_reason" TEXT,
    "channel" "payment_channel" NOT NULL,
    "unallocated_amount" BIGINT NOT NULL DEFAULT 0,
    "reversal_of_payment_id" UUID,
    "initiated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "paid_at" TIMESTAMPTZ(3),
    "validated_at" TIMESTAMPTZ(3),
    "validated_by" UUID,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_allocations" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "payment_id" UUID NOT NULL,
    "student_fee_assignment_id" UUID NOT NULL,
    "student_fee_installment_id" UUID,
    "student_id" UUID NOT NULL,
    "enrollment_id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "amount" BIGINT NOT NULL,
    "created_by" UUID,
    "is_manual" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payment_allocations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "receipts" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "school_id" UUID NOT NULL,
    "payment_id" UUID NOT NULL,
    "receipt_number" TEXT NOT NULL,
    "file_id" UUID,
    "snapshot" JSONB NOT NULL,
    "issued_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "issued_by" UUID,
    "cancelled_at" TIMESTAMPTZ(3),
    "cancelled_reason" TEXT,

    CONSTRAINT "receipts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "import_batches_school_id_status_created_at_idx" ON "import_batches"("school_id", "status", "created_at" DESC);

-- CreateIndex
CREATE INDEX "import_batches_file_id_idx" ON "import_batches"("file_id");

-- CreateIndex
CREATE INDEX "import_batches_academic_year_id_idx" ON "import_batches"("academic_year_id");

-- CreateIndex
CREATE INDEX "import_batches_created_by_idx" ON "import_batches"("created_by");

-- CreateIndex
CREATE INDEX "import_rows_batch_id_status_row_number_idx" ON "import_rows"("batch_id", "status", "row_number");

-- CreateIndex
CREATE UNIQUE INDEX "import_rows_batch_id_row_number_key" ON "import_rows"("batch_id", "row_number");

-- CreateIndex
CREATE INDEX "fee_types_school_id_status_priority_idx" ON "fee_types"("school_id", "status", "priority");

-- CreateIndex
CREATE UNIQUE INDEX "fee_types_school_id_code_key" ON "fee_types"("school_id", "code");

-- CreateIndex
CREATE INDEX "fee_structures_school_id_academic_year_id_status_idx" ON "fee_structures"("school_id", "academic_year_id", "status");

-- CreateIndex
CREATE INDEX "fee_structures_fee_type_id_status_idx" ON "fee_structures"("fee_type_id", "status");

-- CreateIndex
CREATE INDEX "fee_structures_grade_level_id_idx" ON "fee_structures"("grade_level_id");

-- CreateIndex
CREATE INDEX "fee_structures_class_id_idx" ON "fee_structures"("class_id");

-- CreateIndex
CREATE INDEX "fee_structures_student_category_id_idx" ON "fee_structures"("student_category_id");

-- CreateIndex
CREATE INDEX "fee_installments_fee_structure_id_status_idx" ON "fee_installments"("fee_structure_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "fee_installments_fee_structure_id_order_index_key" ON "fee_installments"("fee_structure_id", "order_index");

-- CreateIndex
CREATE INDEX "student_fee_assignments_school_id_student_id_status_idx" ON "student_fee_assignments"("school_id", "student_id", "status");

-- CreateIndex
CREATE INDEX "student_fee_assignments_fee_type_id_status_idx" ON "student_fee_assignments"("fee_type_id", "status");

-- CreateIndex
CREATE INDEX "student_fee_assignments_fee_structure_id_idx" ON "student_fee_assignments"("fee_structure_id");

-- CreateIndex
CREATE UNIQUE INDEX "student_fee_assignments_enrollment_id_fee_structure_id_key" ON "student_fee_assignments"("enrollment_id", "fee_structure_id");

-- CreateIndex
CREATE INDEX "student_fee_installments_fee_installment_id_idx" ON "student_fee_installments"("fee_installment_id");

-- CreateIndex
CREATE INDEX "student_fee_installments_student_fee_assignment_id_status_d_idx" ON "student_fee_installments"("student_fee_assignment_id", "status", "due_date");

-- CreateIndex
CREATE UNIQUE INDEX "student_fee_installments_student_fee_assignment_id_order_in_key" ON "student_fee_installments"("student_fee_assignment_id", "order_index");

-- CreateIndex
CREATE INDEX "discounts_student_fee_assignment_id_status_idx" ON "discounts"("student_fee_assignment_id", "status");

-- CreateIndex
CREATE INDEX "discounts_approved_by_idx" ON "discounts"("approved_by");

-- CreateIndex
CREATE INDEX "discounts_created_by_idx" ON "discounts"("created_by");

-- CreateIndex
CREATE UNIQUE INDEX "payments_reference_key" ON "payments"("reference");

-- CreateIndex
CREATE INDEX "payments_school_id_status_paid_at_idx" ON "payments"("school_id", "status", "paid_at" DESC);

-- CreateIndex
CREATE INDEX "payments_school_id_payment_method_paid_at_idx" ON "payments"("school_id", "payment_method", "paid_at" DESC);

-- CreateIndex
CREATE INDEX "payments_payer_user_id_paid_at_idx" ON "payments"("payer_user_id", "paid_at" DESC);

-- CreateIndex
CREATE INDEX "payments_validated_by_idx" ON "payments"("validated_by");

-- CreateIndex
CREATE INDEX "payments_created_by_idx" ON "payments"("created_by");

-- CreateIndex
CREATE INDEX "payments_reversal_of_payment_id_idx" ON "payments"("reversal_of_payment_id");

-- CreateIndex
CREATE INDEX "payment_allocations_payment_id_idx" ON "payment_allocations"("payment_id");

-- CreateIndex
CREATE INDEX "payment_allocations_student_fee_assignment_id_created_at_idx" ON "payment_allocations"("student_fee_assignment_id", "created_at");

-- CreateIndex
CREATE INDEX "payment_allocations_student_fee_installment_id_idx" ON "payment_allocations"("student_fee_installment_id");

-- CreateIndex
CREATE INDEX "payment_allocations_school_id_enrollment_id_idx" ON "payment_allocations"("school_id", "enrollment_id");

-- CreateIndex
CREATE INDEX "payment_allocations_student_id_idx" ON "payment_allocations"("student_id");

-- CreateIndex
CREATE INDEX "payment_allocations_created_by_idx" ON "payment_allocations"("created_by");

-- CreateIndex
CREATE UNIQUE INDEX "receipts_payment_id_key" ON "receipts"("payment_id");

-- CreateIndex
CREATE INDEX "receipts_file_id_idx" ON "receipts"("file_id");

-- CreateIndex
CREATE INDEX "receipts_issued_by_idx" ON "receipts"("issued_by");

-- CreateIndex
CREATE UNIQUE INDEX "receipts_school_id_receipt_number_key" ON "receipts"("school_id", "receipt_number");

-- AddForeignKey
ALTER TABLE "import_batches" ADD CONSTRAINT "import_batches_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "import_batches" ADD CONSTRAINT "import_batches_file_id_fkey" FOREIGN KEY ("file_id") REFERENCES "files"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "import_batches" ADD CONSTRAINT "import_batches_academic_year_id_fkey" FOREIGN KEY ("academic_year_id") REFERENCES "academic_years"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "import_batches" ADD CONSTRAINT "import_batches_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "import_rows" ADD CONSTRAINT "import_rows_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "import_batches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fee_types" ADD CONSTRAINT "fee_types_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fee_structures" ADD CONSTRAINT "fee_structures_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fee_structures" ADD CONSTRAINT "fee_structures_academic_year_id_fkey" FOREIGN KEY ("academic_year_id") REFERENCES "academic_years"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fee_structures" ADD CONSTRAINT "fee_structures_fee_type_id_fkey" FOREIGN KEY ("fee_type_id") REFERENCES "fee_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fee_structures" ADD CONSTRAINT "fee_structures_grade_level_id_fkey" FOREIGN KEY ("grade_level_id") REFERENCES "grade_levels"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fee_structures" ADD CONSTRAINT "fee_structures_class_id_fkey" FOREIGN KEY ("class_id") REFERENCES "classes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fee_structures" ADD CONSTRAINT "fee_structures_student_category_id_fkey" FOREIGN KEY ("student_category_id") REFERENCES "student_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fee_installments" ADD CONSTRAINT "fee_installments_fee_structure_id_fkey" FOREIGN KEY ("fee_structure_id") REFERENCES "fee_structures"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_fee_assignments" ADD CONSTRAINT "student_fee_assignments_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_fee_assignments" ADD CONSTRAINT "student_fee_assignments_enrollment_id_fkey" FOREIGN KEY ("enrollment_id") REFERENCES "enrollments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_fee_assignments" ADD CONSTRAINT "student_fee_assignments_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_fee_assignments" ADD CONSTRAINT "student_fee_assignments_fee_structure_id_fkey" FOREIGN KEY ("fee_structure_id") REFERENCES "fee_structures"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_fee_assignments" ADD CONSTRAINT "student_fee_assignments_fee_type_id_fkey" FOREIGN KEY ("fee_type_id") REFERENCES "fee_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_fee_installments" ADD CONSTRAINT "student_fee_installments_student_fee_assignment_id_fkey" FOREIGN KEY ("student_fee_assignment_id") REFERENCES "student_fee_assignments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_fee_installments" ADD CONSTRAINT "student_fee_installments_fee_installment_id_fkey" FOREIGN KEY ("fee_installment_id") REFERENCES "fee_installments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "discounts" ADD CONSTRAINT "discounts_student_fee_assignment_id_fkey" FOREIGN KEY ("student_fee_assignment_id") REFERENCES "student_fee_assignments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "discounts" ADD CONSTRAINT "discounts_approved_by_fkey" FOREIGN KEY ("approved_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "discounts" ADD CONSTRAINT "discounts_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_payer_user_id_fkey" FOREIGN KEY ("payer_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_validated_by_fkey" FOREIGN KEY ("validated_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_reversal_of_payment_id_fkey" FOREIGN KEY ("reversal_of_payment_id") REFERENCES "payments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_allocations" ADD CONSTRAINT "payment_allocations_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "payments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_allocations" ADD CONSTRAINT "payment_allocations_student_fee_assignment_id_fkey" FOREIGN KEY ("student_fee_assignment_id") REFERENCES "student_fee_assignments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_allocations" ADD CONSTRAINT "payment_allocations_student_fee_installment_id_fkey" FOREIGN KEY ("student_fee_installment_id") REFERENCES "student_fee_installments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_allocations" ADD CONSTRAINT "payment_allocations_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_allocations" ADD CONSTRAINT "payment_allocations_enrollment_id_fkey" FOREIGN KEY ("enrollment_id") REFERENCES "enrollments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_allocations" ADD CONSTRAINT "payment_allocations_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_allocations" ADD CONSTRAINT "payment_allocations_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "payments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_file_id_fkey" FOREIGN KEY ("file_id") REFERENCES "files"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_issued_by_fkey" FOREIGN KEY ("issued_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Invariants financiers : les montants sont des entiers FCFA et les caches ne
-- peuvent jamais dépasser la dette qu'ils représentent.
ALTER TABLE "fee_structures" ADD CONSTRAINT "fee_structures_amount_positive" CHECK (amount > 0);
ALTER TABLE "fee_installments" ADD CONSTRAINT "fee_installments_amount_positive" CHECK (amount > 0);
ALTER TABLE "student_fee_assignments" ADD CONSTRAINT "student_fee_amounts_valid"
  CHECK (original_amount >= 0 AND discount_amount >= 0 AND final_amount = original_amount - discount_amount AND paid_amount >= 0 AND paid_amount <= final_amount);
ALTER TABLE "student_fee_installments" ADD CONSTRAINT "student_installment_amounts_valid"
  CHECK (amount >= 0 AND paid_amount >= 0 AND paid_amount <= amount);
ALTER TABLE "discounts" ADD CONSTRAINT "discounts_value_valid" CHECK (value > 0 AND amount >= 0);
ALTER TABLE "payments" ADD CONSTRAINT "payments_amount_nonzero" CHECK (amount <> 0);
ALTER TABLE "payments" ADD CONSTRAINT "payments_unallocated_valid"
  CHECK ((amount > 0 AND unallocated_amount >= 0 AND unallocated_amount <= amount) OR (amount < 0 AND unallocated_amount = 0));
ALTER TABLE "payment_allocations" ADD CONSTRAINT "payment_allocations_amount_nonzero" CHECK (amount <> 0);

CREATE UNIQUE INDEX "uq_active_fee_structure_target"
  ON "fee_structures" (school_id, academic_year_id, fee_type_id, grade_level_id, class_id, student_category_id) NULLS NOT DISTINCT
  WHERE status = 'ACTIVE';
CREATE UNIQUE INDEX "uq_payments_provider_reference"
  ON "payments" (provider, provider_reference) WHERE provider_reference IS NOT NULL;

-- Les deux vues doivent toujours exprimer la même définition du solde.
CREATE VIEW "v_enrollment_balance" AS
SELECT e.id AS enrollment_id, e.school_id, e.student_id, e.academic_year_id, e.class_id,
  COALESCE(SUM(s.original_amount) FILTER (WHERE s.status <> 'CANCELLED'), 0)::bigint AS total_gross,
  COALESCE(SUM(s.discount_amount) FILTER (WHERE s.status <> 'CANCELLED'), 0)::bigint AS total_discount,
  COALESCE(SUM(s.final_amount) FILTER (WHERE s.status <> 'CANCELLED'), 0)::bigint AS total_due,
  COALESCE(SUM(s.paid_amount) FILTER (WHERE s.status <> 'CANCELLED'), 0)::bigint AS total_paid,
  (COALESCE(SUM(s.final_amount) FILTER (WHERE s.status <> 'CANCELLED'), 0)
   - COALESCE(SUM(s.paid_amount) FILTER (WHERE s.status <> 'CANCELLED'), 0))::bigint AS balance
FROM enrollments e LEFT JOIN student_fee_assignments s ON s.enrollment_id = e.id GROUP BY e.id;

CREATE VIEW "v_enrollment_balance_audit" AS
WITH paid AS (
  SELECT pa.student_fee_assignment_id, SUM(pa.amount)::bigint amount
  FROM payment_allocations pa JOIN payments p ON p.id = pa.payment_id
  WHERE p.status IN ('SUCCESS', 'REVERSED') GROUP BY pa.student_fee_assignment_id
)
SELECT e.id AS enrollment_id, e.school_id, e.student_id, e.academic_year_id, e.class_id,
  COALESCE(SUM(s.original_amount) FILTER (WHERE s.status <> 'CANCELLED'), 0)::bigint AS total_gross,
  COALESCE(SUM(s.discount_amount) FILTER (WHERE s.status <> 'CANCELLED'), 0)::bigint AS total_discount,
  COALESCE(SUM(s.final_amount) FILTER (WHERE s.status <> 'CANCELLED'), 0)::bigint AS total_due,
  COALESCE(SUM(paid.amount) FILTER (WHERE s.status <> 'CANCELLED'), 0)::bigint AS total_paid,
  (COALESCE(SUM(s.final_amount) FILTER (WHERE s.status <> 'CANCELLED'), 0)
   - COALESCE(SUM(paid.amount) FILTER (WHERE s.status <> 'CANCELLED'), 0))::bigint AS balance
FROM enrollments e LEFT JOIN student_fee_assignments s ON s.enrollment_id = e.id
LEFT JOIN paid ON paid.student_fee_assignment_id = s.id GROUP BY e.id;

-- Isolation directe par établissement.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['import_batches','fee_types','fee_structures','student_fee_assignments','payments','payment_allocations','receipts'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE POLICY school_isolation ON %I USING (current_school_id() IS NULL OR school_id = current_school_id()) WITH CHECK (current_school_id() IS NULL OR school_id = current_school_id())', t);
  END LOOP;
END $$;

-- Tables enfants : le périmètre est hérité du parent indexé.
ALTER TABLE "import_rows" ENABLE ROW LEVEL SECURITY;
CREATE POLICY school_isolation ON "import_rows" USING (current_school_id() IS NULL OR EXISTS (SELECT 1 FROM import_batches b WHERE b.id = batch_id AND b.school_id = current_school_id())) WITH CHECK (current_school_id() IS NULL OR EXISTS (SELECT 1 FROM import_batches b WHERE b.id = batch_id AND b.school_id = current_school_id()));
ALTER TABLE "fee_installments" ENABLE ROW LEVEL SECURITY;
CREATE POLICY school_isolation ON "fee_installments" USING (current_school_id() IS NULL OR EXISTS (SELECT 1 FROM fee_structures s WHERE s.id = fee_structure_id AND s.school_id = current_school_id())) WITH CHECK (current_school_id() IS NULL OR EXISTS (SELECT 1 FROM fee_structures s WHERE s.id = fee_structure_id AND s.school_id = current_school_id()));
ALTER TABLE "student_fee_installments" ENABLE ROW LEVEL SECURITY;
CREATE POLICY school_isolation ON "student_fee_installments" USING (current_school_id() IS NULL OR EXISTS (SELECT 1 FROM student_fee_assignments s WHERE s.id = student_fee_assignment_id AND s.school_id = current_school_id())) WITH CHECK (current_school_id() IS NULL OR EXISTS (SELECT 1 FROM student_fee_assignments s WHERE s.id = student_fee_assignment_id AND s.school_id = current_school_id()));
ALTER TABLE "discounts" ENABLE ROW LEVEL SECURITY;
CREATE POLICY school_isolation ON "discounts" USING (current_school_id() IS NULL OR EXISTS (SELECT 1 FROM student_fee_assignments s WHERE s.id = student_fee_assignment_id AND s.school_id = current_school_id())) WITH CHECK (current_school_id() IS NULL OR EXISTS (SELECT 1 FROM student_fee_assignments s WHERE s.id = student_fee_assignment_id AND s.school_id = current_school_id()));

-- Écritures financières append-only au niveau applicatif.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'cplan_app') THEN
    EXECUTE 'REVOKE DELETE ON payments, payment_allocations, receipts FROM cplan_app';
    EXECUTE 'GRANT SELECT ON v_enrollment_balance, v_enrollment_balance_audit TO cplan_app';
  END IF;
END
$$;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['import_batches','fee_types','fee_structures','student_fee_assignments','payments'] LOOP
    EXECUTE format('CREATE TRIGGER trg_%1$s_updated_at BEFORE UPDATE ON %1$I FOR EACH ROW EXECUTE FUNCTION set_updated_at()', t);
  END LOOP;
END $$;
