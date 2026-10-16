-- CSB-09 — identité visible de l'établissement pilote.
-- Les identifiants d'infrastructure (rôles, bases, packages et bundle mobile)
-- restent volontairement inchangés pour préserver la compatibilité.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM schools WHERE code = 'CPLAN')
     AND NOT EXISTS (SELECT 1 FROM schools WHERE code = 'CSBNK') THEN
    UPDATE schools
       SET code = 'CSBNK',
           name = 'Complexe Scolaire Bilingue Noutcha KAMGUE',
           address = CASE
             WHEN address IS NULL OR address = 'BP 1234, Douala, Cameroun'
             THEN 'Dogpassi, Douala, Cameroun'
             ELSE address
           END,
           email = CASE
             WHEN email IS NULL OR email = 'contact@school-fees-app.local'
             THEN 'contact@csb-noutcha-kamgue.local'
             ELSE email
           END,
           updated_at = now()
     WHERE code = 'CPLAN';
  END IF;
END $$;
