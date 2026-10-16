# Complexe Scolaire Bilingue Noutcha KAMGUE

Le nom affiché est « CSB Noutcha KAMGUE » sur le web et sur mobile. Les identifiants techniques historiques (`@cplan/*`, identifiants Android/iOS, liens profonds et anciens matricules) sont conservés pour assurer la compatibilité.

Pour une installation existante, appliquer les migrations avec `pnpm --filter @cplan/api db:migrate:deploy`, puis redéployer le web et reconstruire l’application mobile pour actualiser son nom installé. La migration de renommage ne modifie que les établissements portant encore l’ancien nom.

Plateforme de gestion scolaire et financière : élèves, inscriptions, relation parent–école, frais de scolarité, paiements (Mobile Money, caisse, virement), reçus et pilotage.

**Stack** — PostgreSQL 16 · Node 22 (Fastify + TypeScript) · React 19 (Vite) · React Native (Expo SDK 57)

---

## Démarrage

Prérequis : **Node 22**, **pnpm 10**, **Docker**.

```bash
pnpm install
pnpm infra:up                          # PostgreSQL, Redis, MinIO, Mailpit
cp apps/api/.env.example apps/api/.env
pnpm db:generate
pnpm --filter @cplan/api db:migrate:deploy
pnpm db:seed                           # vérifie les fondations SQL
pnpm dev
```

Le premier `pnpm infra:up` compile MinIO et son client depuis les tags source
officiels épinglés dans `infra/docker/minio/`. Les démarrages suivants utilisent
les images locales mises en cache.

| Service | URL | Note |
|---|---|---|
| API | http://localhost:3000 | |
| Documentation API | http://localhost:3000/docs | Swagger, hors production |
| Dashboard web | http://localhost:5173 | `/status` vérifie toute la chaîne |
| Console MinIO | http://localhost:9011 | `cplan` / `cplan_dev_password` |
| Boîte mail de test | http://localhost:8035 | Mailpit |

### Déploiement cloud

Le dashboard web est prévu pour **Vercel** et l’API/worker pour **Railway**.
La procédure, les variables et l’ordre de déploiement sont documentés dans
[docs/operations/DEPLOY-VERCEL-RAILWAY.md](docs/operations/DEPLOY-VERCEL-RAILWAY.md).

### Ports décalés

Les ports hôte de l'infrastructure sont volontairement **non standards** afin de cohabiter avec d'autres projets Docker sur la même machine :

| Service | Port hôte | Port interne |
|---|---|---|
| PostgreSQL | **5442** | 5432 |
| Redis | **6389** | 6379 |
| MinIO (S3 / console) | **9010** / **9011** | 9000 / 9001 |
| Mailpit (SMTP / UI) | **1035** / **8035** | 1025 / 8025 |

Pour les modifier : `infra/docker/docker-compose.yml`, puis `apps/api/.env`.

### Commandes utiles

```bash
pnpm dev            # API + web en parallèle
pnpm test           # tous les tests
pnpm typecheck      # types sur tout le monorepo
pnpm lint
pnpm build

pnpm infra:up       pnpm infra:down     pnpm infra:reset
pnpm db:migrate     pnpm db:seed        pnpm db:studio
```

---

## Structure

```
apps/
  api/        Fastify — API REST + workers BullMQ
  web/        React — dashboards Scolarité / Comptabilité / Direction / Admin
  mobile/     React Native (Expo) — application Parent
packages/
  contracts/  Schémas Zod partagés (source de vérité des DTO)
  domain/     Logique métier pure, sans I/O (calcul financier, téléphones)
  config/     tsconfig, ESLint, Prettier partagés
infra/docker/ Environnement de développement
docs/         Plan de développement — 30 phases et roadmap CSB
```

---

## Documentation

👉 **[docs/00-INDEX.md](docs/00-INDEX.md)** — sommaire, découpage en phases, chemin critique, suivi.

