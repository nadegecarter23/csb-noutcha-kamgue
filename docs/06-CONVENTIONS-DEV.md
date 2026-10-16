# 06 — Conventions de développement

Ce document existe pour une raison unique : que le code écrit en semaine 30 ressemble à celui écrit en semaine 2. Sur un projet financier de cette durée, la cohérence vaut plus que l'élégance.

---

## 1. Nommage

| Élément | Convention | Exemple |
|---|---|---|
| Tables SQL | pluriel, snake_case | `student_fee_assignments` |
| Colonnes SQL | snake_case | `final_amount`, `validated_at` |
| Types ENUM SQL | singulier, snake_case | `payment_status` |
| Index | `idx_<table>_<colonnes>` | `idx_payments_school_status_paid_at` |
| Contraintes | `uq_`, `fk_`, `ck_` | `uq_enrollments_student_year` |
| Fichiers TS | kebab-case | `payment-allocation.service.ts` |
| Types / interfaces TS | PascalCase | `PaymentAllocation` |
| Variables / fonctions TS | camelCase | `computeBalance` |
| Constantes | SCREAMING_SNAKE | `MAX_OTP_ATTEMPTS` |
| Composants React | PascalCase | `StudentBalanceCard.tsx` |
| Routes API | kebab-case, pluriel | `/api/v1/fee-structures` |
| Événements / jobs | `domaine.action` | `payment.succeeded`, `receipt.generate` |

**Langue** : le **code est en anglais** (identifiants, types, commentaires techniques). L'**interface utilisateur est en français**, via les fichiers i18n. Aucune chaîne française codée en dur dans un composant.

Un point d'attention : le vocabulaire métier du cahier est français. Le glossaire de traduction fait foi et ne se discute plus une fois figé.

| Français | Anglais (code) |
|---|---|
| Élève | `student` |
| Responsable / parent | `guardian` |
| Inscription (annuelle) | `enrollment` |
| Année scolaire | `academic_year` |
| Niveau | `grade_level` |
| Classe | `class` (table `classes`, éviter `class` comme identifiant TS → `schoolClass`) |
| Matricule | `student_number` |
| Frais | `fee` |
| Structure tarifaire | `fee_structure` |
| Tranche | `installment` |
| Affectation de frais | `student_fee_assignment` |
| Remise | `discount` |
| Paiement | `payment` |
| Affectation d'un paiement | `payment_allocation` |
| Reçu | `receipt` |
| Encaissement | `collection` / `cash-in` |
| Contrepassation | `reversal` |
| Solde | `balance` |
| Reste à payer | `outstanding` |
| Recouvrement | `collection_rate` |
| Impayé | `overdue` |
| Justificatif | `proof` |

---

## 2. API REST

### Format des URL

```
/api/v1/<ressource>            GET (liste), POST (création)
/api/v1/<ressource>/:id        GET, PATCH, DELETE
/api/v1/<ressource>/:id/<action>   POST — pour les actions métier
```

Actions métier explicites plutôt que `PATCH` sur un statut :

```
POST /api/v1/payments/:id/validate
POST /api/v1/payments/:id/reject
POST /api/v1/payments/:id/reverse
POST /api/v1/enrollments/:id/transfer-class
POST /api/v1/academic-years/:id/close
```

*Pourquoi* : `PATCH { status: 'SUCCESS' }` autorise n'importe quelle transition et rend le contrôle d'accès et l'audit imprécis.

### Espaces d'API

| Préfixe | Public | Authentification |
|---|---|---|
| `/api/v1/auth/*` | Tous | Publique / token |
| `/api/v1/parent/*` | App Parent | Token + garde `parentScope` |
| `/api/v1/*` | Dashboards web | Token + permissions |
| `/api/v1/webhooks/*` | Opérateurs | Signature, pas de token |
| `/api/v1/admin/*` | Plateforme | `SUPER_ADMIN` |

### Pagination, tri, filtres

```
GET /api/v1/students?page=1&page_size=25&sort=-created_at
    &academic_year_id=…&class_id=…&status=ACTIVE&q=fotso
```

Réponse :
```jsonc
{
  "data": [ … ],
  "meta": { "page": 1, "page_size": 25, "total": 1243, "total_pages": 50 }
}
```

`page_size` maximum 100 ; les exports passent par un job asynchrone, jamais par `page_size=10000`.

### Erreurs — format unique

```jsonc
{
  "error": {
    "code": "INSUFFICIENT_BALANCE",       // stable, testable, traduisible côté client
    "message": "Le montant dépasse le reste à payer.",
    "details": [
      { "field": "amount", "code": "MAX", "message": "Maximum : 75 000 FCFA" }
    ],
    "request_id": "01J9X..."
  }
}
```

