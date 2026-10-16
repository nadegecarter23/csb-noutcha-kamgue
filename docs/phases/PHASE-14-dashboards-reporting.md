# PHASE 14 — Dashboards & reporting

**Durée estimée** : 2,5 semaines · **Pré-requis** : P07 (P08, P11, P12 pour des données complètes) · **Réf. cahier** : §3.3, §3.4, §41, §44, §48, §49, §53, §54, §76

---

## 1. Objectif

Répondre à **la question de l'établissement** (§2) :

> Qui doit combien, qui a payé quoi, quand, comment, pour quel élève, dans quelle classe et pour quelle année scolaire ?

Toutes les données existent depuis la Phase 07. Cette phase ne crée aucune donnée nouvelle : elle construit les vues de lecture qui les rendent exploitables pour piloter l'établissement.

**Principe directeur** : chaque indicateur affiché doit être **cliquable** et mener à la liste détaillée des enregistrements qui le composent. Un chiffre sans possibilité de descendre au détail ne sert qu'à décorer — et il sera contesté sans pouvoir être vérifié.

---

## 2. Périmètre

### Inclus
- C01 — accueil Comptabilité, avec graphiques
- C04 — liste des paiements complète, filtres du §44
- C07 — états de paiement par classe
- D01 — dashboard Direction
- Analyse par classe et par niveau (§54)
- Recherche avancée financière : les 9 états du §49
- Recherche globale complète (§76)
- Optimisation SQL et index de reporting

### Exclu
- Exports fichiers (Phase 15) — les boutons sont présents, branchés en Phase 15
- Analyses prédictives, projections (hors V1)

---

## 3. Fondations techniques

### Une seule source

Tous les agrégats dérivent de `v_enrollment_balance` (doc 03 section J). **Aucune requête de dashboard ne recalcule un solde à sa façon.** C'est la garantie que le chiffre du parent, celui du comptable et celui du directeur sont le même chiffre.

### Performance

Volumétrie de 1 250 élèves et 5 000 paiements par an : les agrégations à la volée sont largement suffisantes avec les bons index. **Pas de vue matérialisée en V1** — elle introduirait une latence de fraîcheur pour un gain nul à cette échelle.

```sql
CREATE INDEX idx_payments_reporting
  ON payments (school_id, status, paid_at DESC) INCLUDE (amount, payment_method, provider);
CREATE INDEX idx_alloc_reporting
  ON payment_allocations (school_id, enrollment_id) INCLUDE (amount);
CREATE INDEX idx_sfa_reporting
  ON student_fee_assignments (school_id, enrollment_id, status)
  INCLUDE (final_amount, paid_amount);
CREATE INDEX idx_enrollments_reporting
  ON enrollments (school_id, academic_year_id, class_id, status);
```

Objectif : tout écran de dashboard chargé en moins de 800 ms. Un `EXPLAIN ANALYZE` est exigé sur chaque requête de reporting avant fusion, avec un jeu de données réaliste.

### Cache

Les indicateurs de dashboard sont cachés en Redis pendant 60 s, avec invalidation sur tout paiement. Le compromis est acceptable : personne n'a besoin d'un taux de recouvrement à la seconde près, mais tout le monde a besoin qu'il se charge vite.

---

## 4. C01 — Accueil Comptabilité (§41)

```text
┌─────────────────────────────────────────────────────────────────┐
│  Comptabilité — 2026/2027                                        │
├─────────────────────────────────────────────────────────────────┤
│  Montant attendu        Montant encaissé         Solde           │
│  245 600 000 FCFA       176 400 000 FCFA         69 200 000 FCFA │
│                                                                  │
│  Taux de recouvrement   Paiements aujourd'hui    En validation   │
│  71,82 %                3 450 000 FCFA           17  ⚠ 3 > 48 h  │
│  ██████████████░░░░░░                                            │
├─────────────────────────────────────────────────────────────────┤
│  ENCAISSEMENTS — 30 derniers jours                               │
│    ▁▂▅█▃▂▁▄█▅▃▂▁▂▃▅█▇▄▂▁▂▄▆█▅▃▂▁▂                                │
├──────────────────────────────┬───────────────────────────────────┤
│  PAR MOYEN DE PAIEMENT       │  ÉVOLUTION MENSUELLE              │
│  Espèces        42 %         │    Sept ████████ 45 M             │
│  Orange Money   28 %         │    Oct  ██████   32 M             │
│  MTN MoMo       18 %         │    Nov  ████     22 M             │
│  Banque         12 %         │    Déc  ███      18 M             │
├──────────────────────────────┴───────────────────────────────────┤
│  À TRAITER                                                       │
│  ⚠  3 paiements externes en attente depuis plus de 48 h          │
│  ⚠  1 paiement bloqué en cours de traitement                     │
│  ⚠  2 écarts de caisse non rapprochés                            │
└─────────────────────────────────────────────────────────────────┘
```

