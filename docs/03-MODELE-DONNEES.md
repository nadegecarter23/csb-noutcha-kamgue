# 03 — Modèle de données PostgreSQL

Ce document reprend le modèle du §60 à §64 du cahier, le complète et le rend implémentable (types, contraintes, index, invariants). Les ajouts par rapport au cahier sont signalés par **➕**, avec la justification.

**Conventions** (détail dans [06-CONVENTIONS-DEV.md](06-CONVENTIONS-DEV.md)) :
- Tables au pluriel, snake_case. Colonnes snake_case.
- PK : `id UUID PRIMARY KEY DEFAULT uuidv7()`.
- Toute table métier porte `school_id UUID NOT NULL REFERENCES schools(id)`.
- Horodatage : `created_at timestamptz NOT NULL DEFAULT now()`, `updated_at timestamptz NOT NULL DEFAULT now()` (trigger).
- Montants : `BIGINT` en FCFA entiers, `CHECK (>= 0)` sauf mention contraire.
- Les énumérations sont des **types PostgreSQL `ENUM`** quand la liste est fermée et stable, des `TEXT` + `CHECK` quand elle est amenée à évoluer.

---

## Vue d'ensemble

```text
                            schools
                               │
   ┌───────────┬───────────────┼─────────────┬──────────────┐
   │           │               │             │              │
users      academic_years  grade_levels   students      fee_types
   │           │               │             │              │
staff_     classes ◄───────────┘             │         fee_structures
profiles       │                             │              │
   │           └──────────► enrollments ◄────┘         fee_installments
user_roles                       │                          │
   │                             ├── student_fee_assignments ┘
roles                            │            │
   │                             │       student_fee_installments ➕
permissions                      │            │
                                 │       discounts
                                 │
              guardians ── student_guardians ── students
                  │
            guardian_invites
            guardian_link_requests ➕

                          payments
                             │
              ┌──────────────┼───────────────┬──────────────┐
              │              │               │              │
    payment_allocations  receipts   external_payment_   payment_provider_
              │                        proofs              events ➕
              ▼
    student_fee_assignments

  notifications · notification_deliveries ➕ · device_tokens ➕
  audit_logs · files ➕ · number_sequences ➕ · import_batches ➕ · idempotency_keys ➕
```

---

# A. Établissement & configuration

## `schools`

| Colonne | Type | Contraintes |
|---|---|---|
| id | uuid | PK |
| name | text | NOT NULL |
| code | text | NOT NULL, UNIQUE |
| address | text | |
| phone | text | |
| email | citext | |
| logo_file_id | uuid | FK → files ➕ |
| status | school_status | NOT NULL DEFAULT 'ACTIVE' |
| created_at / updated_at | timestamptz | |

`school_status` : `ACTIVE`, `SUSPENDED`, `ARCHIVED`.

## ➕ `school_settings`

*Pourquoi* : le cahier suppose partout des paramètres d'établissement (préfixe de matricule, préfixe de reçu, devise, délais de relance §79, tolérance de paiement partiel). Les coder en dur rend chaque changement dépendant d'un déploiement.

| Colonne | Type | Détail |
|---|---|---|
| school_id | uuid | PK, FK → schools |
| timezone | text | DEFAULT 'Africa/Douala' |
| currency | char(3) | DEFAULT 'XAF' |
| student_number_prefix | text | ex. `CPLAN-` |
| student_number_padding | int | DEFAULT 5 → `CPLAN-00342` |
| receipt_number_format | text | ex. `CPL-RCT-{YEAR}-{SEQ:6}` |
| payment_reference_format | text | ex. `CPL-{YYMMDD}-{SEQ:6}` |
| allocation_strategy | text | `BY_PRIORITY_THEN_DUE_DATE` \| `MANUAL` (voir doc 04) |
| allow_overpayment | boolean | DEFAULT true |
| reminder_days_before | int[] | DEFAULT `{7,1}` |
| reminder_days_after | int[] | DEFAULT `{7,15,30}` |
| external_payment_sla_hours | int | DEFAULT 48 (§49) |
| invite_token_ttl_days | int | DEFAULT 60 |

## ➕ `number_sequences`

*Pourquoi* : matricules, numéros de reçus et références de paiement doivent être **séquentiels, sans trou, uniques par établissement et par année**. Un `MAX(...)+1` applicatif produit des doublons en concurrence.

| Colonne | Type |
|---|---|
| school_id | uuid, PK composite |
| scope | text, PK composite — `STUDENT_NUMBER` \| `RECEIPT` \| `PAYMENT_REF` \| `INVOICE` |
| period | text, PK composite — `''` ou `'2026'` ou `'202608'` |
| current_value | bigint NOT NULL DEFAULT 0 |

Allocation par `UPDATE … SET current_value = current_value + 1 RETURNING current_value` dans la transaction métier (verrou de ligne). Ne jamais utiliser une `SEQUENCE` PostgreSQL : elle laisse des trous en cas de rollback, inacceptable pour une numérotation de reçus.

