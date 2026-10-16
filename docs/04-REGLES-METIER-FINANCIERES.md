# 04 — Règles métier financières

Ce document décrit le **cœur algorithmique de CSB Noutcha KAMGUE**. Tout ce qui est ici s'implémente dans `packages/domain` sous forme de **fonctions pures**, sans accès base de données, couvertes à 100 % par des tests unitaires. Les services de `apps/api` se contentent de charger les données, d'appeler ces fonctions, et d'écrire le résultat dans une transaction.

Règle de base : **aucune décision financière ne se prend dans un contrôleur HTTP, dans une requête SQL, ni dans un composant React.**

---

## 1. Arithmétique

Le franc CFA (XAF) n'a pas de sous-unité. Tous les montants sont des **entiers**.

```ts
type Amount = number & { readonly __brand: 'XAF' };

// Interdits : +, -, *, / directs sur des montants dans le code métier.
add(a, b)                 // vérifie l'absence de dépassement
sub(a, b)                 // interdit de descendre sous 0 hors contexte de contrepassation
percentOf(amount, pct)    // Math.floor — l'arrondi se fait TOUJOURS en faveur du payeur
distribute(total, weights)// répartition sans perte, méthode des plus forts restes
```

**`distribute` est la fonction la plus délicate du projet.** Elle sert au prorata d'une remise sur les tranches, et à la ventilation d'un paiement.

**Méthode retenue : les plus forts restes (Hamilton).** Chaque part reçoit d'abord sa valeur entière par défaut, puis les francs restants sont attribués aux parts dont la fraction perdue était la plus grande. À égalité, l'indice le plus petit l'emporte — le résultat est ainsi déterministe et reproductible.

*Pourquoi pas « tout le reliquat sur la dernière part »* : sur trois tranches égales, cela alourdirait systématiquement la tranche 3, et le parent verrait une dernière échéance plus chère sans explication. Les plus forts restes collent au plus près de la proportion réelle.

Contrat :

```
distribute(100_000, [3, 2])                   === [60_000, 40_000]
distribute(100_000, [1, 1, 1])                === [33_334, 33_333, 33_333]
distribute(155_000, [75_000, 60_000, 40_000]) === [66_429, 53_143, 35_428]
∀ entrées : sum(distribute(t, w)) === t
```

Test de propriété obligatoire (fast-check) : pour 10 000 tirages aléatoires, la somme des parts est exactement égale au total. *Implémenté et vert — `packages/domain/src/money/distribute.test.ts`.*

---

## 2. De la structure tarifaire à la dette de l'élève

### 2.1 Résolution du tarif applicable

Quand un élève est inscrit (`enrollment` créée), CSB Noutcha KAMGUE détermine les frais qui le concernent. Pour chaque `fee_type` actif de l'année :