| HTTP | Usage |
|---|---|
| 400 | Corps invalide (échec de validation Zod) |
| 401 | Non authentifié / token expiré |
| 403 | Authentifié mais permission manquante, ou hors périmètre parent |
| 404 | Ressource inexistante **ou hors périmètre** (on ne révèle pas l'existence) |
| 409 | Conflit métier (transition d'état interdite, doublon de matricule) |
| 422 | Règle métier violée (`final_amount < paid_amount`) |
| 429 | Rate limit |
| 500 | Erreur inattendue — jamais de détail technique exposé |

Les codes d'erreur métier sont centralisés dans `packages/contracts/errors.ts` et **listés exhaustivement**. Un code d'erreur inventé à la volée dans un service fait échouer le lint.

### Montants dans les payloads

Toujours des **entiers en FCFA**, jamais de chaîne formatée, jamais de flottant.

```jsonc
{ "amount": 75000, "currency": "XAF" }   // ✔
{ "amount": "75 000 FCFA" }              // ✖
{ "amount": 75000.0 }                    // ✖
```

Le formatage (`75 000 FCFA`, espace insécable) est **exclusivement** une affaire de présentation, réalisée par un helper partagé `formatAmount()`.

### Idempotence

`POST /api/v1/parent/payments` et `POST /api/v1/payments/cash` exigent un header `Idempotency-Key` (UUID généré par le client). Réponse rejouée si la clé est connue et le corps identique ; `409` si la clé est connue avec un corps différent.

### Versionnement

Préfixe `/v1`. Toute rupture de contrat impose `/v2` — l'app mobile installée sur un téléphone n'est pas déployable à la demande.

---

## 3. Structure d'un module backend

```text
modules/payments/
├── payments.routes.ts        # déclaration HTTP, schémas, permissions — AUCUNE logique
├── payments.service.ts       # orchestration, transactions, appels au domaine
├── payments.repository.ts    # accès données, seul endroit avec du SQL/Prisma
├── payments.schemas.ts       # Zod (réexportés depuis packages/contracts)
├── payments.mapper.ts        # entité → DTO (dont le sérialiseur parent cloisonné)
├── providers/
│   ├── mtn-momo.provider.ts
│   ├── orange-money.provider.ts
│   └── payment-provider.interface.ts
└── __tests__/
```

**Les quatre règles de couches :**
1. Une route ne contient aucune logique métier — elle valide, appelle le service, sérialise.
2. Un service ne contient aucun SQL — il orchestre et gère la transaction.
3. Un repository ne contient aucune règle métier — il lit et écrit.
4. `packages/domain` ne contient aucune I/O — que du calcul pur.

Les providers de paiement implémentent une interface commune :

```ts
interface PaymentProvider {
  readonly code: 'MTN_MOMO' | 'ORANGE_MONEY';
  initiate(input: InitiateInput): Promise<InitiateResult>;
  getStatus(providerReference: string): Promise<ProviderStatus>;
  verifyWebhook(headers: Headers, rawBody: Buffer): WebhookVerification;
  parseWebhook(payload: unknown): ProviderEvent;
}
```

Ajouter un opérateur = un fichier, zéro modification du moteur de paiement. C'est le test de qualité de l'abstraction.

---

## 4. Transactions base de données

```ts
// Toute opération financière passe par là
await db.$transaction(async (tx) => {
  const enrollment = await tx.$queryRaw`SELECT … FOR UPDATE`;   // verrou explicite
  …
}, { isolationLevel: 'ReadCommitted', timeout: 10_000 });
```

Règles :
- **Aucun appel réseau dans une transaction** (ni opérateur MoMo, ni SMS, ni S3). Ils se font avant, ou après le commit via un job.
- Une transaction dure moins de 10 s ; au-delà, c'est une erreur de conception.
- Génération de PDF, envoi de notifications, génération d'exports : **toujours après commit**, via BullMQ.

---

## 5. Migrations

- Une migration = un changement cohérent, nommée `YYYYMMDDHHMM_verbe_objet` (`202603151030_add_cash_sessions`).
- **Jamais** de modification d'une migration déjà appliquée en staging ou production. On en ajoute une nouvelle.
- Toute migration destructive (`DROP COLUMN`, `NOT NULL` sur table peuplée) se déploie en deux temps : ajout compatible → déploiement du code → nettoyage.
- Les données de référence (permissions, rôles, types de frais du §16) sont chargées par des **migrations de seed idempotentes** (`INSERT … ON CONFLICT DO NOTHING`), pas par un script manuel.
- Chaque migration est testée en restauration sur une copie de la base de staging avant production.

---

## 6. Frontend

### Web

```text
features/payments/
├── api/            # hooks TanStack Query — un fichier par ressource
├── components/
├── pages/
├── hooks/
└── types.ts        # réexports depuis packages/contracts
```

- Aucun `fetch` direct dans un composant : tout passe par un hook `useXxxQuery` / `useXxxMutation`.
- Clés de cache normalisées : `['payments', 'list', filters]`, `['payments', 'detail', id]`.
- Chaque table de données gère explicitement quatre états : chargement (skeleton), vide (message actionnable), erreur (avec bouton réessayer), succès. **Un état vide sans explication est un bug.**
- Les montants s'affichent uniquement via `<Amount value={75000} />`.
- Les dates uniquement via `formatDate()` / `formatDateTime()`, en fuseau `Africa/Douala`.

### Mobile

- Mêmes hooks TanStack Query, avec persistance pour la consultation hors ligne.
- Chaque écran qui affiche des données financières indique la fraîcheur (« Mis à jour il y a 3 min ») et propose un rafraîchissement manuel.
- Les écrans de paiement sont **strictement en ligne** : perte de réseau ⇒ message explicite, jamais de file d'attente locale de paiements.
- Après une initiation de paiement, l'écran d'attente (P11) est **résistant au redémarrage de l'app** : la reprise se fait sur `payment_id` persisté localement.

---

## 7. Tests

| Type | Emplacement | Règle |
|---|---|---|
| Domaine | `packages/domain/**/__tests__` | Couverture 100 %, obligatoire pour tout calcul de montant |
| Intégration API | `apps/api/**/__tests__` | Vrai PostgreSQL (Testcontainers), pas de mock de base |
| Permissions | `apps/api/__tests__/permissions.spec.ts` | Chaque route × chaque rôle |
| Cloisonnement parent | `apps/api/__tests__/parent-scope.spec.ts` | Toutes les routes `/parent/*` avec un parent non associé |
| Réconciliation | `apps/api/__tests__/reconciliation.spec.ts` | Jeu généré : solde rapide ≡ solde recalculé |
| E2E web | `apps/web/e2e` | Parcours critiques uniquement |
| E2E mobile | `apps/mobile/.maestro` | Inscription, association, paiement |

Nommage : `describe('PaymentAllocationService')` → `it('répartit le reliquat en avance quand le surpaiement est autorisé')`. Les libellés de test sont en français, ils documentent le métier.

**Aucune donnée de test en dur codée dans les tests** : des factories (`makeStudent()`, `makePayment()`) dans `apps/api/__tests__/factories`.

---

## 8. Git

- Branches : `main` (protégée, déployable à tout instant), `feat/<phase>-<sujet>`, `fix/<sujet>`.
- Commits conventionnels, portée = le module : `feat(payments): allocation en cascade par priorité de frais`.
- Une PR = une unité fonctionnelle livrable, avec sa description : quoi, pourquoi, comment tester.
- Toute PR touchant `packages/domain`, `payments`, `billing` ou une migration exige **deux relecteurs**.
- CI obligatoire avant fusion : lint, typecheck, tests unitaires, tests d'intégration, build.

---

## 9. Definition of Done (à appliquer à chaque phase)

Une phase n'est terminée que si **tous** ces points sont vrais :

- [ ] Toutes les fonctionnalités du périmètre de la phase sont implémentées
- [ ] Migrations écrites, testées à l'aller **et au retour**
- [ ] Endpoints documentés (OpenAPI généré depuis les schémas Zod)
- [ ] Permissions déclarées sur chaque route mutative
- [ ] Actions sensibles auditées
- [ ] Tests unitaires du domaine : verts, couverture atteinte
- [ ] Tests d'intégration : chemin nominal **et** cas d'erreur
- [ ] Écrans conformes aux références du cahier (P0x / S0x / C0x / D0x)
- [ ] États chargement / vide / erreur gérés sur chaque écran
- [ ] Textes en français passés par i18n
- [ ] Aucun `TODO` ni `console.log` dans le code fusionné
- [ ] Le seed de démonstration permet de rejouer le parcours de bout en bout
- [ ] Le tableau de suivi de [00-INDEX.md](00-INDEX.md) est mis à jour
- [ ] Démonstration faite au client sur l'environnement de recette

---

## 10. Journal des décisions

Toute décision structurante prise en cours de route s'ajoute dans [02-ARCHITECTURE-TECHNIQUE.md](02-ARCHITECTURE-TECHNIQUE.md) sous forme d'ADR numérotée : contexte, décision, alternatives écartées, conséquences. Une décision qui n'est pas écrite sera re-débattue dans six semaines.
