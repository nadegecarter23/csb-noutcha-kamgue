-- Rename only schools still using the original product branding.
UPDATE "schools"
SET "name" = 'school fees app', "updated_at" = CURRENT_TIMESTAMP
WHERE "name" IN (
  'Collège CPLAN',
  'COLLÈGE CPLAN',
  'CPLAN',
  'Collège André Nguefong',
  'Collège Privé Laïc André Nguefong',
  'Collège Privé Laïc André Nguéong'
);