| | |
|---|---|
| [Vision & périmètre](docs/01-VISION-PERIMETRE.md) | Les 8 dimensions métier à ne jamais confondre |
| [Architecture technique](docs/02-ARCHITECTURE-TECHNIQUE.md) | Décisions techniques (ADR) |
| [Modèle de données](docs/03-MODELE-DONNEES.md) | Schéma PostgreSQL complet |
| [Règles métier financières](docs/04-REGLES-METIER-FINANCIERES.md) | Le cœur algorithmique |
| [RBAC & permissions](docs/05-RBAC-PERMISSIONS.md) | Rôles et matrice d'accès |
| [Conventions](docs/06-CONVENTIONS-DEV.md) | Nommage, API, tests, Definition of Done |

Placer le cahier fonctionnel d'origine dans `docs/CAHIER-FONCTIONNEL.md` : toute la documentation y renvoie par numéro de section (§).

---

## État d'avancement

**État consolidé au 15 octobre 2026 : développement fonctionnel terminé, préparation de la mise en production en cours.**

- Roadmap CSB : **95 tâches terminées sur 103** ; les 8 restantes exigent des validations, accès ou opérations externes du CSB.
- `CSB-00` à `CSB-08`, `CSB-10` et `CSB-13` sont terminés.
- `CSB-09` attend encore la validation formelle des coordonnées, du logo maître et des identifiants techniques.
- `CSB-11` attend le test de charge en préproduction.
- `CSB-12` attend les environnements hébergés, les comptes nominatifs, les formations et la surveillance J0–J30.
- La chaîne locale PostgreSQL, Redis et S3 est opérationnelle ; `pnpm check` valide 304 tests automatisés et 4 contrôles de déploiement.
- L'application parent dispose de 4 parcours Maestro contrôlés par la suite locale ; leur exécution native nécessite Maestro et un émulateur ou terminal de recette.
- La source de vérité de la reprise est [docs/10-ROADMAP-CSB-NOUTCHA-KAMGUE.md](docs/10-ROADMAP-CSB-NOUTCHA-KAMGUE.md).
- Les éléments externes à fournir sont regroupés dans [docs/operations/CSB-EXTERNAL-COMPLETION.md](docs/operations/CSB-EXTERNAL-COMPLETION.md).

### Historique des phases initiales

**Phase 04 — Responsables & associations : livrée.**

- Responsables réutilisés par téléphone normalisé, liens parent–élève avec droits distincts et cycle `PENDING → ACCEPTED/REJECTED/REVOKED`
- Détection automatique après OTP sans accès implicite, demandes manuelles et traitement des litiges
- Invitations opaques par lien, code court ou QR, expiration, usage limité, révocation et limitation à cinq essais par heure
- Garde serveur `parentScope`, révocation immédiate des sessions et sérialiseur parent sans fuite des coordonnées des autres responsables
- Fiches d’association PDF avec QR en impression unitaire ou en lot pour une classe
- Écrans Responsables, demandes/litiges et indicateur S01 des associations en attente

**Phase 03 — Élèves & inscriptions : livrée.**

- Dossier élève permanent séparé des inscriptions annuelles, contraintes métier et isolation RLS
- Matricules atomiques, sûrs sous concurrence, correction motivée et auditée
- Création complète avec brouillon local, détection de doublon, inscription et responsables dans une transaction
- Liste paginée avec filtres URL, recherche tolérante aux fautes, recherche globale `Ctrl+K` et fiche multi-onglets
- Changements de classe historisés, frise multi-années, statuts, suppression protégée et indicateurs réels du dashboard
- Seed de démonstration avec élèves, fratrie, inscriptions et responsables
- **204 tests automatisés** couvrant les phases livrées

**Phase 02 — Référentiel scolaire : livrée.**

- Années scolaires avec cycle `DRAFT → ACTIVE → CLOSED → ARCHIVED` et unicité de l’année courante garantie en base
- Niveaux ordonnables, cycles pédagogiques, désactivation protégée
- Classes liées à leur année, création groupée, capacités et duplication de structure avec prévisualisation
- Catégories d’élèves et paramètres généraux, de numérotation et financiers
- Dashboard Scolarité S01, écrans S02/S03/S04 et sélecteur global d’année persisté
- RLS et audit sur tout le référentiel ; seed de démonstration avec 7 niveaux et 21 classes
- **188 tests automatisés** à l’issue de cette phase