Les six indicateurs du §41, les graphiques annoncés comme « futurs » dans le cahier (ils sont peu coûteux ici et très parlants), et une section « À traiter » qui transforme le tableau de bord en outil de travail plutôt qu'en simple affichage.

Définitions rigoureuses, à afficher en infobulle sur chaque indicateur :

| Indicateur | Calcul |
|---|---|
| Montant attendu | `Σ student_fee_assignments.final_amount` des inscriptions actives de l'année |
| Montant encaissé | `Σ payment_allocations.amount` des paiements `SUCCESS` de l'année |
| Solde | attendu − encaissé |
| Taux de recouvrement | encaissé / attendu × 100 |
| Paiements du jour | `Σ payments.amount SUCCESS` dont `paid_at` = aujourd'hui (heure de Douala) |
| En validation | nombre de paiements `AWAITING_VALIDATION` |

Les contrepassations, étant des montants négatifs, sont naturellement déduites de l'encaissé. C'est le bon comportement.

---

## 5. C04 — Liste des paiements (§44)

Livrée en lecture seule à la Phase 07, complétée ici : tous les filtres du §44 (période, année, classe, niveau, moyen, statut, montant min/max, opérateur), totaux de la sélection affichés en pied de tableau, sélection multiple, tri sur toutes les colonnes, colonnes configurables, filtres reflétés dans l'URL.

Filtres rapides pré-enregistrés : *Aujourd'hui* · *Cette semaine* · *À valider* · *Mobile Money du mois* · *Contrepassés*.

---

## 6. C07 — État de paiement par classe (§48)

```text
  Année [2026/2027 ▾]  Niveau [6e ▾]  Classe [6e A ▾]
  Situation [Tous ▾]   ○ Tous ○ À jour ○ Partiel ○ Non payé ○ En retard

┌──────────────────────────────────────────────────────────────────────┐
│ Élève          Matricule   À payer     Payé      Reste   Situation   │
├──────────────────────────────────────────────────────────────────────┤
│ Fotso Nathan   00342      200 000   175 000     25 000   ◐ Partiel   │
│ Ngo Sarah      00343      200 000   200 000          0   ✓ À jour    │
│ Belinga Marc   00344      200 000         0    200 000   ✕ Non payé  │
│ Abena Paul     00345      200 000    50 000    150 000   ⚠ En retard │
├──────────────────────────────────────────────────────────────────────┤
│ TOTAL (52 élèves)      10 400 000  8 100 000  2 300 000     77,8 %   │
└──────────────────────────────────────────────────────────────────────┘

  [Exporter Excel]  [Exporter PDF]  [Imprimer]        ← Phase 15
```

Définition des situations, à figer et documenter :

| Situation | Condition |
|---|---|
| **À jour** | `balance = 0`, **ou** toutes les tranches échues sont réglées |
| **Partiel** | `0 < paid < due`, aucune tranche échue impayée |
| **Non payé** | `paid = 0` |
| **En retard** | au moins une tranche échue non réglée |

> Nuance importante : « À jour » ne veut pas dire « soldé ». Un élève qui a réglé sa 1ère tranche en novembre est **à jour**, même s'il reste deux tranches à venir. C'est exactement l'information dont l'établissement a besoin pour ses relances. Cette distinction doit être visible dans l'interface, sinon elle sera mal interprétée.