## ➕ `files`

*Pourquoi* : justificatifs (§25), photos d'élèves (§35), PDF de reçus (§28), fichiers d'import (§40). Une table unique évite d'éparpiller des colonnes `*_url` non contrôlées.

| Colonne | Type | Détail |
|---|---|---|
| id | uuid | PK |
| school_id | uuid | FK |
| storage_key | text | clé S3, NOT NULL |
| original_name | text | |
| mime_type | text | NOT NULL |
| size_bytes | bigint | NOT NULL |
| checksum_sha256 | text | détection de doublon de justificatif |
| kind | text | `STUDENT_PHOTO` \| `PAYMENT_PROOF` \| `RECEIPT_PDF` \| `IMPORT_FILE` \| `SCHOOL_LOGO` \| `EXPORT` |
| uploaded_by | uuid | FK → users, nullable |
| created_at | timestamptz | |

Aucune URL publique stockée : l'API génère une URL pré-signée à la demande, après contrôle de permission.

---

# B. Identité, rôles & accès

## `users`

| Colonne | Type | Contraintes |
|---|---|---|
| id | uuid | PK |
| first_name / last_name | text | NOT NULL |
| phone | text | **NOT NULL, UNIQUE, format E.164** (`CHECK (phone ~ '^\+[1-9][0-9]{7,14}$')`) |
| phone_verified_at | timestamptz | NULL tant que non vérifié |
| email | citext | nullable, UNIQUE si non nul |
| email_verified_at | timestamptz | ➕ |
| password_hash | text | Argon2id, nullable (compte créé par invitation) |
| status | user_status | NOT NULL DEFAULT 'ACTIVE' |
| last_login_at | timestamptz | |
| failed_login_count | int | ➕ DEFAULT 0 |
| locked_until | timestamptz | ➕ verrouillage temporaire après échecs |
| created_at / updated_at | timestamptz | |

`user_status` : `PENDING_VERIFICATION`, `ACTIVE`, `SUSPENDED`, `DISABLED`.

> `users` n'a **pas** de `school_id` : un utilisateur (surtout un parent) peut à terme avoir des enfants dans plusieurs établissements. Le rattachement passe par `user_roles` et `staff_profiles`.

## `staff_profiles`

| Colonne | Type |
|---|---|
| id | uuid PK |
| user_id | uuid FK → users, NOT NULL |
| school_id | uuid FK → schools, NOT NULL |
| employee_number | text, UNIQUE par école |
| job_title | text |
| status | text — `ACTIVE` \| `SUSPENDED` \| `LEFT` |

`UNIQUE (user_id, school_id)`.

## `roles` / `permissions` / `role_permissions` / `user_roles`

Détail complet dans [05-RBAC-PERMISSIONS.md](05-RBAC-PERMISSIONS.md).

- `roles` : `id`, `code` (UNIQUE), `name`, `is_system` (empêche la suppression des rôles natifs), `school_id` nullable (NULL = rôle système global).
- ➕ `permissions` : `id`, `code` (ex. `payments.validate_external`), `description`, `group`. *Pourquoi* : le cahier (§56) décrit des permissions fines, incompatibles avec un simple champ `role` sur l'utilisateur.
- `role_permissions` : `role_id`, `permission_id`, PK composite.
- `user_roles` : `user_id`, `role_id`, `school_id`, PK composite. Un utilisateur peut être comptable dans l'école A et parent dans l'école B.

## ➕ `sessions`

| Colonne | Type | Détail |
|---|---|---|
| id | uuid PK | |
| user_id | uuid FK | |
| refresh_token_hash | text NOT NULL UNIQUE | SHA-256 du token opaque |
| family_id | uuid NOT NULL | détection de réutilisation (rotation) |
| device_label | text | « Samsung A12 », « Chrome / Windows » |
| ip_address | inet | |
| user_agent | text | |
| expires_at | timestamptz NOT NULL | |
| revoked_at | timestamptz | |
| last_used_at | timestamptz | |

## ➕ `otp_codes`

| Colonne | Type | Détail |
|---|---|---|
| id | uuid PK | |
| phone | text NOT NULL | E.164 |
| purpose | text NOT NULL | `SIGNUP` \| `LOGIN` \| `PHONE_CHANGE` \| `PASSWORD_RESET` |
| code_hash | text NOT NULL | **jamais le code en clair** |
| expires_at | timestamptz NOT NULL | +5 min |
| consumed_at | timestamptz | |
| attempts | int DEFAULT 0 | max 5 |
| sent_count | int DEFAULT 1 | |
| created_at | timestamptz | |

Index `(phone, purpose, created_at DESC)`. Purge des codes consommés/expirés > 7 jours par job.

## ➕ `idempotency_keys`

*Pourquoi* : l'app mobile en réseau instable rejoue les requêtes. Sans cela, un double-tap sur « Payer » crée deux transactions.

