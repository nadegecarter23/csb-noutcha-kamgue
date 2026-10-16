-- Phase 20 — assiduité, retards et justificatifs

CREATE TYPE "attendance_session_status" AS ENUM ('DRAFT', 'VALIDATED');
CREATE TYPE "attendance_mark" AS ENUM ('PRESENT', 'ABSENT', 'LATE', 'EXCUSED');
CREATE TYPE "justification_status" AS ENUM ('NONE', 'PENDING', 'ACCEPTED', 'REJECTED');

CREATE TABLE "attendance_sessions" (
  "id" UUID NOT NULL DEFAULT uuidv7(),
  "school_id" UUID NOT NULL,
  "academic_year_id" UUID NOT NULL,
  "timetable_entry_id" UUID NOT NULL,
  "class_id" UUID NOT NULL,
  "date" DATE NOT NULL,
  "status" "attendance_session_status" NOT NULL DEFAULT 'DRAFT',
  "recorded_by" UUID NOT NULL,
  "validated_by" UUID,
  "validated_at" TIMESTAMPTZ(3),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "attendance_sessions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "attendance_sessions_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE,
  CONSTRAINT "attendance_sessions_academic_year_id_fkey" FOREIGN KEY ("academic_year_id") REFERENCES "academic_years"("id") ON DELETE CASCADE,
  CONSTRAINT "attendance_sessions_timetable_entry_id_fkey" FOREIGN KEY ("timetable_entry_id") REFERENCES "timetable_entries"("id") ON DELETE RESTRICT,
  CONSTRAINT "attendance_sessions_class_id_fkey" FOREIGN KEY ("class_id") REFERENCES "classes"("id") ON DELETE RESTRICT,
  CONSTRAINT "attendance_sessions_recorded_by_fkey" FOREIGN KEY ("recorded_by") REFERENCES "users"("id") ON DELETE RESTRICT,
  CONSTRAINT "attendance_sessions_validated_by_fkey" FOREIGN KEY ("validated_by") REFERENCES "users"("id") ON DELETE SET NULL
);

CREATE TABLE "attendance_records" (
  "id" UUID NOT NULL DEFAULT uuidv7(),
  "school_id" UUID NOT NULL,
  "session_id" UUID NOT NULL,
  "enrollment_id" UUID NOT NULL,
  "mark" "attendance_mark" NOT NULL DEFAULT 'PRESENT',
  "minutes_late" INTEGER NOT NULL DEFAULT 0,
  "note" TEXT,
  "justification_status" "justification_status" NOT NULL DEFAULT 'NONE',
  "justification_note" TEXT,
  "alerted_at" TIMESTAMPTZ(3),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "attendance_records_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "attendance_records_minutes_late_valid" CHECK (minutes_late BETWEEN 0 AND 600),
  CONSTRAINT "attendance_records_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE,
  CONSTRAINT "attendance_records_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "attendance_sessions"("id") ON DELETE CASCADE,
  CONSTRAINT "attendance_records_enrollment_id_fkey" FOREIGN KEY ("enrollment_id") REFERENCES "enrollments"("id") ON DELETE RESTRICT
);

CREATE UNIQUE INDEX "attendance_sessions_timetable_entry_id_date_key" ON "attendance_sessions"("timetable_entry_id", "date");
CREATE INDEX "attendance_sessions_school_id_academic_year_id_date_status_idx" ON "attendance_sessions"("school_id", "academic_year_id", "date", "status");
CREATE INDEX "attendance_sessions_class_id_date_idx" ON "attendance_sessions"("class_id", "date");
CREATE UNIQUE INDEX "attendance_records_session_id_enrollment_id_key" ON "attendance_records"("session_id", "enrollment_id");
CREATE INDEX "attendance_records_school_id_enrollment_id_created_at_idx" ON "attendance_records"("school_id", "enrollment_id", "created_at" DESC);
CREATE INDEX "attendance_records_school_id_mark_alerted_at_idx" ON "attendance_records"("school_id", "mark", "alerted_at");

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['attendance_sessions', 'attendance_records'] LOOP
    EXECUTE format('CREATE TRIGGER trg_%1$s_updated_at BEFORE UPDATE ON %1$I FOR EACH ROW EXECUTE FUNCTION set_updated_at()', t);
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE POLICY school_isolation ON %I USING (current_school_id() IS NULL OR school_id = current_school_id()) WITH CHECK (current_school_id() IS NULL OR school_id = current_school_id())', t);
  END LOOP;
END $$;