Cliquer sur une ligne ouvre la situation détaillée de l'élève. La ligne de total est toujours visible (en-tête collant).

---

## 7. Recherche avancée financière (§49)

Écran de requêtes prédéfinies, chacune produisant une liste exportable :

| # | État | Filtre |
|---|---|---|
| 1 | Élèves n'ayant rien payé | `paid = 0` |
| 2 | Élèves à jour | selon la définition ci-dessus |
| 3 | Élèves ayant payé la 1ère tranche | tranche `order_index = 1` en statut `PAID` |
| 4 | Élèves n'ayant pas payé la 2e tranche | tranche 2 échue et non `PAID` |
| 5 | Élèves avec plus de 100 000 FCFA d'impayés | `balance > 100000` |
| 6 | Paiements Orange Money du mois | `provider = ORANGE_MONEY`, période |
| 7 | Paiements Mobile Money de la semaine | `method = MOBILE_MONEY`, période |
| 8 | Paiements externes rejetés | `status = REJECTED` |
| 9 | Paiements en attente depuis plus de 48 h | `AWAITING_VALIDATION`, `created_at < now() − 48 h` |

Chacune est paramétrable (seuil, période, portée) et **enregistrable** comme requête favorite. C'est le point où l'outil dépasse le besoin exprimé : l'établissement inventera ses propres états, et il doit pouvoir le faire sans redéploiement.

Générateur de requêtes simple : critères combinables (niveau, classe, type de frais, tranche, situation, montant, période, moyen de paiement), aperçu du nombre de résultats avant exécution.

---

## 8. D01 — Dashboard Direction (§53, §54)

```text
┌─────────────────────────────────────────────────────────────────┐
│  Direction — 2026/2027                          19 août 2026     │
├─────────────────────────────────────────────────────────────────┤
│  Effectif      Attendu         Encaissé        Reste à recouvrer │
│  1 243         245 600 000     176 400 000     69 200 000        │
│                                                                  │
│  TAUX DE RECOUVREMENT                                            │
│  ████████████████████████████░░░░░░░░░░░  71,82 %                │
├─────────────────────────────────────────────────────────────────┤
│  RÉPARTITION DES ÉLÈVES                                          │
│  ✓ À jour           842   ████████████████░░░░░░  67,7 %         │
│  ◐ Paiement partiel 267   █████░░░░░░░░░░░░░░░░░  21,5 %         │
│  ✕ Aucun paiement   134   ██░░░░░░░░░░░░░░░░░░░░  10,8 %         │
├─────────────────────────────────────────────────────────────────┤
│  ÉVOLUTION DES ENCAISSEMENTS                                     │
│     ┌────────────────────────────────────────┐                  │
│  M  │                            ╱────────── │  ← cumulé        │
│     │                    ╱──────╱            │                  │
│     │          ╱────────╱                    │                  │
│     │ ╱───────╱                              │                  │
│     └────────────────────────────────────────┘                  │
│      Sept  Oct  Nov  Déc  Jan  Fév  Mar                          │
├─────────────────────────────────────────────────────────────────┤
│  SITUATION PAR NIVEAU                          [Par classe ▾]    │
│  Niveau  Élèves  Attendu  Encaissé   Reste   Recouvrement       │
│  6e         156   31,2 M    24,3 M    6,9 M   77,9 %  ████████░ │
│  5e         148   29,6 M    21,1 M    8,5 M   71,3 %  ███████░░ │
│  4e         142   28,4 M    18,2 M   10,2 M   64,1 %  ██████░░░ │
│  …                                                               │
└─────────────────────────────────────────────────────────────────┘
```

### Analyse par classe (§54)

Bascule niveau ↔ classe. Tri sur chaque colonne — trier par taux de recouvrement croissant identifie immédiatement les classes qui décrochent, ce qui est l'usage réel du directeur.

```text
  Classe  Élèves  Attendu  Encaissé  Reste  Recouvrement
  6e A        52   10,4 M     8,1 M  2,3 M   77,8 %
  6e B        48    9,6 M     7,9 M  1,7 M   82,3 %
  6e C        56   11,2 M     6,4 M  4,8 M   57,1 %  ⚠
```