| Colonne | Type |
|---|---|
| key | text PK (fourni par le client, header `Idempotency-Key`) |
| user_id | uuid |
| endpoint | text |
| request_hash | text — rejet si même clé, corps différent |
| response_status | int |
| response_body | jsonb |
| created_at | timestamptz |
| expires_at | timestamptz (24 h) |

---

# C. Référentiel scolaire

## `academic_years`

| Colonne | Type | Détail |
|---|---|---|
| id | uuid PK | |
| school_id | uuid FK NOT NULL | |
| name | text NOT NULL | `2026/2027` |
| start_date / end_date | date NOT NULL | `CHECK (end_date > start_date)` |
| status | academic_year_status NOT NULL | |
| is_current | boolean NOT NULL DEFAULT false | |

`academic_year_status` : `DRAFT`, `ACTIVE`, `CLOSED`, `ARCHIVED` (§31).
Contraintes : `UNIQUE (school_id, name)` ; **index unique partiel** `UNIQUE (school_id) WHERE is_current` → garantit une seule année courante par établissement.

## `grade_levels`

| Colonne | Type | Détail |
|---|---|---|
| id | uuid PK | |
| school_id | uuid FK | |
| name | text NOT NULL | `6e` |
| code | text NOT NULL | `6E` — `UNIQUE (school_id, code)` |
| order_index | int NOT NULL | tri pédagogique |
| cycle | text | ➕ `PRIMAIRE` \| `COLLEGE` \| `LYCEE` (§32 mentionne « cycle ») |
| status | text | `ACTIVE` \| `INACTIVE` |

## `classes`

| Colonne | Type | Détail |
|---|---|---|
| id | uuid PK | |
| school_id | uuid FK | |
| academic_year_id | uuid FK NOT NULL | **règle 5 du §81** |
| grade_level_id | uuid FK NOT NULL | |
| name | text NOT NULL | `6e A` |
| capacity | int | `CHECK (capacity > 0)` |
| head_teacher_user_id | uuid FK nullable | « responsable facultatif » (§33) |
| status | text | `ACTIVE` \| `INACTIVE` |

`UNIQUE (school_id, academic_year_id, name)`.

## ➕ `student_categories`

*Pourquoi* : le §17 fait varier les tarifs selon « type d'élève, régime, programme, situation particulière ». Sans cette table, la seule issue est de dupliquer des structures de frais.

| Colonne | Type | Exemples |
|---|---|---|
| id | uuid PK | |
| school_id | uuid FK | |
| code / name | text | `EXTERNE`, `DEMI_PENSIONNAIRE`, `INTERNE`, `BOURSIER`, `PERSONNEL` |
| status | text | |

---

# D. Élèves & inscriptions

## `students`

| Colonne | Type | Détail |
|---|---|---|
| id | uuid PK | |
| school_id | uuid FK NOT NULL | |
| student_number | text NOT NULL | `CPLAN-00342` — `UNIQUE (school_id, student_number)` |
| first_name / last_name | text NOT NULL | |
| date_of_birth | **date** | pas timestamptz |
| place_of_birth | text | |
| gender | gender_enum | `M` \| `F` |
| photo_file_id | uuid FK → files | |
| status | student_status NOT NULL DEFAULT 'ACTIVE' | |
| created_at / updated_at | timestamptz | |

`student_status` (§5) : `ACTIVE`, `INACTIVE`, `GRADUATED`, `TRANSFERRED`, `SUSPENDED`, `ARCHIVED`.

**Pas de `class_id`, pas de `academic_year_id`** sur cette table. C'est l'erreur n°2 du §8 de la vision.

Index : `(school_id, status)`, index trigram sur `last_name`/`first_name` pour la recherche (§76).

## `enrollments`

| Colonne | Type | Détail |
|---|---|---|
| id | uuid PK | |
| student_id | uuid FK NOT NULL | |
| school_id | uuid FK NOT NULL | |
| academic_year_id | uuid FK NOT NULL | |
| class_id | uuid FK nullable | nullable = élève « non affecté » (indicateur S01) |
| student_category_id | uuid FK nullable | ➕ régime de l'année |
| enrollment_date | date NOT NULL | |
| enrollment_type | text | ➕ `NEW` \| `RE_ENROLLMENT` \| `TRANSFER_IN` (indicateurs S01 : nouvelles inscriptions vs réinscriptions) |
| status | enrollment_status NOT NULL | `DRAFT`, `ACTIVE`, `SUSPENDED`, `COMPLETED`, `WITHDRAWN`, `CANCELLED` |
| created_at / updated_at | timestamptz | |

**`UNIQUE (student_id, academic_year_id)`** → matérialise la règle 6 du §81.
`CHECK` applicatif : `class_id` doit appartenir au même `academic_year_id`.

## ➕ `student_class_changes`

*Pourquoi* : le §30 propose l'action « Changer un élève de classe » et le §37 un onglet « Historique ». Le journal d'audit générique répond mal aux besoins de consultation métier.

| Colonne | Type |
|---|---|
| id | uuid PK |
| enrollment_id | uuid FK NOT NULL |
| from_class_id / to_class_id | uuid FK nullable |
| reason | text |
| changed_by | uuid FK → users |
| changed_at | timestamptz |

