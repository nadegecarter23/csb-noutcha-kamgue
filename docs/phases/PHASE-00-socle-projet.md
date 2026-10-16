# PHASE 00 — Socle projet

**Durée estimée** : 1 semaine · **Pré-requis** : aucun · **Valeur métier livrée** : aucune (et c'est normal)

---

## 1. Objectif

Mettre en place l'ossature technique du projet pour que toute phase suivante consiste à écrire du métier, jamais de la plomberie. À la fin de cette phase, un développeur qui clone le dépôt doit être opérationnel en une commande.

---

## 2. Périmètre

### Inclus
- Monorepo pnpm + Turborepo, avec les trois applications et les quatre paquets
- `docker-compose` de développement : PostgreSQL 16, Redis 7, MinIO, Mailpit
- API Fastify qui démarre, répond sur `/health`, valide sa configuration au boot
- Prisma configuré, première migration (extensions PostgreSQL, fonction `uuidv7()`)
- Web React (Vite) qui démarre, affiche une page de connexion inerte
- Mobile Expo qui démarre, affiche l'écran P01 statique
- Client HTTP partagé, format d'erreur, logger, gestion de configuration
- CI GitHub Actions : lint → typecheck → tests → build
- Script de seed vide mais exécutable

### Exclu
- Toute authentification réelle (Phase 01)
- Tout modèle de données métier (Phase 01+)
- Toute mise en production (Phase 17)

---

## 3. Travaux détaillés

### 3.1 Monorepo

```bash
cplan/
├── apps/api  apps/web  apps/mobile
├── packages/contracts  packages/domain  packages/ui  packages/config
├── infra/docker  docs/
├── pnpm-workspace.yaml  turbo.json  .nvmrc  .editorconfig
```

`packages/config` centralise : `tsconfig.base.json` (strict, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`), config ESLint plate, Prettier.

Scripts racine :
```json
{
  "dev": "turbo run dev",
  "build": "turbo run build",
  "lint": "turbo run lint",
  "typecheck": "turbo run typecheck",
  "test": "turbo run test",
  "db:migrate": "pnpm --filter api prisma migrate dev",
  "db:seed": "pnpm --filter api tsx src/seed/index.ts",
  "db:reset": "pnpm --filter api prisma migrate reset --force"
}
```

### 3.2 Infrastructure locale

`infra/docker/docker-compose.yml` : `postgres:16-alpine` (port 5432, volume persistant), `redis:7-alpine`, `minio` (buckets `cplan-dev` créés par un service `mc` d'init), `mailpit` (SMTP de test, UI web).

### 3.3 API — socle

- **Configuration** : `src/platform/config.ts`, schéma Zod exhaustif. L'API refuse de démarrer si une variable manque ou est mal typée. Aucune valeur par défaut pour un secret.
- **Logger** : pino, JSON en production, joli en local, `request_id` (ULID) propagé par un hook, **rédaction** de `password`, `token`, `otp`, `authorization`, masquage partiel de `phone`.
- **Erreurs** : classe `AppError` (code, statut HTTP, détails), gestionnaire d'erreurs global produisant le format du doc 06. Aucune stack trace exposée hors développement.
- **Santé** : `/health` (200 immédiat) et `/health/ready` (vérifie PostgreSQL, Redis, MinIO).
- **Plugins** : helmet, CORS liste blanche, `@fastify/rate-limit` sur Redis, compression, `fastify-type-provider-zod`, Swagger UI généré depuis les schémas (activé hors production).
- **Structure des modules** : un module `health` complet servant de gabarit de référence (routes / service / repository / schemas / tests).

### 3.4 Base de données

Première migration :
```sql
CREATE EXTENSION IF NOT EXISTS "pg_trgm";    -- recherche floue sur les noms (§76)
CREATE EXTENSION IF NOT EXISTS "citext";     -- e-mails insensibles à la casse
CREATE EXTENSION IF NOT EXISTS "unaccent";   -- recherche sans accents
-- fonction uuidv7() (implémentation SQL, en attendant PG18)
-- fonction trigger set_updated_at()
```

Deux rôles SQL distincts :
- `cplan_migrator` — propriétaire du schéma, utilisé par les migrations uniquement
- `cplan_app` — rôle applicatif : `SELECT/INSERT/UPDATE` sur les tables métier, **pas de `DELETE`** sur `payments`, `payment_allocations`, `receipts`, `audit_logs` (ADR-015)

### 3.5 Web — socle

Vite + React 19 + TypeScript, Tailwind + shadcn/ui initialisés dans `packages/ui`, React Router avec un layout applicatif (barre latérale, en-tête, fil d'Ariane), TanStack Query (`staleTime` 30 s, retry 1), i18n `fr` avec la structure de fichiers, page de connexion **statique**, page 404, frontière d'erreur globale.

### 3.6 Mobile — socle

Expo + TypeScript + expo-router, thème et composants de base (Button, Input, Card, Screen), écran P01 « Bienvenue » statique (logo, `Créer un compte`, `Se connecter`), TanStack Query avec persistance `AsyncStorage`, `expo-secure-store` prêt, EAS configuré pour un build de développement.

### 3.7 CI

Workflow `ci.yml` sur chaque PR : install (cache pnpm) → lint → typecheck → tests unitaires → tests d'intégration (service PostgreSQL) → build. Turborepo en cache distant pour la vitesse. Blocage de la fusion si un job échoue.

---

## 4. Critères d'acceptation

- [ ] `git clone && pnpm install && docker compose up -d && pnpm db:migrate && pnpm dev` fonctionne sur une machine vierge (Windows, macOS, Linux)
- [ ] `curl localhost:3000/health/ready` renvoie 200 avec l'état des trois dépendances
- [ ] L'API refuse de démarrer si `DATABASE_URL` est absente, avec un message explicite
- [ ] Le web s'affiche sur `localhost:5173`, le mobile sur Expo Go
- [ ] `pnpm lint && pnpm typecheck && pnpm test` : tout vert
- [ ] La CI passe sur une PR de démonstration
- [ ] Le `README.md` racine décrit l'installation en moins de 20 lignes
- [ ] `docs/` est versionné et lisible

---

## 5. Risques

| Risque | Parade |
|---|---|
| Sur-ingénierie du socle, phase qui déborde | Timebox stricte à 5 jours. Ce qui n'est pas nécessaire à la Phase 01 est reporté. |
| Divergence de version Node entre développeurs | `.nvmrc` + vérification `engines` dans `package.json` |
| Expo capricieux sous Windows | Documenter la procédure Windows dans le README dès le premier jour |
| Configuration Prisma + Testcontainers laborieuse | La traiter en Phase 00, pas en Phase 01 : c'est précisément le rôle du socle |