1. Chercher les `fee_structures` `ACTIVE` de l'année, du type de frais, dont la cible correspond à l'élève.
2. Une structure correspond si, pour chacun de `class_id`, `grade_level_id`, `student_category_id` : soit la colonne est `NULL` (= s'applique à tous), soit elle est égale à la valeur de l'inscription.
3. En cas de correspondances multiples, **la plus spécifique gagne**, selon un score :

| Critère renseigné | Poids |
|---|---|
| `class_id` | 4 |
| `student_category_id` | 2 |
| `grade_level_id` | 1 |

Score = somme des poids des critères renseignés. La structure au score le plus élevé l'emporte. **Égalité de score = erreur de configuration** : on refuse l'affectation et on remonte une alerte à la comptabilité plutôt que de choisir au hasard.

4. Les structures dont `is_mandatory = false` (transport, cantine) ne sont **pas** affectées automatiquement ; elles sont proposées à la scolarité lors de l'inscription.

### 2.2 Création des `student_fee_assignments`

Pour chaque structure retenue :

```
original_amount  = fee_structure.amount        ← photo figée
discount_amount  = 0
final_amount     = original_amount
paid_amount      = 0
status           = PENDING
```

Puis copie des tranches : chaque `fee_installment` de la structure devient un `student_fee_installment`.

> **Invariant fondamental** : une fois le SFA créé, changer `fee_structures.amount` **n'a aucun effet** sur les élèves déjà affectés. Pour répercuter un changement de tarif, la comptabilité déclenche une action explicite « recalculer les affectations », qui journalise chaque modification et refuse de baisser un `final_amount` en dessous du `paid_amount`.

### 2.3 Application d'une remise (§19)

```
1. Créer la ligne discounts (status = PENDING_APPROVAL ou APPROVED selon le montant/rôle)
2. Si APPROVED :
     discount_amount = SUM(discounts APPROVED du SFA)
     final_amount    = original_amount - discount_amount
     CHECK final_amount >= paid_amount   ← sinon refus (on créerait un trop-perçu artificiel)
3. Recalculer les student_fee_installments :
     nouveaux montants = distribute(final_amount, [montants d'origine des tranches])
     CHECK chaque tranche : nouveau montant >= paid_amount de la tranche
4. Recalculer les statuts
5. Journal d'audit : discount.approve, avec ancien/nouveau final_amount
```

Remise en pourcentage : `amount = percentOf(original_amount, value)` — arrondi au franc inférieur, en faveur du payeur.

**Seuil d'approbation** (paramétrable) : au-delà d'un montant ou d'un pourcentage défini dans `school_settings`, la remise reste en `PENDING_APPROVAL` jusqu'à validation par la direction (§56 : « approuver certaines opérations sensibles »).

---

## 3. Le paiement

### 3.1 Machine à états (§59)

```text
                    ┌─────────────┐
                    │   PENDING   │  transaction créée, rien n'est parti
                    └──────┬──────┘
             ┌─────────────┼──────────────────┐
             ▼             ▼                  ▼
      ┌────────────┐ ┌──────────────────┐ ┌───────────┐
      │ PROCESSING │ │AWAITING_VALIDATION│ │ CANCELLED │
      │ (Mobile    │ │ (paiement externe │ │ (abandon  │
      │  Money en  │ │  déclaré par le   │ │  parent)  │
      │  cours)    │ │  parent)          │ └───────────┘
      └─────┬──────┘ └────────┬──────────┘
            │                 │
      ┌─────┴─────┐    ┌──────┴───────┐
      ▼           ▼    ▼              ▼
 ┌─────────┐ ┌────────┐         ┌──────────┐
 │ SUCCESS │ │ FAILED │         │ REJECTED │
 └────┬────┘ └────────┘         └──────────┘
      │
      ├──────────────► REVERSED   (contrepassation — erreur d'encaissement)
      └──────────────► REFUNDED   (remboursement effectif — hors périmètre V1)
```

**Transitions autorisées, et rien d'autre :**

| Depuis | Vers | Déclencheur |
|---|---|---|
| — | `PENDING` | création (tous canaux) |
| `PENDING` | `PROCESSING` | requête envoyée à l'opérateur MoMo |
| `PENDING` | `AWAITING_VALIDATION` | déclaration de paiement externe |
| `PENDING` | `SUCCESS` | encaissement guichet (immédiat) |
| `PENDING` | `CANCELLED` | annulation par le parent, ou expiration (TTL 15 min) |
| `PROCESSING` | `SUCCESS` \| `FAILED` | webhook ou polling opérateur |
| `PROCESSING` | `CANCELLED` | timeout de 15 min + confirmation opérateur d'absence de débit |
| `AWAITING_VALIDATION` | `SUCCESS` \| `REJECTED` | décision du comptable |
| `SUCCESS` | `REVERSED` | contrepassation validée |

Toute autre transition lève une erreur de domaine. Implémentée par une table de transitions dans `packages/domain/payments/state-machine.ts`, testée exhaustivement (état × événement).

**`SUCCESS` est un état terminal en écriture** : aucune modification de `amount`, `payment_method`, `paid_at` n'est possible après. La seule correction est la contrepassation.

### 3.2 Effets du passage à `SUCCESS`

Ils forment **une seule transaction PostgreSQL**. Si une étape échoue, tout est annulé.

```text
BEGIN
  SELECT ... FROM enrollments WHERE id = ? FOR UPDATE      ← verrou anti-concurrence
  1. payments.status = SUCCESS, paid_at, validated_at
  2. calculer les allocations (§4)
  3. INSERT payment_allocations
  4. UPDATE student_fee_assignments.paid_amount (+= )
  5. UPDATE student_fee_installments.paid_amount (+= )
  6. recalculer les statuts des SFA et des tranches
  7. payments.unallocated_amount = amount - SUM(allocations)
  8. allouer un numéro de reçu (number_sequences)
  9. INSERT receipts (avec snapshot figé)
 10. INSERT audit_logs
COMMIT

→ hors transaction, en asynchrone (BullMQ) :
 11. génération du PDF du reçu
 12. notification au(x) responsable(s)
```

Le verrou `FOR UPDATE` sur l'inscription est **obligatoire** : sans lui, deux paiements simultanés sur le même élève (le père au guichet, la mère sur l'app) lisent le même `paid_amount` et produisent un solde faux.