---

# E. Responsables & associations

## `guardians`

Un responsable **existe indépendamment d'un compte utilisateur** (§6 : l'établissement le saisit, le parent crée son compte ensuite).

| Colonne | Type | Détail |
|---|---|---|
| id | uuid PK | |
| school_id | uuid FK NOT NULL | |
| user_id | uuid FK nullable | rempli quand le parent crée son compte |
| first_name / last_name | text NOT NULL | |
| phone | text NOT NULL | **E.164 normalisé — clé de la détection auto (§8)** |
| phone_secondary | text | ➕ prévu au §35 |
| email | citext | |
| occupation | text | ➕ optionnel |
| address | text | ➕ optionnel |
| status | text | `ACTIVE` \| `INACTIVE` |

Index : `UNIQUE (school_id, phone)` — si deux élèves ont le même père, c'est **le même guardian**, pas deux lignes. Index sur `phone` seul (recherche cross-école lors de l'inscription du parent).

## `student_guardians`

| Colonne | Type | Détail |
|---|---|---|
| id | uuid PK | |
| student_id | uuid FK NOT NULL | |
| guardian_id | uuid FK NOT NULL | |
| relationship | text NOT NULL | `PERE`, `MERE`, `TUTEUR`, `ONCLE`, `TANTE`, `GRAND_PARENT`, `AUTRE` |
| is_primary | boolean DEFAULT false | responsable principal |
| is_financial_responsible | boolean DEFAULT false | |
| can_pay | boolean DEFAULT true | |
| can_view_finances | boolean DEFAULT true | |
| can_receive_notifications | boolean DEFAULT true | |
| status | link_status NOT NULL DEFAULT 'PENDING' | |
| accepted_at / rejected_at / revoked_at | timestamptz | |
| revoked_by | uuid FK → users | ➕ §74 |
| revoke_reason | text | ➕ |
| created_by | uuid FK → users | ➕ traçabilité |
| created_at | timestamptz | |

`link_status` (§9) : `PENDING`, `ACCEPTED`, `REJECTED`, `REVOKED`, `EXPIRED`.
`UNIQUE (student_id, guardian_id)`.
Index unique partiel : un seul `is_primary = true` par élève.

> **Invariant de sécurité** : aucune donnée d'élève n'est servie à un parent si le lien n'est pas en `ACCEPTED`. Statut vérifié dans une garde centralisée, pas dans chaque endpoint.

## `guardian_invites`

| Colonne | Type | Détail |
|---|---|---|
| id | uuid PK | |
| school_id | uuid FK | ➕ |
| student_id | uuid FK NOT NULL | |
| guardian_id | uuid FK nullable | |
| phone | text nullable | |
| token_hash | text NOT NULL | ➕ **haché** — le token en clair n'existe que sur la fiche imprimée |
| short_code | text | `8F7K-PQ4M` (§11), UNIQUE parmi les invitations actives |
| type | invite_type NOT NULL | `PHONE`, `SMS`, `CODE`, `QR_CODE` |
| expires_at | timestamptz NOT NULL | |
| max_uses | int NOT NULL DEFAULT 1 | |
| used_count | int NOT NULL DEFAULT 0 | |
| status | text | `ACTIVE`, `USED`, `EXPIRED`, `REVOKED` |
| created_by | uuid FK | |
| created_at | timestamptz | |

## ➕ `guardian_invite_uses`

*Pourquoi* : le §12 exige que le code soit « journalisé ». Un compteur ne dit ni qui, ni quand, ni depuis où.

| Colonne | Type |
|---|---|
| id, invite_id, user_id, ip_address, user_agent, result (`SUCCESS`/`EXPIRED`/`REVOKED`/`MAX_USES`), used_at |

## ➕ `guardian_link_requests`

*Pourquoi* : le §10 propose « Demander une association » (le parent initie) et le §73 « Ce n'est pas mon enfant » (le parent conteste). Les deux créent une tâche pour l'administration, absente du modèle du cahier.

| Colonne | Type | Détail |
|---|---|---|
| id | uuid PK | |
| school_id | uuid FK | |
| requested_by_user_id | uuid FK NOT NULL | |
| student_id | uuid FK nullable | connu si matricule fourni |
| claimed_student_number | text | saisi par le parent |
| claimed_student_name | text | |
| relationship | text | |
| kind | text NOT NULL | `LINK_REQUEST` \| `DISPUTE` (§73) |
| message | text | |
| status | text NOT NULL | `PENDING`, `APPROVED`, `REJECTED`, `CANCELLED` |
| handled_by / handled_at / resolution_note | | |

Alimente l'indicateur S01 « Associations parents en attente ».

---

# F. Structure financière (OBLIGATION)

## `fee_types`

