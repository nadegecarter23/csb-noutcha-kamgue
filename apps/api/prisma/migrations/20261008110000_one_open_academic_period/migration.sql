-- Une année scolaire ne peut exposer qu'une seule période ouverte à la fois.
CREATE UNIQUE INDEX "academic_periods_one_open_key"
  ON "academic_periods" ("school_id", "academic_year_id")
  WHERE "status" = 'OPEN';
