CREATE TABLE "school_module_settings" (
  "school_id" UUID NOT NULL,
  "module_code" VARCHAR(40) NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT TRUE,
  "updated_by" UUID,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "school_module_settings_pkey" PRIMARY KEY ("school_id", "module_code"),
  CONSTRAINT "school_module_settings_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "school_module_settings_school_id_enabled_idx" ON "school_module_settings"("school_id", "enabled");
