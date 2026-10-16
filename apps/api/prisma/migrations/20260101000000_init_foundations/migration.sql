-- =============================================================================
-- CPLAN — Phase 00 : fondations SQL
--
-- Aucune table métier ici. Uniquement les extensions et fonctions dont
-- dépendront toutes les migrations suivantes.
-- Référence : docs/phases/PHASE-00-socle-projet.md §3.4
-- =============================================================================

-- Recherche floue sur les noms d'élèves et de responsables (§76 du cahier).
-- « fotsi » doit trouver « Fotso ».
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- Adresses e-mail insensibles à la casse, sans avoir à normaliser partout.
CREATE EXTENSION IF NOT EXISTS "citext";

-- Recherche sans accents : « Belinga » doit être trouvé par « belinga ».
CREATE EXTENSION IF NOT EXISTS "unaccent";


-- -----------------------------------------------------------------------------
-- uuidv7() — clés primaires (ADR-013)
--
-- UUID v7 (RFC 9562) : 48 bits de timestamp en millisecondes suivis d'aléatoire.
-- Contrairement à v4, les valeurs sont ordonnées dans le temps, ce qui préserve
-- la localité des index B-tree — décisif sur les tables à forte insertion
-- (payments, audit_logs). Contrairement à une séquence, la valeur n'est pas
-- devinable et peut donc apparaître dans une URL.
--
-- Implémentation : on part d'un UUID v4 (qui porte déjà le bon variant), on
-- écrase les 6 premiers octets par le timestamp, puis on force la version à 7.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION uuidv7() RETURNS uuid
AS $$
  SELECT encode(
    set_bit(
      set_bit(
        overlay(
          uuid_send(gen_random_uuid())
          PLACING substring(
            int8send(floor(extract(epoch FROM clock_timestamp()) * 1000)::bigint)
            FROM 3
          )
          FROM 1 FOR 6
        ),
        52, 1
      ),
      53, 1
    ),
    'hex'
  )::uuid;
$$ LANGUAGE sql VOLATILE;

COMMENT ON FUNCTION uuidv7() IS
  'Génère un UUID v7 (RFC 9562), ordonné dans le temps. Clé primaire par défaut — voir ADR-013.';


-- -----------------------------------------------------------------------------
-- set_updated_at() — trigger générique
--
-- À attacher à chaque table portant une colonne updated_at :
--   CREATE TRIGGER trg_<table>_updated_at BEFORE UPDATE ON <table>
--     FOR EACH ROW EXECUTE FUNCTION set_updated_at();
--
-- Mettre à jour updated_at depuis le code applicatif est une source d'oubli
-- silencieux ; la base est le seul endroit où la garantie est réelle.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION set_updated_at() RETURNS trigger
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION set_updated_at() IS
  'Trigger BEFORE UPDATE : renseigne automatiquement updated_at.';


-- -----------------------------------------------------------------------------
-- unaccent_immutable() — indexation de la recherche
--
-- unaccent() est déclarée STABLE et ne peut donc pas figurer dans un index.
-- Cette enveloppe IMMUTABLE le permet. Elle sera utilisée en Phase 03 pour
-- l'index trigramme sur les noms d'élèves.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION unaccent_immutable(text) RETURNS text
AS $$
  SELECT public.unaccent('public.unaccent'::regdictionary, $1);
$$ LANGUAGE sql IMMUTABLE STRICT PARALLEL SAFE;

COMMENT ON FUNCTION unaccent_immutable(text) IS
  'Enveloppe IMMUTABLE de unaccent(), utilisable dans un index (recherche §76).';
