# 02 — Architecture technique

Stack imposée par le client : **PostgreSQL, Node.js, React, React Native**. Ce document fixe tout le reste, sous forme de décisions tranchées (ADR). Chaque décision est révisable, mais tant qu'elle n'est pas révisée ici, elle fait foi.

---

## 1. Vue d'ensemble

```text
┌─────────────────┐   ┌──────────────────┐   ┌──────────────────┐
│  App Parent     │   │  Dashboard Web   │   │  Admin CSB Noutcha KAMGUE     │
│  React Native   │   │  React (Vite)    │   │  React (même app)│
│  (Expo)         │   │  Scolarité       │   │                  │
│                 │   │  Comptabilité    │   │                  │
│                 │   │  Direction       │   │                  │
└────────┬────────┘   └────────┬─────────┘   └────────┬─────────┘
         │                     │                      │
         │              HTTPS / REST JSON             │
         └─────────────────────┼──────────────────────┘
                               ▼
                  ┌────────────────────────────┐
                  │      API CSB Noutcha KAMGUE             │
                  │  Node 22 + TypeScript      │
                  │  Fastify 5                 │
                  │                            │
                  │  modules métier :          │
                  │  identity / academic /     │
                  │  guardians / billing /     │
                  │  payments / notifications  │
                  │  reporting / audit         │
                  └───┬────────┬───────┬───────┘
                      │        │       │
        ┌─────────────┘        │       └──────────────┐
        ▼                      ▼                      ▼
┌───────────────┐      ┌──────────────┐      ┌─────────────────┐
│  PostgreSQL   │      │ Redis        │      │ Stockage objet  │
│  16           │      │ (BullMQ,     │      │ S3-compatible   │
│               │      │  cache, rate │      │ (justificatifs, │
│               │      │  limit)      │      │  reçus, photos) │
└───────────────┘      └──────┬───────┘      └─────────────────┘
                              │
                    ┌─────────▼──────────┐
                    │  Workers (BullMQ)  │
                    │  · génération PDF  │
                    │  · notifications   │
                    │  · relances        │
                    │  · réconciliation  │
                    │    Mobile Money    │
                    └────────┬───────────┘
                             │
        ┌────────────────────┼────────────────────┐
        ▼                    ▼                    ▼
┌───────────────┐   ┌────────────────┐   ┌────────────────┐
│ MTN MoMo API  │   │ Orange Money   │   │ Passerelle SMS │
│               │   │ API            │   │ + Push (FCM)   │
└───────────────┘   └────────────────┘   └────────────────┘
```

---

## 2. Monorepo

**ADR-001 — Monorepo pnpm workspaces + Turborepo.**
*Pourquoi* : types partagés entre API, web et mobile (les DTO financiers doivent être identiques partout) ; une seule CI ; refactor atomique.
*Alternative écartée* : dépôts séparés → dérive des contrats d'API, le pire risque sur un projet financier.

```text
cplan/
├── apps/
│   ├── api/                    # Fastify — API REST + workers
│   ├── web/                    # React — dashboards Scolarité/Compta/Direction/Admin
│   └── mobile/                 # React Native (Expo) — app Parent
├── packages/
│   ├── contracts/              # Schémas Zod + types TS partagés (source de vérité des DTO)
│   ├── domain/                 # Logique métier pure, sans I/O (calcul de solde, affectation, arrondis)
│   ├── ui/                     # Composants React partagés web (design system)
│   └── config/                 # eslint, tsconfig, prettier partagés
├── docs/                       # ← cette documentation
├── infra/
│   ├── docker/                 # docker-compose dev, Dockerfiles
│   └── migrations/             # migrations SQL versionnées
├── package.json
├── pnpm-workspace.yaml
└── turbo.json
```

**`packages/domain` est capital** : tout le calcul financier (solde, ventilation d'un paiement sur les frais, application des remises, cascade d'affectation) y vit sous forme de **fonctions pures, sans base de données**. Elles sont testables en millisecondes et réutilisables côté mobile pour des simulations hors ligne.