| Colonne | Type | Détail |
|---|---|---|
| id | uuid PK | |
| school_id | uuid FK | |
| name | text NOT NULL | `Pension scolaire` |
| code | text NOT NULL | `PENSION` — `UNIQUE (school_id, code)` |
| description | text | |
| is_mandatory | boolean DEFAULT true | ➕ §16 « caractère obligatoire » |
| priority | int NOT NULL DEFAULT 100 | ➕ **ordre d'affectation automatique** d'un paiement (doc 04) |
| status | text | `ACTIVE` \| `INACTIVE` |

Valeurs initialisées au seed (§16) : inscription, réinscription, pension, APE, assurance, uniforme, informatique, bibliothèque, transport, cantine, examen, activité, frais exceptionnel, autres.

## `fee_structures`

Le tarif applicable à une population, pour une année.

| Colonne | Type | Détail |
|---|---|---|
| id | uuid PK | |
| school_id | uuid FK | |
| academic_year_id | uuid FK NOT NULL | |
| fee_type_id | uuid FK NOT NULL | |
| grade_level_id | uuid FK **nullable** | NULL = tous niveaux |
| class_id | uuid FK **nullable** | ➕ §17 : variation possible par classe |
| student_category_id | uuid FK **nullable** | ➕ §17 : régime / type d'élève |
| name | text NOT NULL | |
| amount | bigint NOT NULL | |
| is_mandatory | boolean DEFAULT true | ➕ un frais optionnel (transport) n'est pas affecté d'office |
| allow_partial_payment | boolean DEFAULT true | |
| allow_full_payment | boolean DEFAULT true | §18 |
| allow_free_amount | boolean DEFAULT true | ➕ §18 « Montant libre autorisé » |
| enforce_installment_order | boolean DEFAULT false | ➕ §18 « Respect strict des tranches » |
| opens_at | date | ➕ §16 « date d'ouverture » |
| due_date | date | ➕ §16 « échéance » (si pas de tranches) |
| status | text | `DRAFT` \| `ACTIVE` \| `INACTIVE` |

**Règle de résolution** (la plus spécifique gagne) : `class_id` + `student_category_id` > `class_id` > `grade_level_id` + `student_category_id` > `grade_level_id` > global. Détail et algorithme dans [04-REGLES-METIER-FINANCIERES.md](04-REGLES-METIER-FINANCIERES.md).
Index unique partiel pour empêcher deux structures actives strictement identiques en cible.

## `fee_installments`

Le **modèle** de tranches d'une structure (§18).

| Colonne | Type |
|---|---|
| id | uuid PK |
| fee_structure_id | uuid FK NOT NULL |
| name | text NOT NULL — `1ère tranche` |
| amount | bigint NOT NULL |
| due_date | date NOT NULL |
| order_index | int NOT NULL |
| status | text |

`CHECK` métier (validé en service, pas en SQL) : `SUM(installments.amount) = fee_structures.amount`.

## `student_fee_assignments` (SFA)

**Ce que l'élève doit réellement.** Table centrale du domaine financier.