Une classe nettement en deçà de la moyenne est signalée. Cliquer ouvre C07 filtré sur cette classe.

Comparaison avec l'année précédente à la même date (« 71,8 % contre 68,4 % l'an dernier ») : c'est l'indicateur qui donne du sens au chiffre brut, dès la deuxième année d'exploitation.

---

## 9. Recherche globale (§76)

Complétée à tous les types demandés : élève (nom, prénom, matricule), responsable (nom, téléphone), numéro de reçu, référence de paiement, référence Mobile Money.

Accessible par `Ctrl+K`, résultats groupés par type, navigation au clavier, moins de 300 ms. La recherche par référence opérateur est celle qu'utilise le comptable au téléphone avec un parent : elle doit être immédiate.

---

## 10. API

```
GET /api/v1/reports/accountant-dashboard?academic_year_id=
GET /api/v1/reports/director-dashboard?academic_year_id=
GET /api/v1/reports/collection-by-class?academic_year_id=&grade_level_id=
GET /api/v1/reports/collection-by-level?academic_year_id=
GET /api/v1/reports/class-payment-status?class_id=&situation=
GET /api/v1/reports/payment-trends?academic_year_id=&granularity=day|week|month
GET /api/v1/reports/payment-methods-breakdown?from=&to=
GET /api/v1/reports/outstanding?min_amount=&class_id=&grade_level_id=
GET /api/v1/reports/installment-status?installment_order=&status=
GET /api/v1/reports/saved-queries
POST /api/v1/reports/saved-queries
POST /api/v1/reports/custom-query
GET /api/v1/search?q=&types=students,guardians,payments,receipts
```

---

## 11. Critères d'acceptation

- [ ] Chaque indicateur de C01 est exact, vérifié manuellement sur un jeu de données connu
- [ ] Chaque indicateur est cliquable et mène à la liste détaillée correspondante
- [ ] Le taux de recouvrement de D01 est identique à celui de C01
- [ ] La somme des encaissements par classe est égale à l'encaissement total
- [ ] Les contrepassations sont correctement déduites des totaux
- [ ] Les 9 états du §49 renvoient des résultats exacts
- [ ] Les définitions de situation (à jour / partiel / non payé / en retard) sont documentées et implémentées à l'identique partout
- [ ] Un élève « à jour » mais non soldé est bien classé « à jour »
- [ ] Tous les écrans se chargent en moins de 800 ms sur 1 250 élèves et 5 000 paiements
- [ ] `EXPLAIN ANALYZE` fourni pour chaque requête de reporting, sans balayage séquentiel sur les grandes tables
- [ ] Les graphiques sont lisibles et corrects
- [ ] Le tri par recouvrement croissant identifie les classes en difficulté
- [ ] Un directeur sans permission comptable accède à D01 mais pas à la configuration des frais
- [ ] La recherche globale trouve un paiement par sa référence Mobile Money en moins de 300 ms
- [ ] Une requête personnalisée peut être enregistrée et rejouée
- [ ] Les chiffres correspondent exactement à ceux affichés côté parent pour les mêmes élèves

---

## 12. Risques

| Risque | Impact | Parade |
|---|---|---|
| Incohérence entre deux écrans | **Perte de confiance dans l'outil entier** | Source unique (`v_enrollment_balance`), test de cohérence croisée entre tous les écrans en CI |
| Définitions floues (« à jour » ?) | Interprétations divergentes, décisions erronées | Définitions écrites, infobulles dans l'interface, une seule implémentation |
| Requêtes lentes en pic de rentrée | Dashboards inutilisables au pire moment | Index dédiés, `EXPLAIN` obligatoire, cache 60 s, tests de charge |
| Indicateurs non actionnables | Tableau de bord ignoré | Tout indicateur est cliquable ; section « À traiter » orientée action |
| Sur-conception des graphiques | Retard | Recharts, 4 graphiques maximum, pas de tableau de bord configurable en V1 |
| Chiffres contestés par la direction | Crise de confiance | Descente au détail possible depuis chaque chiffre, jusqu'à la transaction élémentaire |