---

## 3. Backend

### ADR-002 — Fastify 5 + TypeScript strict
*Pourquoi* : performant, validation/sérialisation par schéma native, écosystème de plugins mûr, moins de magie que NestJS.
*Alternative écartée* : NestJS (structure imposée mais verbeux, DI lourde pour cette taille d'équipe) ; Express (pas de validation native, maintenance atone).

### ADR-003 — Prisma pour le CRUD, SQL brut pour le reporting
*Pourquoi* : Prisma donne migrations typées, client typé, productivité maximale sur les 80 % de CRUD. Mais les états financiers (§48, §49, §54) sont des agrégations multi-jointures que Prisma exprime mal → `$queryRaw` avec SQL écrit à la main, testé, dans `apps/api/src/modules/reporting/queries/`.
*Alternative* : Drizzle (SQL plus proche, moins mature sur les migrations) — acceptable si l'équipe préfère.

### ADR-004 — Découpage en modules métier, pas en couches techniques
```text
apps/api/src/
├── modules/
│   ├── identity/       # users, auth, otp, roles, permissions, sessions
│   ├── academic/       # schools, academic_years, grade_levels, classes
│   ├── students/       # students, enrollments, transferts de classe
│   ├── guardians/      # guardians, associations, invitations, QR
│   ├── billing/        # fee_types, fee_structures, installments, assignments, discounts
│   ├── payments/       # payments, allocations, reversals, receipts
│   │   └── providers/  # mtn-momo/, orange-money/, cash/, external/
│   ├── notifications/
│   ├── reporting/
│   ├── imports/
│   └── audit/
├── platform/           # infra transverse : db, redis, storage, pdf, sms, logger, errors
└── server.ts
```
Chaque module expose : `routes.ts` (HTTP), `service.ts` (métier + transactions), `repository.ts` (accès données), `schemas.ts` (Zod, réexportés depuis `packages/contracts`).
**Interdit** : qu'un module accède directement au repository d'un autre module. Il passe par le service.

### ADR-005 — Jobs asynchrones : BullMQ + Redis
Files : `pdf` (reçus, exports), `notifications` (push/SMS/email), `scheduler` (relances d'échéance, §79), `reconciliation` (vérification des paiements Mobile Money en attente).
*Pourquoi Redis plutôt que pg-boss* : on a déjà besoin de Redis pour le rate limiting OTP et le cache. Une brique de moins.

### ADR-006 — Génération PDF : `pdfmake`
*Pourquoi* : pur JS, pas de Chromium à héberger, sortie déterministe, tables et polices maîtrisées — adapté aux reçus et listes de classe.
*Alternative écartée* : Playwright/HTML→PDF (rendu plus riche mais ~400 Mo d'image Docker et une source de flakiness dans un contexte de reçu légal).

### ADR-007 — Stockage des fichiers : S3-compatible
MinIO en développement, provider objet en production. Concerne : justificatifs de paiement externe, photos d'élèves, PDF de reçus, fichiers d'import.
**Aucun accès public** : URLs pré-signées à durée courte (5 min), générées par l'API après contrôle de permission.

---

## 4. Frontend web (React)

### ADR-008 — Une seule application React, quatre espaces
Les dashboards Scolarité, Comptabilité, Direction et Admin CSB Noutcha KAMGUE partagent 80 % de leur socle (auth, layout, tables, filtres, exports). Ce sont des **espaces déterminés par les permissions**, pas des applications distinctes.

| Brique | Choix |
|---|---|
| Build | Vite |
| Routing | React Router 7 (data router) |
| État serveur | TanStack Query |
| État client | Zustand (minimal : session, préférences UI) |
| Formulaires | React Hook Form + Zod (schémas issus de `packages/contracts`) |
| UI | Tailwind CSS + shadcn/ui, encapsulés dans `packages/ui` |
| Tables | TanStack Table (tri, filtres, pagination serveur) |
| Graphiques | Recharts |
| i18n | `react-i18next`, **fr** par défaut, structure prête pour **en** |

Structure par domaine, en miroir de l'API :
```text
apps/web/src/
├── app/            # routes, layouts, garde de permissions
├── features/
│   ├── students/  guardians/  billing/  payments/  cashier/
│   ├── reporting/ academic/   users/    audit/
├── shared/         # api client, hooks, formatters (montants, dates), permissions
└── main.tsx
```

---

## 5. Mobile (React Native)

### ADR-009 — Expo (managed workflow) + expo-router
*Pourquoi* : cycle de livraison rapide, OTA updates (précieux pour corriger un bug de paiement sans repasser par le store), `expo-camera` pour le QR, `expo-notifications` pour le push, EAS Build.
*Point de vigilance* : le SDK Mobile Money s'intègre par API HTTP côté serveur, jamais côté app — aucun besoin de module natif custom, donc le managed workflow suffit.

| Brique | Choix |
|---|---|
| Navigation | expo-router (file-based) |
| État serveur | TanStack Query + persistance (`AsyncStorage`) pour la consultation hors ligne |
| Secrets | `expo-secure-store` (tokens) — **jamais** `AsyncStorage` |
| QR | `expo-camera` |
| Push | `expo-notifications` + FCM |
| UI | composants maison + `react-native-reanimated` |
| Cible | Android 8+ / iOS 15+ |

**Consultation hors ligne** : les écrans P06 (accueil), P07 (dossier enfant), P08 (situation financière) et P15 (historique) doivent afficher la dernière donnée connue avec un bandeau « Données du 18/08 à 14h32 ». Le paiement, lui, exige la connexion.

---

## 6. Sécurité & authentification

### ADR-010 — JWT court + refresh token rotatif
- **Access token** : JWT, 15 min, signé HS256 (secret par environnement), porte `sub`, `school_id`, `roles`, `permissions`.
- **Refresh token** : opaque, aléatoire 256 bits, **stocké haché** en base (`sessions`), 30 jours pour le mobile / 12 h pour le web, **rotation à chaque usage** avec détection de réutilisation (si un refresh déjà consommé est présenté → révocation de toute la famille de sessions).
- **Mots de passe** : Argon2id (`memoryCost` 19 Mo, `timeCost` 2, `parallelism` 1).
- **OTP** : 6 chiffres, TTL 5 min, **haché** en base, max 5 tentatives, max 3 envois / heure / numéro, cooldown de 60 s entre deux envois.

### ADR-011 — Isolation multi-établissement : double barrière
1. **Applicative (obligatoire)** : chaque requête porte un `school_id` issu du token ; toute méthode de repository l'exige en paramètre. Un test d'architecture échoue si une requête sur une table portant `school_id` est exécutée sans filtre.
2. **PostgreSQL RLS (recommandée dès la V1)** : Row Level Security activée sur les tables métier avec `current_setting('app.school_id')`, positionné par transaction. Filet de sécurité contre un oubli applicatif. Le rôle SQL de migration la contourne, pas le rôle applicatif.

### Autres mesures
- Rate limiting Redis : global, par IP, et spécifique sur `/auth/*` et `/otp/*`.
- Helmet, CORS liste blanche, HTTPS obligatoire, HSTS.
- Aucun secret dans le dépôt ; variables validées au démarrage par un schéma Zod (l'API refuse de démarrer si une variable manque).
- Webhooks Mobile Money : vérification de signature + liste blanche d'IP + rejeu impossible (voir P11).
- Chiffrement au repos assuré par le provider ; sauvegardes chiffrées.

---

## 7. Données & argent

### ADR-012 — Les montants sont des `BIGINT` en francs CFA entiers
Le XAF n'a **pas de sous-unité**. Aucun `NUMERIC`, aucun `float`, aucun `Number` JS flottant pour un calcul. Colonne : `amount BIGINT NOT NULL CHECK (amount >= 0)`. Côté TS : type nominal `Amount = number & { __brand: 'XAF' }` avec helpers dans `packages/domain` (`add`, `sub`, `percentOf` avec règle d'arrondi explicite au franc inférieur).
La colonne `currency CHAR(3) DEFAULT 'XAF'` existe pour l'avenir mais est contrainte à `'XAF'` en V1.

### ADR-013 — Clés primaires en UUID v7
Ordonnées dans le temps (bonne localité d'index, contrairement à UUIDv4), non devinables (contrairement aux séquentiels exposés dans les URL). Généré applicativement, ou en base via `uuidv7()`.
**Distinct** des identifiants métier lisibles (matricule, n° de reçu, référence de paiement) qui, eux, sont séquentiels et gérés par une table de séquences dédiée (voir [03-MODELE-DONNEES.md](03-MODELE-DONNEES.md)).

### ADR-014 — Dates : `timestamptz` en UTC, affichage `Africa/Douala`
Les dates **métier sans heure** (date de naissance, date d'échéance, date déclarée d'un virement) sont des `DATE`, pas des timestamps — sinon décalage d'un jour garanti.

### ADR-015 — Suppressions
- `students`, `guardians`, `users` : **soft delete** via `status` (§75). Pas de colonne `deleted_at` séparée, le statut suffit et porte du sens métier.
- `payments` : **aucune suppression**, jamais. Le privilège `DELETE` est retiré au rôle SQL applicatif sur cette table et sur `payment_allocations` et `receipts`.
- Données de configuration (frais, classes) : désactivation, pas suppression, dès qu'un lien existe.

---

## 8. Observabilité

| Besoin | Outil |
|---|---|
| Logs | `pino` en JSON, avec `request_id` propagé, **rédaction** des champs sensibles (mot de passe, OTP, token, numéro de téléphone partiellement masqué) |
| Erreurs | Sentry (API, web, mobile) |
| Métriques | Endpoint Prometheus `/metrics` : latence, taux d'erreur, jobs en file, **paiements par statut** |
| Traces | OpenTelemetry (optionnel V1) |
| Santé | `/health` (liveness) et `/health/ready` (Postgres + Redis + stockage) |

**Alertes indispensables dès la mise en production** :
- un paiement bloqué en `PROCESSING` depuis plus de 15 minutes ;
- un webhook opérateur en échec ;
- un écart détecté par le job de réconciliation nocturne ;
- une file BullMQ dont la profondeur dépasse un seuil.

---

## 9. Environnements & déploiement

| Env | Usage | Données | Mobile Money |
|---|---|---|---|
| `local` | Poste développeur — `docker compose up` | Jeu de démonstration (seed) | Provider simulé |
| `staging` | Recette client, tests de bout en bout | Anonymisées | Sandbox opérateurs |
| `production` | Établissement réel | Réelles | Comptes marchands réels |

**Déploiement** : conteneurs Docker (API et workers = deux services distincts à partir de la même image). PostgreSQL managé avec PITR (point-in-time recovery) — non négociable pour des données financières. CI GitHub Actions : lint → typecheck → tests unitaires → tests d'intégration (Testcontainers Postgres) → build → migrations → déploiement.

**Sauvegardes** : quotidiennes, rétention 30 jours, **restauration testée tous les mois**. Une sauvegarde jamais restaurée n'est pas une sauvegarde.

---

## 10. Tests

| Niveau | Outil | Cible |
|---|---|---|
| Unitaire | Vitest | `packages/domain` : **100 % des fonctions de calcul financier** |
| Intégration API | Vitest + Supertest + Testcontainers (vrai PostgreSQL) | Chaque endpoint, permissions comprises |
| Contrat | Zod partagé + tests de sérialisation | Aucune dérive API ↔ clients |
| E2E web | Playwright | Parcours : encaissement, validation externe, réinscription |
| E2E mobile | Maestro | Parcours : inscription + OTP, association, paiement |
| Charge | k6 | Scénario rentrée : 200 paiements/h |

**Trois tests qui doivent exister avant la mise en production** :
1. *Réconciliation* — sur un jeu de 1 000 élèves et 5 000 paiements générés aléatoirement, le solde affiché est égal au recalcul intégral, pour chaque élève.
2. *Idempotence* — rejouer 10 fois le même webhook Mobile Money ne crédite qu'une seule fois.
3. *Cloisonnement* — un parent A ne peut accéder à aucune donnée d'un élève auquel il n'est pas associé en statut `ACCEPTED` (test sur toutes les routes parent).

---

## 10 bis. ADR issues de la réalisation (Phase 00)

### ADR-016 — Linker pnpm : isolé, et non `hoisted`
*Contexte* : le mode `hoisted` est traditionnellement recommandé pour Expo, dont le bundler Metro ne suivait pas les liens symboliques.
*Constat* : sur Windows, `hoisted` recopie l'intégralité de l'arbre à plat — plusieurs minutes à chaque installation, sur chaque poste et à chaque exécution de CI.
*Décision* : rester sur le linker **isolé** (défaut pnpm). Metro gère les symlinks nativement depuis React Native 0.76 / Expo SDK 52, et `apps/mobile/metro.config.js` déclare explicitement `watchFolders`, `nodeModulesPaths` et `unstable_enableSymlinks`.
*Repli* : si Expo posait malgré tout problème, il suffit de remettre `node-linker=hoisted` dans `.npmrc` puis `pnpm install --force`.

### ADR-017 — Ports d'infrastructure décalés
*Contexte* : les ports par défaut (5432, 6379, 1025) sont fréquemment occupés par d'autres projets sur un poste de développement.
*Décision* : PostgreSQL **5442**, Redis **6389**, MinIO **9010/9011**, Mailpit **1035/8035**. Les ports internes aux conteneurs restent standards. Toute modification se répercute dans `apps/api/.env`.

### ADR-018 — Deux rôles PostgreSQL, dès le développement
*Contexte* : ADR-015 interdit la suppression de données financières.
*Décision* : `cplan` (propriétaire, migrations, BYPASSRLS) et `cplan_app` (runtime, privilèges restreints) existent **dès l'environnement local**, et non seulement en production. Une garantie qui n'est vérifiée qu'en production n'en est pas une. Un script `scripts/prisma.mjs` substitue l'URL de connexion le temps des migrations, de façon portable.

### ADR-019 — Séquences applicatives, jamais `SEQUENCE` PostgreSQL
Rappel matérialisé en Phase 00 par la table `number_sequences` : une `SEQUENCE` ne revient pas en arrière sur un rollback, ce qui produirait des trous dans la numérotation des reçus — inacceptable pour une pièce comptable.

### ADR-020 — Préfixe `/api/v1` pour toutes les routes métier
*Constat en Phase 00* : les sondes de santé avaient été exposées à la racine seulement, et le proxy du dashboard tombait sur un 404.
*Décision* : toutes les routes métier sont montées sous `/api/v1`. Les sondes `/health` et `/health/ready` sont exposées **aux deux emplacements** : à la racine pour les orchestrateurs (une sonde ne doit pas dépendre de la version de l'API), et sous le préfixe pour que les clients n'aient qu'une seule base d'URL. Deux tests verrouillent ce comportement.

---

## 11. Récapitulatif des versions

```text
Node            22 LTS
TypeScript      5.x (strict, noUncheckedIndexedAccess)
PostgreSQL      16
Redis           7
Fastify         5
Prisma          6
React           19
Vite            6
React Native    0.86 via Expo SDK 57
pnpm            10
```