---

## 4. L'affectation (le moteur d'allocation)

C'est la réponse à la 6e dimension du §87 : *à quelle dette ce paiement correspond-il ?*

### 4.1 Mode automatique — cascade `BY_PRIORITY_THEN_DUE_DATE`

Entrée : un montant `M`, la liste des SFA de l'inscription avec leur reste à payer et leurs tranches.

```text
1. Construire la liste des cibles ouvertes (reste > 0) :
     une cible = (SFA, tranche) ou (SFA, sans tranche)

2. Trier :
     a) fee_types.priority croissant     ← l'inscription avant la pension, etc.
     b) due_date croissante              ← la plus ancienne échéance d'abord
     c) fee_structures.name              ← départage déterministe

3. Pour chaque cible, tant que M > 0 :
     part = min(M, reste_de_la_cible)
     si la structure interdit le paiement partiel (allow_partial_payment = false)
        et part < reste_de_la_cible :
            → passer à la cible suivante (on ne paie pas à moitié un frais indivisible)
     si enforce_installment_order = true
        et une tranche antérieure de ce SFA reste ouverte :
            → passer à la cible suivante
     créer une allocation de `part`
     M -= part

4. Si M > 0 à la fin :
     si school_settings.allow_overpayment :
        payments.unallocated_amount = M      ← avance disponible
     sinon :
        refuser le paiement avant même de le créer (contrôle en amont, écran P09)
```

Ordre de priorité par défaut des `fee_types` (paramétrable) :

| Priorité | Type de frais |
|---|---|
| 10 | Inscription / Réinscription |
| 20 | Pension |
| 30 | APE, Assurance |
| 40 | Informatique, Bibliothèque, Examen |
| 50 | Uniforme, Transport, Cantine, Activité |
| 90 | Frais exceptionnel, Autres |

### 4.2 Mode dirigé

Le parent (P09) ou le caissier (C06) peut choisir explicitement le frais ou la tranche visée. L'API accepte alors un tableau `allocations: [{ student_fee_assignment_id, installment_id?, amount }]`.

Validations : la somme des allocations demandées est ≤ au montant du paiement ; chaque cible appartient bien à l'élève ; aucune allocation ne dépasse le reste dû de sa cible ; le reliquat suit la règle du surpaiement.

### 4.3 Réaffectation d'une avance

