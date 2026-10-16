-- Phase 19 — emplois du temps et salles

CREATE TYPE "timetable_entry_status" AS ENUM ('DRAFT', 'PUBLISHED', 'CANCELLED');

CREATE TABLE "timetable_rooms" (
  "id" UUID NOT NULL DEFAULT uuidv7(),
  "school_id" UUID NOT NULL,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "capacity" INTEGER,
  "status" "reference_status" NOT NULL DEFAULT 'ACTIVE',
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "timetable_rooms_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "timetable_rooms_capacity_positive" CHECK (capacity IS NULL OR capacity > 0),
  CONSTRAINT "timetable_rooms_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE
);

CREATE TABLE "timetable_entries" (
  "id" UUID NOT NULL DEFAULT uuidv7(),
  "school_id" UUID NOT NULL,
  "academic_year_id" UUID NOT NULL,
  "teaching_assignment_id" UUID NOT NULL,
  "class_id" UUID NOT NULL,
  "room_id" UUID,
  "day_of_week" INTEGER NOT NULL,
  "start_time" TIME(0) NOT NULL,
  "end_time" TIME(0) NOT NULL,
  "status" "timetable_entry_status" NOT NULL DEFAULT 'DRAFT',
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "timetable_entries_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "timetable_entries_day_valid" CHECK (day_of_week BETWEEN 1 AND 6),
  CONSTRAINT "timetable_entries_time_valid" CHECK (end_time > start_time),
  CONSTRAINT "timetable_entries_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE,
  CONSTRAINT "timetable_entries_academic_year_id_fkey" FOREIGN KEY ("academic_year_id") REFERENCES "academic_years"("id") ON DELETE CASCADE,
  CONSTRAINT "timetable_entries_teaching_assignment_id_fkey" FOREIGN KEY ("teaching_assignment_id") REFERENCES "teaching_assignments"("id") ON DELETE CASCADE,
  CONSTRAINT "timetable_entries_class_id_fkey" FOREIGN KEY ("class_id") REFERENCES "classes"("id") ON DELETE CASCADE,
  CONSTRAINT "timetable_entries_room_id_fkey" FOREIGN KEY ("room_id") REFERENCES "timetable_rooms"("id") ON DELETE SET NULL
);

CREATE UNIQUE INDEX "timetable_rooms_school_id_code_key" ON "timetable_rooms"("school_id", "code");
CREATE INDEX "timetable_rooms_school_id_status_name_idx" ON "timetable_rooms"("school_id", "status", "name");
CREATE INDEX "timetable_entries_school_id_academic_year_id_day_of_week_start_time_idx" ON "timetable_entries"("school_id", "academic_year_id", "day_of_week", "start_time");
CREATE INDEX "timetable_entries_class_id_day_of_week_start_time_end_time_idx" ON "timetable_entries"("class_id", "day_of_week", "start_time", "end_time");
CREATE INDEX "timetable_entries_room_id_day_of_week_start_time_end_time_idx" ON "timetable_entries"("room_id", "day_of_week", "start_time", "end_time");

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['timetable_rooms', 'timetable_entries'] LOOP
    EXECUTE format('CREATE TRIGGER trg_%1$s_updated_at BEFORE UPDATE ON %1$I FOR EACH ROW EXECUTE FUNCTION set_updated_at()', t);
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'CREATE POLICY school_isolation ON %I USING (current_school_id() IS NULL OR school_id = current_school_id()) WITH CHECK (current_school_id() IS NULL OR school_id = current_school_id())', t
    );
  END LOOP;
END $$;