| Colonne | Type | Détail |
|---|---|---|
| id | uuid PK | |
| school_id | uuid FK | ➕ (facilite l'isolation et les index de reporting) |
| enrollment_id | uuid FK NOT NULL | |
| student_id | uuid FK NOT NULL | ➕ dénormalisation assumée : indispensable au reporting |
| fee_structure_id | uuid FK NOT NULL | |
| fee_type_id | uuid FK NOT NULL | ➕ dénormalisation : filtres par type de frais |
| original_amount | bigint NOT NULL | photo du tarif au moment de l'affectation |
| discount_amount | bigint NOT NULL DEFAULT 0 | somme des remises validées |
| final_amount | bigint NOT NULL | `= original_amount - discount_amount`, `CHECK (final_amount >= 0)` |
| paid_amount | bigint NOT NULL DEFAULT 0 | ➕ **cache transactionnel**, voir note |
| status | sfa_status NOT NULL | `PENDING`, `PARTIALLY_PAID`, `PAID`, `WAIVED`, `CANCELLED` |
| created_at / updated_at | timestamptz | |

`UNIQUE (enrollment_id, fee_structure_id)`.

> **Note sur `paid_amount`** : c'est un cache, mis à jour **dans la même transaction** que l'insertion de l'allocation, jamais autrement. La vérité reste `SUM(payment_allocations.amount)` sur les paiements réussis. Un job nocturne de réconciliation compare les deux et alerte en cas d'écart (test obligatoire, §10 de la vision).

## ➕ `student_fee_installments`

*Pourquoi* : l'écran P08 affiche `2e tranche — 25 000 / 60 000 — Partiellement payée`, **par élève**. Avec les seules `fee_installments` (au niveau structure), impossible de porter une remise au prorata, un échéancier négocié, ou un statut de retard individuel.

| Colonne | Type |
|---|---|
| id | uuid PK |
| student_fee_assignment_id | uuid FK NOT NULL |
| fee_installment_id | uuid FK nullable (NULL = échéance personnalisée) |
| name | text NOT NULL |
| amount | bigint NOT NULL |
| due_date | date NOT NULL |
| order_index | int NOT NULL |
| paid_amount | bigint NOT NULL DEFAULT 0 |
| status | text — `UPCOMING`, `DUE`, `PARTIALLY_PAID`, `PAID`, `OVERDUE`, `CANCELLED` |

Copiées depuis `fee_installments` à la création du SFA, montants ajustés au prorata de la remise via `distribute()` — méthode des plus forts restes, voir [04-REGLES-METIER-FINANCIERES.md](04-REGLES-METIER-FINANCIERES.md) §1 — de sorte que la somme reste exactement égale au net à payer.

## `discounts`

| Colonne | Type | Détail |
|---|---|---|
| id | uuid PK | |
| student_fee_assignment_id | uuid FK NOT NULL | |
| type | text NOT NULL | `PERCENTAGE` \| `FIXED_AMOUNT` |
| value | numeric(5,2) | pourcentage si `PERCENTAGE` |
| amount | bigint NOT NULL | montant effectif calculé, en FCFA |
| reason | text NOT NULL | §19 : motif obligatoire |
| category | text | ➕ `FRATRIE`, `BOURSE`, `PERSONNEL`, `SOCIAL`, `COMMERCIAL`, `AUTRE` |
| status | text NOT NULL | ➕ `PENDING_APPROVAL`, `APPROVED`, `REJECTED`, `CANCELLED` — §19 « éventuellement une validation » |
| approved_by / approved_at | uuid / timestamptz | |
| created_by / created_at | uuid / timestamptz | |

Seules les remises `APPROVED` alimentent `discount_amount`. Toute modification recalcule le SFA et ses `student_fee_installments`, dans la même transaction, avec journal d'audit.

---

# G. Paiements (TRANSACTION, AFFECTATION, PREUVE)

## `payments`

**Un mouvement d'argent.** Ne porte aucune notion de « quel frais » — c'est le rôle des allocations.

| Colonne | Type | Détail |
|---|---|---|
| id | uuid PK | |
| school_id | uuid FK NOT NULL | |
| reference | text NOT NULL | `CPL-260819-004923` — **UNIQUE global** |
| payer_user_id | uuid FK nullable | NULL si encaissement au guichet sans compte parent |
| payer_name | text | ➕ nom saisi au guichet |
| payer_phone | text | ➕ |
| amount | bigint NOT NULL | `CHECK (amount <> 0)` — **négatif autorisé pour les contrepassations** |
| currency | char(3) DEFAULT 'XAF' | |
| payment_method | payment_method NOT NULL | `MOBILE_MONEY`, `CASH`, `BANK_TRANSFER`, `BANK_DEPOSIT`, `CHEQUE`, `OTHER` |
| provider | text | `MTN_MOMO`, `ORANGE_MONEY`, nom de banque, NULL |
| provider_reference | text | référence opérateur `OM-39284023` |
| external_reference | text | référence saisie par le parent ou le caissier |
| status | payment_status NOT NULL | voir ci-dessous |
| status_reason | text | ➕ motif d'échec / de rejet (§46 : obligatoire au rejet) |
| channel | text | ➕ `PARENT_APP`, `CASHIER`, `BACKOFFICE`, `WEBHOOK` — utile aux statistiques |
| unallocated_amount | bigint NOT NULL DEFAULT 0 | ➕ reliquat non affecté (avance, §surpaiement) |
| reversal_of_payment_id | uuid FK → payments | ➕ contrepassation (§58) |
| initiated_at | timestamptz DEFAULT now() | |
| paid_at | timestamptz | date effective du mouvement |
| validated_at / validated_by | timestamptz / uuid FK | |
| created_by | uuid FK | ➕ caissier ou système |
| created_at / updated_at | timestamptz | |

`payment_status` (§59) : `PENDING`, `PROCESSING`, `AWAITING_VALIDATION`, `SUCCESS`, `FAILED`, `REJECTED`, `CANCELLED`, `REVERSED`, `REFUNDED`.

**Contraintes fortes :**
- `UNIQUE (provider, provider_reference) WHERE provider_reference IS NOT NULL` → protection anti-double-crédit Mobile Money.
- Aucun `DELETE` (privilège SQL retiré).
- Transitions de statut contrôlées par une machine à états dans le domaine (doc 04), pas par des `UPDATE` libres.

Index : `(school_id, status, paid_at DESC)`, `(school_id, payment_method, paid_at)`, `reference`, `(payer_user_id, paid_at DESC)`.

## `payment_allocations`

**L'imputation d'un paiement sur une dette.** C'est la table qui rend le §51 et le §52 possibles.

| Colonne | Type | Détail |
|---|---|---|
| id | uuid PK | |
| payment_id | uuid FK NOT NULL | |
| student_fee_assignment_id | uuid FK NOT NULL | |
| student_fee_installment_id | uuid FK nullable | ➕ imputation à la tranche près |
| student_id | uuid FK NOT NULL | permet le paiement multi-enfants (§52) |
| enrollment_id | uuid FK NOT NULL | |
| school_id | uuid FK NOT NULL | ➕ |
| amount | bigint NOT NULL | `CHECK (amount <> 0)`, négatif pour une contrepassation |
| created_by | uuid FK | ➕ auto ou manuel |
| is_manual | boolean DEFAULT false | ➕ affectation forcée par un comptable |
| created_at | timestamptz | |

**Invariant** : `SUM(allocations.amount) + payments.unallocated_amount = payments.amount`, vérifié par test et par le job de réconciliation.

## `external_payment_proofs`

| Colonne | Type | Détail |
|---|---|---|
| id | uuid PK | |
| payment_id | uuid FK NOT NULL | |
| file_id | uuid FK → files NOT NULL | ➕ (remplace `document_url`) |
| declared_amount | bigint NOT NULL | ➕ distinct de `payments.amount` : le comptable peut valider un montant corrigé (§46) |
| declared_date | date NOT NULL | |
| bank_name | text | |
| reference | text | |
| notes | text | |
| status | text NOT NULL | `SUBMITTED`, `UNDER_REVIEW`, `APPROVED`, `REJECTED`, `CORRECTION_REQUESTED` |
| reviewed_by / reviewed_at | uuid / timestamptz | ➕ |
| review_note | text | ➕ motif obligatoire au rejet (§46) |
| created_at | timestamptz | |

## `receipts`

| Colonne | Type | Détail |
|---|---|---|
| id | uuid PK | |
| school_id | uuid FK | |
| payment_id | uuid FK NOT NULL UNIQUE | un reçu par paiement |
| receipt_number | text NOT NULL | `CPL-RCT-2026-000184` — `UNIQUE (school_id, receipt_number)` |
| file_id | uuid FK → files | PDF généré |
| snapshot | jsonb NOT NULL | ➕ **capital** : voir note |
| issued_at | timestamptz NOT NULL | |
| issued_by | uuid FK nullable | |
| cancelled_at / cancelled_reason | | ➕ en cas de contrepassation |

> **Note sur `snapshot`** : le reçu du §28 affiche le nom de l'élève, sa classe, le total dû, le cumul payé et le solde **au moment de l'émission**. Si on recalcule ces valeurs à la réimpression, le document change — inacceptable pour une preuve. On fige donc l'intégralité du contenu en JSONB à l'émission ; le PDF n'est qu'un rendu de ce snapshot.

## ➕ `payment_provider_events`

*Pourquoi* : idempotence et traçabilité des webhooks Mobile Money (§65, étape 12). Absente du cahier, indispensable en production.

| Colonne | Type |
|---|---|
| id | uuid PK |
| provider | text NOT NULL |
| event_id | text NOT NULL — `UNIQUE (provider, event_id)` |
| payment_id | uuid FK nullable |
| event_type | text |
| signature_valid | boolean |
| raw_payload | jsonb NOT NULL |
| received_at | timestamptz |
| processed_at | timestamptz |
| processing_status | text — `PENDING`, `PROCESSED`, `IGNORED`, `ERROR` |
| processing_error | text |

## ➕ `cash_sessions` / `cash_session_movements`

*Pourquoi* : le §47 décrit un encaissement au guichet mais rien pour arrêter la caisse en fin de journée. Sans session, aucun contrôle possible entre l'espèce physique et l'espèce enregistrée.

`cash_sessions` : `id`, `school_id`, `cashier_user_id`, `opened_at`, `opening_float` (fond de caisse), `closed_at`, `declared_closing_amount`, `computed_closing_amount`, `variance`, `status` (`OPEN`/`CLOSED`/`RECONCILED`), `notes`.
`payments` reçoit ➕ `cash_session_id uuid FK nullable`.

---

# H. Notifications

## `notifications`

| Colonne | Type | Détail |
|---|---|---|
| id | uuid PK | |
| school_id | uuid FK | ➕ |
| user_id | uuid FK NOT NULL | |
| type | text NOT NULL | `PAYMENT_CONFIRMED`, `PAYMENT_REJECTED`, `INSTALLMENT_DUE_SOON`, `INSTALLMENT_OVERDUE`, `EXTERNAL_PAYMENT_VALIDATED`, `GUARDIAN_LINK_PROPOSED`, … |
| title / message | text NOT NULL | |
| data | jsonb | deep-link : `{ student_id, payment_id, screen }` |
| read_at | timestamptz | |
| created_at | timestamptz | |

Index `(user_id, read_at NULLS FIRST, created_at DESC)`.

## ➕ `notification_deliveries`

Une notification, plusieurs canaux, chacun avec son propre sort.

| Colonne | Type |
|---|---|
| id, notification_id FK, channel (`IN_APP`/`PUSH`/`SMS`/`EMAIL`/`WHATSAPP`), status (`QUEUED`/`SENT`/`DELIVERED`/`FAILED`), provider, provider_message_id, error, cost (bigint — le SMS se facture), sent_at, created_at |

## ➕ `device_tokens`

`id`, `user_id`, `token` UNIQUE, `platform` (`ANDROID`/`IOS`), `app_version`, `last_seen_at`, `revoked_at`.

## ➕ `notification_preferences`

`user_id`, `type` (ou `'*'`), `channel`, `enabled` — pour permettre au parent de couper les SMS et à l'établissement de configurer les relances (§79).

---

# I. Audit & imports

## `audit_logs`

| Colonne | Type | Détail |
|---|---|---|
| id | uuid PK | |
| school_id | uuid FK nullable | |
| user_id | uuid FK nullable | NULL = action système |
| actor_type | text | ➕ `USER`, `SYSTEM`, `WEBHOOK` |
| action | text NOT NULL | `payment.validate`, `student.create`, `discount.approve`… |
| entity_type / entity_id | text / uuid NOT NULL | |
| old_values / new_values | jsonb | uniquement les champs modifiés |
| metadata | jsonb | ➕ montant, motif, référence — pour un journal lisible sans jointure |
| ip_address | inet | |
| user_agent | text | ➕ |
| request_id | text | ➕ corrélation avec les logs applicatifs |
| created_at | timestamptz | |

Table **append-only** : privilèges `UPDATE`/`DELETE` retirés au rôle applicatif. Partitionnement mensuel prévu si le volume l'exige.

## ➕ `import_batches` / `import_rows`

*Pourquoi* : le §40 impose prévisualisation, détection d'erreurs et correction avant import. Cela suppose de persister l'état intermédiaire.

`import_batches` : `id`, `school_id`, `file_id`, `type` (`STUDENTS`/`GUARDIANS`/`FEES`), `academic_year_id`, `column_mapping` jsonb, `status` (`UPLOADED`/`MAPPED`/`VALIDATED`/`IMPORTING`/`COMPLETED`/`FAILED`), `total_rows`, `valid_rows`, `error_rows`, `imported_rows`, `created_by`, timestamps.
`import_rows` : `id`, `batch_id`, `row_number`, `raw_data` jsonb, `normalized_data` jsonb, `errors` jsonb[], `status` (`PENDING`/`VALID`/`ERROR`/`IMPORTED`/`SKIPPED`), `created_entity_id`.

---

# J. Vues de lecture

Deux vues SQL portent l'essentiel du reporting. Elles sont **la référence** : toute valeur affichée doit pouvoir en être dérivée.

## `v_enrollment_balance`

```sql
CREATE VIEW v_enrollment_balance AS
SELECT
  e.id                                AS enrollment_id,
  e.school_id,
  e.student_id,
  e.academic_year_id,
  e.class_id,
  COALESCE(SUM(sfa.original_amount), 0) AS total_gross,
  COALESCE(SUM(sfa.discount_amount), 0) AS total_discount,
  COALESCE(SUM(sfa.final_amount),    0) AS total_due,
  COALESCE(SUM(sfa.paid_amount),     0) AS total_paid,
  COALESCE(SUM(sfa.final_amount), 0)
    - COALESCE(SUM(sfa.paid_amount), 0)  AS balance
FROM enrollments e
LEFT JOIN student_fee_assignments sfa
       ON sfa.enrollment_id = e.id
      AND sfa.status <> 'CANCELLED'
GROUP BY e.id;
```

## `v_enrollment_balance_audit`

Même calcul mais **sans utiliser le cache `paid_amount`** : il repart de `payment_allocations` jointes aux `payments` en statut `SUCCESS`. Le job nocturne compare les deux vues ; tout écart déclenche une alerte. C'est le garde-fou de la règle 8 du §81.

---

# K. Récapitulatif des écarts avec le cahier

| # | Ajout | Justifié par |
|---|---|---|
| 1 | `school_settings` | §16, §28, §79 — paramétrage sans redéploiement |
| 2 | `number_sequences` | §28 — numérotation de reçus sans trou ni doublon |
| 3 | `files` | §25, §28, §35, §40 — gestion contrôlée des documents |
| 4 | `permissions`, `role_permissions` | §56 — permissions granulaires |
| 5 | `sessions`, `otp_codes` | §7, §72 — authentification et OTP |
| 6 | `idempotency_keys` | Réseau mobile instable |
| 7 | `student_categories` | §17 — tarifs par régime |
| 8 | `student_class_changes` | §30, §37 — historique de classe |
| 9 | `guardian_invite_uses` | §12 — « être journalisé » |
| 10 | `guardian_link_requests` | §10, §73 — demandes et contestations |
| 11 | `student_fee_installments` | §15 — suivi des tranches par élève |
| 12 | `payments.unallocated_amount` | Surpaiement / avance |
| 13 | `payments.reversal_of_payment_id` | §58 — contrepassation |
| 14 | `receipts.snapshot` | §28 — le reçu est une preuve figée |
| 15 | `payment_provider_events` | §65 — idempotence des webhooks |
| 16 | `cash_sessions` | §47 — arrêté de caisse |
| 17 | `notification_deliveries`, `device_tokens`, `notification_preferences` | §29, §63, §79 |
| 18 | `import_batches`, `import_rows` | §40 — prévisualisation et correction |
| 19 | Vues de solde | §81 règle 8 |
