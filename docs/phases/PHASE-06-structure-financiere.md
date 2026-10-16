# PHASE 06 — Structure financière

**Durée estimée** : 2,5 semaines · **Pré-requis** : P03 (P05 recommandé) · **Réf. cahier** : §16, §17, §18, §19, §42, §43, §50, §61

---

## 1. Objectif

Implanter la **dimension OBLIGATION** (§87) : *que doit payer cet élève ?*

Cette phase répond à la moitié de la question centrale du produit. Sans elle, un paiement ne peut s'imputer sur rien. Elle est aussi la plus riche en règles de configuration — et la plus exposée au risque de sur-conception.

**Ce qu'il faut garder en tête** : la dette d'un élève (`student_fee_assignments`) est une **photo figée**, pas une vue sur le tarif courant. Cette distinction est la raison d'être de la phase.

---

## 2. Périmètre

### Inclus
- `fee_types`, `fee_structures`, `fee_installments`
- `student_fee_assignments`, `student_fee_installments`, `discounts`
- Moteur de résolution du tarif applicable
- Moteur d'affectation des frais à une inscription
- Application des remises et recalcul au prorata
- Duplication des structures vers l'année suivante
- Écrans C02 (liste des frais), C03 (création d'une structure), gestion des tranches
- Onglet Finances de la fiche élève (S07) — le §50
- Le volet tarifaire de l'assistant « Nouvelle année » (étape 4 du §68)

### Exclu
- Tout paiement (Phase 07) — le solde affiché est donc `total_due` avec `total_paid = 0`
- Les états financiers par classe (Phase 14)

---

## 3. Modèle de données

Détail complet en [../03-MODELE-DONNEES.md](../03-MODELE-DONNEES.md) section F. Algorithmes en [../04-REGLES-METIER-FINANCIERES.md](../04-REGLES-METIER-FINANCIERES.md) sections 2 et 4.

### La chaîne à quatre niveaux

```text
fee_types            « Pension scolaire »        ← le QUOI, stable dans le temps
      │
fee_structures       « Pension 6e 2026/2027 : 175 000 »   ← le COMBIEN, par population/année
      │
fee_installments     « T1 75 000 au 30/09 · T2 60 000 au 15/01 · T3 40 000 au 31/03 »
      │
      ▼  affectation à un élève
student_fee_assignments   « Nathan doit 175 000, remise 20 000, net 155 000 »  ← FIGÉ
      │
student_fee_installments  « T1 66 429 · T2 53 143 · T3 35 428 »   ← prorata de la remise
```

Les deux niveaux du haut sont de la **configuration** ; les deux du bas sont des **faits**. Modifier la configuration ne modifie jamais les faits déjà établis.

---

## 4. Types de frais (§16)

Seed initial, avec les priorités d'affectation (voir doc 04 §4.1) :

| Code | Nom | Priorité | Obligatoire |
|---|---|---|---|
| `INSCRIPTION` | Frais d'inscription | 10 | oui |
| `REINSCRIPTION` | Frais de réinscription | 10 | oui |
| `PENSION` | Pension scolaire | 20 | oui |
| `APE` | Cotisation APE | 30 | oui |
| `ASSURANCE` | Assurance scolaire | 30 | oui |
| `INFORMATIQUE` | Frais informatiques | 40 | oui |
| `BIBLIOTHEQUE` | Bibliothèque | 40 | oui |
| `EXAMEN` | Frais d'examen | 40 | non |
| `UNIFORME` | Uniforme | 50 | non |
| `TRANSPORT` | Transport scolaire | 50 | non |
| `CANTINE` | Cantine | 50 | non |
| `ACTIVITE` | Activités | 50 | non |
| `EXCEPTIONNEL` | Frais exceptionnel | 90 | non |
| `AUTRE` | Autres | 90 | non |
| `RELIQUAT` | Reliquat année précédente | 5 | non |

`RELIQUAT` est un ajout : il matérialise le report explicite d'un solde débiteur (Phase 05, §4.2). Sa priorité 5 le place **avant tout le reste** dans la cascade d'affectation — une dette ancienne se solde en premier.

La priorité est modifiable par l'établissement, ce qui change l'ordre d'imputation automatique des paiements. À manipuler avec précaution, et c'est audité.

---

## 5. Structures tarifaires (§17)

### 5.1 Ciblage

Une structure vise une population par combinaison de trois critères, tous facultatifs :

```text
grade_level_id      NULL = tous les niveaux
class_id            NULL = toutes les classes
student_category_id NULL = tous les régimes
```

Exemples de configuration réelle :

| Structure | Niveau | Classe | Régime | Montant |
|---|---|---|---|---|
| Pension 6e | 6e | — | — | 175 000 |
| Pension 6e internes | 6e | — | Interne | 450 000 |
| Pension Terminale | Terminale | — | — | 250 000 |
| APE (tous) | — | — | — | 10 000 |
| Informatique 6e C (classe pilote) | 6e | 6e C | — | 25 000 |

### 5.2 Résolution — la plus spécifique gagne

Score de spécificité : `class_id` = 4, `student_category_id` = 2, `grade_level_id` = 1.

Pour un élève de 6e C, régime Interne, sur le type `PENSION` : « Pension 6e internes » (score 3) l'emporte sur « Pension 6e » (score 1).

**Égalité de score entre deux structures applicables = erreur de configuration.** L'affectation est refusée et une alerte remonte à la comptabilité. Choisir arbitrairement produirait une facturation aléatoire, impossible à expliquer à un parent.

### 5.3 Paramètres (§18)

| Paramètre | Effet |
|---|---|
| `allow_partial_payment` | Si `false`, ce frais ne peut être réglé qu'en totalité |
| `allow_full_payment` | Si `false`, seul le paiement par tranches est accepté |
| `allow_free_amount` | Si `false`, le parent ne peut saisir qu'un montant correspondant à une tranche |
| `enforce_installment_order` | Si `true`, la tranche 2 ne peut être réglée avant la tranche 1 |
| `is_mandatory` | Si `false`, le frais n'est pas affecté automatiquement ; il est proposé à l'inscription |
| `opens_at` | Le frais n'est ni affichable ni payable avant cette date |
| `due_date` | Échéance globale, si le frais n'a pas de tranches |

Ces paramètres sont **consommés par le moteur d'allocation de la Phase 07**. Ils doivent donc être exacts dès maintenant, même s'ils n'ont pas encore d'effet visible.

### 5.4 Tranches (§18)

```text
Pension 6e — 175 000 FCFA
   T1  75 000   30/09/2026
   T2  60 000   15/01/2027
   T3  40 000   31/03/2027
   ─────────────
       175 000  ✓ correspond au montant de la structure
```

Contrôle bloquant : la somme des tranches est **exactement** égale au montant de la structure. Un écart d'un franc rendrait tout solde faux. L'interface affiche l'écart en direct et empêche l'enregistrement.

Assistant de découpage : « diviser en N tranches égales » (reliquat sur la dernière), avec dates suggérées à intervalle régulier.

---

## 6. Affectation des frais à l'élève

### 6.1 Déclenchement

| Événement | Comportement |
|---|---|
| Création d'une inscription | Affectation automatique de tous les frais obligatoires applicables |
| Réinscription | Idem, pour la nouvelle année |
| Import en masse | Idem, dans le même job |
| Création d'une nouvelle structure obligatoire en cours d'année | **Pas d'affectation rétroactive automatique.** Action explicite « Affecter aux élèves concernés », avec prévisualisation du nombre d'élèves et du montant total |
| Ajout d'un frais optionnel (transport) | Action manuelle sur la fiche élève |

Le quatrième point est délibéré : une affectation rétroactive automatique créerait de la dette sur des centaines d'élèves sans que personne ne l'ait décidé.

### 6.2 Ce qui est figé

```
original_amount = fee_structure.amount    ← copie, pas référence
```

Changer `fee_structures.amount` après coup n'affecte **aucun** élève déjà affecté. Pour répercuter :

```
POST /api/v1/fee-structures/:id/recalculate-assignments
   → prévisualisation : N élèves, ancien montant, nouveau montant, écart total
   → refus pour tout élève dont paid_amount > nouveau final_amount
   → exécution : mise à jour + recalcul des tranches + audit ligne à ligne
```

### 6.3 Prorata des tranches

Quand une remise réduit le net à payer, les tranches sont recalculées avec `distribute()` (doc 04 §1), qui garantit que la somme reste exacte :

```
Pension 175 000 → remise 20 000 → net 155 000
T1 75 000 → 66 429
T2 60 000 → 53 143
T3 40 000 → 35 428
           ────────
            155 000  ✓
```

Contrôle : aucune tranche ne peut passer sous son `paid_amount` déjà réglé.

---

## 7. Remises, bourses, réductions (§19)

### 7.1 Portées

Le cahier demande d'appliquer une remise à un élève, une famille, une catégorie d'élèves ou un type de frais. En base, une remise porte **toujours** sur un `student_fee_assignment` — c'est le seul niveau où un montant a un sens. Les autres portées sont des **actions d'application en lot** qui créent N remises unitaires.

| Portée demandée | Implémentation |
|---|---|
| Un élève | 1 remise sur un SFA (ou sur tous ses SFA) |
| Une famille (fratrie) | Application en lot sur les SFA des élèves partageant un `guardian` |
| Une catégorie d'élèves | Application en lot filtrée par `student_category_id` |
| Un type de frais | Application en lot filtrée par `fee_type_id` |

*Pourquoi ce choix* : une remise « au niveau famille » stockée telle quelle deviendrait ingérable dès qu'un enfant change d'établissement, obtient une bourse supplémentaire, ou que la fratrie évolue. Des remises unitaires restent traçables, révocables et auditables individuellement.

### 7.2 Champs obligatoires

Motif (texte libre, obligatoire), catégorie (`FRATRIE`, `BOURSE`, `PERSONNEL`, `SOCIAL`, `COMMERCIAL`, `AUTRE`), auteur, date. Approbation selon le seuil défini dans `school_settings` :

```text
montant ou % ≤ seuil  → APPROVED immédiatement par le comptable
montant ou % > seuil  → PENDING_APPROVAL → direction
```

Seules les remises `APPROVED` réduisent `final_amount`. Une remise `PENDING_APPROVAL` est visible sur la fiche mais n'a aucun effet financier.

### 7.3 Contrôles

- `final_amount ≥ 0`
- `final_amount ≥ paid_amount` — sinon refus : on créerait un trop-perçu artificiel
- L'annulation d'une remise recalcule tout, et est auditée
- Une remise de 100 % passe le SFA en statut `WAIVED`

---

## 8. API

```
GET    /api/v1/fee-types
POST   /api/v1/fee-types
PATCH  /api/v1/fee-types/:id
POST   /api/v1/fee-types/:id/deactivate
POST   /api/v1/fee-types/reorder-priority

GET    /api/v1/fee-structures?academic_year_id=&grade_level_id=&fee_type_id=&status=
POST   /api/v1/fee-structures
PATCH  /api/v1/fee-structures/:id
POST   /api/v1/fee-structures/:id/activate
POST   /api/v1/fee-structures/:id/deactivate
POST   /api/v1/fee-structures/:id/duplicate           # vers une autre année (§42)
POST   /api/v1/fee-structures/duplicate-year          # duplication en masse (§68 étape 4)
POST   /api/v1/fee-structures/:id/recalculate-assignments
GET    /api/v1/fee-structures/:id/impact              # combien d'élèves, quel montant total

PUT    /api/v1/fee-structures/:id/installments        # remplace le jeu de tranches
GET    /api/v1/fee-structures/:id/installments

GET    /api/v1/enrollments/:id/fees                   # le §50 : situation financière
POST   /api/v1/enrollments/:id/fees/assign            # affectation auto (idempotente)
POST   /api/v1/enrollments/:id/fees                   # ajout manuel d'un frais optionnel
DELETE /api/v1/student-fee-assignments/:id            # refusé si paid_amount > 0
POST   /api/v1/student-fee-assignments/:id/waive

GET    /api/v1/discounts?student_id=&status=&category=
POST   /api/v1/discounts
POST   /api/v1/discounts/bulk                         # application en lot
POST   /api/v1/discounts/:id/approve
POST   /api/v1/discounts/:id/reject
POST   /api/v1/discounts/:id/cancel

GET    /api/v1/simulate-fees?class_id=&student_category_id=   # simulation avant inscription
```

---

## 9. Interfaces

### C02 — Liste des frais

Vue par année, groupée par type de frais :

```text
Année 2026/2027                            [+ Créer un frais] [Dupliquer l'année]

INSCRIPTION                                                 3 structures · 1 243 élèves
   6e → Terminale         25 000        Actif    [⋯]

PENSION                                                     8 structures · 1 243 élèves
   6e                    175 000        Actif    3 tranches   [⋯]
   6e · Interne          450 000        Actif    3 tranches   [⋯]
   5e                    180 000        Actif    3 tranches   [⋯]
   Terminale             250 000        Actif    3 tranches   [⋯]

APE                                                         1 structure · 1 243 élèves
   Tous niveaux           10 000        Actif    [⋯]
────────────────────────────────────────────────────────────────────
Total attendu pour l'année : 245 600 000 FCFA
```

Actions du §42 : créer, modifier, désactiver, dupliquer pour l'année suivante.

**Détecteur de conflits** : un bandeau d'alerte apparaît si deux structures actives du même type ciblent la même population avec un score de spécificité identique — la seule situation où le moteur refuserait d'affecter.

### C03 — Création d'une structure

```text
┌──────────────────────────────────────────────────────┐
│ Nouvelle structure tarifaire                         │
├──────────────────────────────────────────────────────┤
│ Année scolaire  [2026/2027 ▾]                        │
│ Type de frais   [Pension scolaire ▾]                 │
│ Nom             [Pension 6e                       ]  │
│ Montant         [        175 000] FCFA               │
│                                                      │
│ CIBLAGE                                              │
│ Niveau          [6e ▾]        (vide = tous)          │
│ Classe          [Toutes ▾]                           │
│ Régime          [Tous ▾]                             │
│ → S'appliquera à 156 élèves · 27 300 000 FCFA        │← calculé en direct
│                                                      │
│ PARAMÈTRES DE PAIEMENT                               │
│ ☑ Paiement partiel autorisé                          │
│ ☑ Paiement intégral autorisé                         │
│ ☑ Montant libre autorisé                             │
│ ☐ Respect strict de l'ordre des tranches             │
│ ☑ Frais obligatoire                                  │
│ Ouverture [01/09/2026]  Échéance [        ]          │
│                                                      │
│ TRANCHES                                 [Assistant] │
│ 1ère tranche   [ 75 000]  [30/09/2026]  [×]          │
│ 2e tranche     [ 60 000]  [15/01/2027]  [×]          │
│ 3e tranche     [ 40 000]  [31/03/2027]  [×]          │
│ [+ Ajouter]                    Total : 175 000 ✓     │
│                                                      │
│                          [Annuler] [Enregistrer]     │
└──────────────────────────────────────────────────────┘
```

Le calcul d'impact en direct (« 156 élèves · 27 300 000 FCFA ») est la fonctionnalité qui évite les erreurs de ciblage. Le total des tranches affiche `✓` ou l'écart en rouge.

### S07 — onglet Finances (§50)

```text
Année 2026/2027                                    [Ajouter un frais] [Remise]

  Frais d'inscription        25 000              — remise    25 000    Payé ✓
  Pension scolaire          175 000        −20 000 remise   155 000    Partiel
     T1  30/09    66 429                                    Payé ✓
     T2  15/01    53 143                                    25 000 / 53 143
     T3  31/03    35 428                                    À venir
  Cotisation APE             10 000              — remise    10 000    Non payé
─────────────────────────────────────────────────────────────────────────────
  Total brut                210 000
  Remises                  − 20 000     (Remise fratrie · Marie Ngo · 12/09)
  TOTAL DÛ                  190 000
  Payé                      125 000
  SOLDE                      65 000
```

Exactement la structure du §50, complétée par le détail des tranches du §15. À ce stade, `Payé` vaut 0 partout — la Phase 07 l'alimente.

### Écran des remises

Liste filtrable, avec file d'attente d'approbation pour la direction. Formulaire : élève, frais concernés (multi-sélection), type (% ou montant fixe), valeur, motif, catégorie. Aperçu du nouveau net à payer avant validation.

---

## 10. Règles métier

1. `SUM(fee_installments.amount) = fee_structures.amount`, contrôle bloquant.
2. `final_amount = original_amount − discount_amount`, toujours ≥ 0.
3. `final_amount ≥ paid_amount`, toujours.
4. `SUM(student_fee_installments.amount) = final_amount`, toujours.
5. Une structure référencée par au moins un SFA ne peut être supprimée — seulement désactivée.
6. Un SFA avec `paid_amount > 0` ne peut être supprimé — seulement annulé par contrepassation (Phase 07).
7. Un frais dont `opens_at` est postérieur à aujourd'hui n'est pas payable par le parent.
8. Deux structures applicables au même score de spécificité : affectation refusée, alerte comptable.
9. Une modification de tarif n'est jamais rétroactive sans action explicite.
10. Seules les remises `APPROVED` ont un effet financier.

---

## 11. Critères d'acceptation

- [ ] Création de 8 structures couvrant 7 niveaux, avec tranches, en moins de 15 minutes
- [ ] Une somme de tranches différente du montant de la structure est refusée
- [ ] L'impact en direct affiche le nombre d'élèves et le montant total exacts
- [ ] Créer une inscription affecte automatiquement les bons frais obligatoires
- [ ] Un élève interne de 6e reçoit la structure « Pension 6e internes », pas « Pension 6e »
- [ ] Deux structures en conflit de spécificité déclenchent une alerte et bloquent l'affectation
- [ ] Une remise de 20 000 recalcule le net **et** les trois tranches, somme exacte
- [ ] Une remise en pourcentage arrondit au franc inférieur
- [ ] Une remise dépassant le seuil reste `PENDING_APPROVAL` sans effet financier
- [ ] Une remise portant `final_amount` sous `paid_amount` est refusée
- [ ] La duplication vers 2027/2028 crée de nouvelles structures avec les échéances décalées d'un an
- [ ] Modifier le montant d'une structure existante ne change **aucun** SFA déjà créé
- [ ] `recalculate-assignments` prévisualise, puis applique avec audit ligne à ligne
- [ ] L'onglet Finances reproduit exactement le §50
- [ ] Tests de propriété sur `distribute()` : 10 000 tirages, somme toujours exacte
- [ ] Toutes les mutations sont auditées

---

## 12. Risques

| Risque | Impact | Parade |
|---|---|---|
| Modification de tarif rétroactive involontaire | **Critique** — dette faussée pour des centaines d'élèves | `original_amount` figé par copie ; recalcul uniquement sur action explicite avec prévisualisation |
| Erreurs d'arrondi sur le prorata des remises | Solde faux d'un franc, réconciliation en échec | `distribute()` pure, testée par propriété, jamais de division flottante |
| Ciblage ambigu de structures | Facturation aléatoire | Score de spécificité, refus en cas d'égalité, détecteur de conflits dans l'interface |
| Sur-conception du moteur de tarification | Retard de plusieurs semaines | S'en tenir aux trois axes de ciblage. Les cas exotiques passent par une remise unitaire, pas par une nouvelle dimension. |
| Comptable qui modifie une structure « pour corriger une faute de frappe » et déclenche un recalcul | Dette modifiée à son insu | Séparer nettement « modifier la structure » (sans effet) et « recalculer les affectations » (avec effet, prévisualisé) |
| Frais optionnels affectés par erreur à tous | Dette fictive | `is_mandatory = false` exclu de l'affectation automatique, sans exception |