L'`unallocated_amount` d'un paiement `SUCCESS` est réaffectable ultérieurement (par exemple quand la tranche 2 s'ouvre) :

```text
allouer(payment, cibles) :
  CHECK payment.status = SUCCESS
  CHECK SUM(nouvelles allocations) <= payment.unallocated_amount
  INSERT allocations ; UPDATE paid_amount ; unallocated_amount -=
  audit : payment.reallocate
```

Cette opération ne crée **jamais** de nouveau paiement, et ne modifie ni le montant ni le reçu d'origine. Un reçu complémentaire d'affectation peut être émis (facultatif V1).

### 4.4 Statuts dérivés

```
SFA / tranche :
  paid_amount = 0                     → PENDING / UPCOMING
  0 < paid_amount < montant           → PARTIALLY_PAID
  paid_amount >= montant              → PAID
  due_date < aujourd'hui et non payé  → OVERDUE
  final_amount = 0 (remise totale)    → WAIVED
```

Les statuts `DUE` / `OVERDUE` dépendent de la date : ils sont **calculés à la lecture**, et rafraîchis en base par un job quotidien uniquement pour permettre le filtrage SQL des états financiers (§48).

---

## 5. Le solde

### 5.1 Définition unique

```
solde_inscription = Σ(SFA.final_amount)  −  Σ(allocations.amount des paiements SUCCESS)
```

Il n'existe **aucune autre définition** dans le produit. Le mobile, le web, les exports, les PDF et les dashboards consomment tous la même vue `v_enrollment_balance`.

### 5.2 Deux chemins, une vérité

| Chemin | Source | Usage |
|---|---|---|
| **Rapide** | `student_fee_assignments.paid_amount` (cache maintenu en transaction) | Affichage, listes, dashboards |
| **Audit** | recalcul depuis `payment_allocations` ⋈ `payments SUCCESS` | Job de réconciliation, tests |

Le job nocturne compare les deux pour toutes les inscriptions actives. Tout écart : alerte immédiate + ligne dans un rapport de réconciliation. **Un écart est un bug, jamais une donnée à corriger silencieusement.**

### 5.3 Progression (§15)

```
progression = floor(total_paid × 100 / total_due)      // total_due > 0
total_due = 0 → progression = 100 %, libellé « Scolarité réglée »
```

---

## 6. Contrepassation (§58)

Une transaction validée n'est jamais supprimée ni modifiée. Pour corriger une erreur (montant erroné, mauvais élève, chèque impayé) :

```text
1. Créer un NOUVEAU payment :
     amount                  = −(montant du paiement d'origine)
     reversal_of_payment_id  = paiement d'origine
     payment_method          = identique
     status                  = SUCCESS
     status_reason           = motif OBLIGATOIRE
     channel                 = BACKOFFICE
2. Créer les allocations MIROIR, négatives, sur les mêmes cibles
3. paid_amount des SFA et tranches diminué d'autant
4. Paiement d'origine : status = REVERSED (son montant reste inchangé)
5. Reçu d'origine : cancelled_at renseigné ; émission d'un avoir
6. Audit : payment.reverse, avec motif, auteur, montant
7. Notification au parent
```

**Résultat** : le solde redevient exact par simple somme, sans qu'aucune ligne historique n'ait été altérée. Les deux mouvements restent visibles dans l'historique du parent et de l'établissement.

Contrepassation partielle : autorisée, avec un montant négatif inférieur en valeur absolue, en précisant les allocations visées.

Permission requise : `payments.reverse` — réservée au comptable, avec approbation direction au-delà d'un seuil.

---

## 7. Concurrence et double paiement

| Risque | Parade |
|---|---|
| Double-tap sur « Payer » dans l'app | Header `Idempotency-Key` obligatoire sur `POST /payments` ; la même clé renvoie la première réponse |
| Webhook opérateur livré deux fois | `UNIQUE (provider, event_id)` sur `payment_provider_events` + `UNIQUE (provider, provider_reference)` sur `payments` |
| Webhook et polling arrivent en même temps | Verrou `SELECT … FOR UPDATE` sur le paiement + relecture du statut ; si déjà `SUCCESS`, sortie sans effet |
| Père et mère paient simultanément | Verrou `FOR UPDATE` sur l'inscription pendant l'allocation |
| Deux caissiers encaissent pour le même élève | idem |
| Surpaiement dû à la latence | Contrôle du reste dû **au moment du COMMIT**, pas au moment de l'affichage ; le reliquat bascule en avance plutôt que d'échouer |

Toutes les opérations d'affectation sont exécutées en isolation `READ COMMITTED` avec verrou explicite ; pas de `SERIALIZABLE` (coûteux et sujet aux erreurs de sérialisation en pic de rentrée).

---

## 8. Le reçu (§28)

### 8.1 Quand

Un reçu est émis **uniquement** au passage à `SUCCESS`, dans la même transaction que l'allocation. Jamais avant. Jamais pour un paiement `AWAITING_VALIDATION`.

### 8.2 Numérotation

Format paramétrable, par défaut `CPL-RCT-{ANNEE}-{SEQ:6}` → `CPL-RCT-2026-000184`.
Séquence allouée par `number_sequences` (scope `RECEIPT`, period = année civile), dans la transaction. Séquentielle, sans trou, unique par établissement.

> Si la transaction échoue après allocation du numéro, le rollback restitue la séquence — c'est précisément pourquoi on n'utilise pas de `SEQUENCE` PostgreSQL, qui, elle, ne revient pas en arrière.

### 8.3 Contenu figé (`snapshot`)

```jsonc
{
  "school":  { "name": "CSB Noutcha KAMGUE", "address": "...", "logo_file_id": "..." },
  "receipt": { "number": "CPL-RCT-2026-000184", "issued_at": "2026-08-19T09:12:00Z" },
  "student": { "full_name": "Nathan Fotso", "student_number": "CPLAN-00342",
               "class": "6e A", "academic_year": "2026/2027" },
  "payment": { "reference": "CPL-260819-004923", "amount": 50000,
               "method": "MOBILE_MONEY", "provider": "ORANGE_MONEY",
               "provider_reference": "OM-39284023", "paid_at": "2026-08-19T09:11:45Z" },
  "allocations": [ { "label": "Pension scolaire — 2e tranche", "amount": 50000 } ],
  "balance_after": { "total_due": 200000, "total_paid": 175000, "balance": 25000 },
  "issued_by": { "name": "Marie Ngo", "role": "CASHIER" }
}
```

Le PDF n'est qu'un rendu de ce JSON. **Réimprimer un reçu de 2026 en 2029 doit produire exactement le même document**, même si l'élève a changé de classe, si la remise a évolué, ou si l'établissement a changé de logo.

### 8.4 Cycle de vie

Un reçu ne se supprime pas. Contrepassation ⇒ `cancelled_at` + `cancelled_reason`, et le PDF réimprimé porte un filigrane « ANNULÉ ». Un avoir portant son propre numéro est émis.

---

## 9. Les trois parcours de paiement, comparés

| | Mobile Money (§65) | Externe (§66) | Guichet (§67) |
|---|---|---|---|
| Initiateur | Parent | Parent | Caissier |
| Statut initial | `PENDING` → `PROCESSING` | `AWAITING_VALIDATION` | `PENDING` |
| Preuve | Confirmation opérateur | Justificatif + validation humaine | Présence physique |
| Passage à `SUCCESS` | Webhook / polling vérifié | Validation comptable | Immédiat |
| Délai | Secondes | Heures / jours | Immédiat |
| Reçu | Automatique | À la validation | Imprimé sur place |
| Risque principal | Double crédit | Faux justificatif | Écart de caisse |
| Parade | Idempotence | Contrôle humain + montant validé ≠ montant déclaré | `cash_sessions` + arrêté |

**Le seul point commun est aussi le point essentiel** : les trois convergent vers la même transaction `SUCCESS`, les mêmes allocations, le même moteur de solde, le même format de reçu. Aucune logique de solde n'est dupliquée par canal.

---

## 10. Passage à l'année suivante (§68)

```text
1. Créer academic_year 2027/2028 (status = DRAFT)
2. Copier les grade_levels si nécessaire
3. Copier les classes (nouvelles lignes, nouveau academic_year_id)
4. Copier les fee_structures  ← « Dupliquer pour l'année suivante » (§42)
     · montants ajustables avant activation
     · les tranches sont copiées avec des due_date décalées d'un an
5. Sélectionner les élèves à réinscrire (filtres : classe, statut, situation financière)
6. Pour chaque élève : nouvelle enrollment (type = RE_ENROLLMENT)
7. Créer les student_fee_assignments de la nouvelle année
8. Activer l'année (is_current bascule)
```

**Invariant** : rien de l'année 2026/2027 n'est modifié. Les paiements, les SFA, les reçus et les soldes de l'ancien exercice restent intacts et consultables. Un élève peut donc avoir un solde débiteur en 2026/2027 **et** une nouvelle dette en 2027/2028 : ce sont deux inscriptions distinctes, deux soldes distincts.

Décision à trancher avec le client : le report d'un solde débiteur sur l'année suivante. **Recommandation** : ne pas reporter automatiquement. Créer si besoin un frais `RELIQUAT_ANNEE_PRECEDENTE` sur la nouvelle inscription, avec une action explicite et auditée. Un report implicite rendrait les états financiers par exercice inexploitables.

---

## 11. Checklist de contrôle financier

À exécuter en CI et par le job nocturne :

- [ ] `∀ payment` : `SUM(allocations) + unallocated_amount = amount`
- [ ] `∀ SFA` : `paid_amount = SUM(allocations des payments SUCCESS)`
- [ ] `∀ SFA` : `final_amount = original_amount − discount_amount` et `final_amount ≥ 0`
- [ ] `∀ SFA` : `paid_amount ≤ final_amount` sauf si une avance a été délibérément imputée
- [ ] `∀ SFA` : `SUM(student_fee_installments.amount) = final_amount`
- [ ] `∀ payment SUCCESS` : exactement un `receipt` non annulé
- [ ] `∀ receipt` : `receipt_number` unique par école, séquence sans trou
- [ ] `∀ payment REVERSED` : il existe un paiement de contrepassation de montant opposé
- [ ] Aucun `payment` en `PROCESSING` depuis plus de 24 h
- [ ] `v_enrollment_balance` ≡ `v_enrollment_balance_audit`, pour toutes les inscriptions