**Phase 01 — Identité, rôles & accès : livrée.** **179 tests automatisés** verts.

- 14 tables : établissement, paramètres, utilisateurs, rôles, permissions, sessions, OTP, fichiers, séquences, idempotence, journal d'audit
- Authentification par mot de passe (personnel) et par téléphone + OTP (parents)
- JWT 15 min + refresh rotatif avec **détection de réutilisation** (révocation de toute la famille de sessions)
- RBAC : 77 permissions, 8 rôles natifs, gardes déclaratives par route
- Isolation multi-établissement : barrière applicative **et** RLS PostgreSQL vérifiée
- Journal d'audit append-only, garanti par les privilèges SQL et un trigger
- Verrouillage progressif, anti-énumération de comptes, OTP haché et salé
- Premier accès sécurisé : mot de passe bootstrap obligatoirement remplacé avant l'accès aux modules
- **Test d'architecture** : toute route mutative sans garde fait échouer la CI
- Administration web : connexion, récupération du mot de passe, utilisateurs, rôles personnalisés, profil et sessions
- Application parent : bienvenue P01, inscription P02, vérification OTP P03, connexion et accueil vide
- Changement d'établissement et déconnexion à distance d'un appareil

### Comptes de démonstration

`pnpm db:seed` crée un établissement complet et neuf comptes. Le chargement est idempotent : il peut être rejoué sans créer de doublons et vérifie automatiquement que 56 familles de données sont présentes. Mot de passe commun : `CSBNoutchaDemo2026!`

Le jeu couvre notamment le référentiel scolaire, les élèves et responsables, le personnel, les matières, emplois du temps, présences, évaluations, bulletins, frais, remises, paiements, caisse, reçus, Mobile Money, imports, achats, vie scolaire, communication, bibliothèque, cantine, transport, stocks, reporting et notifications.

| Rôle | Identifiant |
|---|---|
| Super administrateur | `superadmin@csb-noutcha-kamgue.local` |
| Administrateur | `admin@csb-noutcha-kamgue.local` |
| Direction | `direction@csb-noutcha-kamgue.local` |
| Comptable | `compta@csb-noutcha-kamgue.local` |
| Caissier | `caisse@csb-noutcha-kamgue.local` |
| Scolarité | `scolarite@csb-noutcha-kamgue.local` |
| Enseignant 1 | `enseignant@csb-noutcha-kamgue.local` |
| Enseignant 2 | `enseignant2@csb-noutcha-kamgue.local` |
| Parent | `+237699123456` |

---

**Phase 00 — Socle projet : livrée.**

- Monorepo pnpm + Turborepo, TypeScript strict
- Infrastructure Docker : PostgreSQL, Redis, MinIO, Mailpit
- API Fastify : configuration validée au démarrage, logs à champs sensibles rédigés, erreurs typées, sondes de santé, Swagger
- Prisma + migration des fondations SQL (`uuidv7()`, `pg_trgm`, `citext`, `unaccent_immutable()`)
- Deux rôles PostgreSQL distincts : `cplan` (migrations) et `cplan_app` (runtime, privilèges restreints)
- `@cplan/domain` : arithmétique FCFA entière, `distribute()` par plus forts restes, normalisation E.164 des numéros
- `@cplan/contracts` : primitives, erreurs, pagination
- Dashboard web : routage, i18n, client HTTP, frontière d'erreur, page `/status`
- CI GitHub Actions : format, lint, types, tests, build, détection de secrets, audit
- **97 tests** verts (dont 10 000 tirages de test de propriété sur `distribute`)

L'application mobile Expo est installée et intégrée au pipeline racine. `pnpm check` vérifie désormais l'API, le web, les packages partagés et le mobile.

Prochaine étape : finaliser les validations externes, créer la préproduction et exécuter `CSB-11.8`, conformément à la roadmap CSB.
