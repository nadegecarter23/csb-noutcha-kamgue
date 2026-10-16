# PHASE 02 — Référentiel scolaire

**Durée estimée** : 1,5 semaine · **Pré-requis** : P01 · **Réf. cahier** : §3.2, §30, §31, §32, §33, §85

---

## 1. Objectif

Construire le squelette temporel et organisationnel de l'établissement : **années scolaires, niveaux, classes**. Sans ce référentiel, on ne peut ni inscrire un élève, ni définir un tarif. C'est aussi la phase où le Dashboard Scolarité prend forme.

---

## 2. Périmètre

### Inclus
- `academic_years`, `grade_levels`, `classes`, `student_categories`
- Duplication d'une année vers la suivante (niveaux + classes)
- Cycle de vie des années : brouillon → active → clôturée → archivée
- Écrans S02 (années), S03 (niveaux), S04 (classes)
- Shell du Dashboard Scolarité : navigation, sélecteur d'année scolaire global, accueil S01 (avec indicateurs à zéro)
- Écran de paramètres d'établissement (`school_settings`)

### Exclu
- Élèves et inscriptions (Phase 03)
- Indicateurs réels de S01 (alimentés en Phase 03/04)
- Duplication des structures tarifaires (Phase 06)

---

## 3. Modèle de données

Détail en [../03-MODELE-DONNEES.md](../03-MODELE-DONNEES.md) section C.

Trois contraintes à ne pas manquer :

```sql
-- Une seule année courante par établissement
CREATE UNIQUE INDEX uq_academic_years_current
  ON academic_years (school_id) WHERE is_current;

-- Une classe appartient à une année (règle 5 du §81)
ALTER TABLE classes ALTER COLUMN academic_year_id SET NOT NULL;

-- Pas de doublon de nom de classe dans une même année
CREATE UNIQUE INDEX uq_classes_year_name
  ON classes (school_id, academic_year_id, lower(name));
```

**Le point structurant** : `classes` est lié à `academic_year_id`. « 6e A » de 2026/2027 et « 6e A » de 2027/2028 sont **deux enregistrements distincts**. C'est ce qui permet à l'historique de l'élève (§5, §80) d'exister. Une classe n'est jamais « réutilisée » d'une année sur l'autre : elle est **copiée**.

---

## 4. Cycle de vie d'une année scolaire (§31)

```text
   DRAFT ──────► ACTIVE ──────► CLOSED ──────► ARCHIVED
     │             ▲
     │             │
     └── création  └── une seule ACTIVE marquée is_current
```

| Transition | Règles |
|---|---|
| Création (`DRAFT`) | Nom unique, dates cohérentes, chevauchement avec une autre année : avertissement, pas blocage |
| `DRAFT → ACTIVE` | Exige au moins un niveau et une classe. Bascule `is_current` (l'ancienne courante perd le drapeau, sans changer de statut) |
| `ACTIVE → CLOSED` | Bloque les nouvelles inscriptions et les nouveaux paiements sur cette année. **Autorise** la lecture, les exports et la réimpression de reçus. Avertissement si des soldes débiteurs subsistent (sans blocage : la clôture pédagogique et le recouvrement ne sont pas synchrones) |
| `CLOSED → ARCHIVED` | Lecture seule totale. Réversible par un `SCHOOL_ADMIN` avec motif |

Permission `academic_years.close` réservée à `SCHOOL_ADMIN` / `DIRECTOR`. Action auditée.

> **Décision** : la clôture n'empêche pas d'encaisser un reliquat de l'année précédente ? **Si**, elle l'empêche. Un paiement doit toujours s'imputer sur une année ouverte. Pour recouvrer un impayé ancien, on crée un frais `RELIQUAT_ANNEE_PRECEDENTE` sur l'inscription courante (voir [../04-REGLES-METIER-FINANCIERES.md](../04-REGLES-METIER-FINANCIERES.md) §10). À valider avec le client — c'est un point de friction opérationnel classique.

---

## 5. API

```
GET    /api/v1/academic-years
POST   /api/v1/academic-years
PATCH  /api/v1/academic-years/:id
POST   /api/v1/academic-years/:id/activate
POST   /api/v1/academic-years/:id/close
POST   /api/v1/academic-years/:id/archive
POST   /api/v1/academic-years/:id/duplicate-structure   # copie niveaux + classes vers une nouvelle année

GET    /api/v1/grade-levels
POST   /api/v1/grade-levels
PATCH  /api/v1/grade-levels/:id
POST   /api/v1/grade-levels/reorder                     # tri par glisser-déposer
POST   /api/v1/grade-levels/:id/deactivate

GET    /api/v1/classes?academic_year_id=&grade_level_id=&status=
POST   /api/v1/classes
PATCH  /api/v1/classes/:id
POST   /api/v1/classes/:id/deactivate
GET    /api/v1/classes/:id/summary                      # effectif, capacité, taux de remplissage

GET    /api/v1/student-categories
POST   /api/v1/student-categories
PATCH  /api/v1/student-categories/:id

GET    /api/v1/settings
PATCH  /api/v1/settings
```

`POST /academic-years/:id/duplicate-structure` prend en entrée l'année source et copie : tous les `grade_levels` actifs (s'ils n'existent pas déjà — les niveaux sont en réalité stables dans le temps, la copie ne concerne donc que les classes en pratique) et toutes les `classes` actives, avec le nouveau `academic_year_id`. Prévisualisation avant exécution. C'est la première étape du parcours du §68.

---

## 6. Interfaces

### Sélecteur d'année — élément de navigation global

Présent dans l'en-tête de **tous** les dashboards, à droite du logo. Il détermine le contexte de toutes les listes, filtres et indicateurs. Persisté en local, initialisé sur l'année courante.

```text
┌──────────────────────────────────────────────────────┐
│  CSB Noutcha KAMGUE   Scolarité ▾              [2026/2027 ▾]  MN │
└──────────────────────────────────────────────────────┘
```

Une année `CLOSED` ou `ARCHIVED` sélectionnée affiche un **bandeau permanent** : « Année clôturée — consultation uniquement », et toutes les actions d'écriture sont désactivées.

### S02 — Années scolaires

Liste chronologique décroissante, avec pastille de statut :
```text
2026/2027   Active      01/09/2026 → 31/07/2027   1 243 élèves   [Clôturer]
2025/2026   Clôturée    01/09/2025 → 31/07/2026   1 198 élèves   [Archiver]
2024/2025   Archivée    …                                        [Consulter]
```
Actions : `+ Créer une année`, et sur chaque ligne : modifier, activer, clôturer, archiver, dupliquer la structure.

### S03 — Niveaux

Liste **ordonnable par glisser-déposer** (l'ordre pédagogique conditionne l'affichage partout ailleurs). Colonnes : ordre, code, nom, cycle, nombre de classes, statut.

### S04 — Classes

Vue groupée par niveau, sous forme de cartes :
```text
6e  ─────────────────────────────────────────
   ┌─────────────┐ ┌─────────────┐ ┌─────────────┐
   │ 6e A        │ │ 6e B        │ │ 6e C        │
   │ 52 / 60     │ │ 48 / 60     │ │ 0 / 60      │
   │ ████████░░  │ │ ███████░░░  │ │ ░░░░░░░░░░  │
   │ M. Nkolo    │ │ Mme Abena   │ │ —           │
   └─────────────┘ └─────────────┘ └─────────────┘
```
Le taux de remplissage passe en orange à 90 %, en rouge au-delà de la capacité. Bascule liste/cartes. Création avec assistant « créer 6e A, 6e B, 6e C d'un coup ».

### S01 — Accueil Scolarité (structure)

Grille d'indicateurs (à zéro à ce stade, alimentés en Phase 03/04) et actions rapides du §30 :
```text
Élèves actifs · Nouvelles inscriptions · Réinscriptions
Élèves non affectés · Associations parents en attente

[+ Ajouter un élève] [Importer des élèves]
[Créer une inscription] [Changer un élève de classe]
```
Chaque indicateur est **cliquable** et mène à la liste filtrée correspondante. Un indicateur qui ne mène nulle part est un indicateur inutile.

### Paramètres d'établissement

Onglets : Général (nom, code, adresse, contacts, logo), Numérotation (préfixe de matricule, format de reçu, format de référence de paiement, avec aperçu en direct), Financier (stratégie d'affectation, surpaiement autorisé, seuil d'approbation des remises), Notifications (délais de relance §79).

---

## 7. Règles métier

1. Une seule année `is_current` par établissement, garantie par index unique partiel.
2. Une classe appartient à exactement une année scolaire.
3. Un niveau ne peut être désactivé s'il porte des classes actives.
4. Une classe ne peut être désactivée si elle porte des inscriptions actives (contrôlé à partir de la Phase 03).
5. Réduire la capacité d'une classe en dessous de son effectif : autorisé, mais avertissement explicite.
6. Aucune suppression physique : désactivation uniquement.
7. Le nom d'une classe est unique, insensible à la casse, dans une année donnée.

---

## 8. Critères d'acceptation

- [ ] Création de l'année 2026/2027, de 7 niveaux et de 21 classes en moins de 5 minutes via l'interface
- [ ] Activer 2027/2028 retire automatiquement `is_current` à 2026/2027
- [ ] Une tentative de création de deux années courantes échoue au niveau base (index unique), pas seulement applicatif
- [ ] La duplication de structure crée bien de **nouvelles** classes, avec de nouveaux identifiants
- [ ] Le sélecteur d'année filtre l'intégralité des écrans
- [ ] Une année clôturée affiche le bandeau et désactive toutes les actions d'écriture
- [ ] Désactiver un niveau portant des classes actives est refusé, avec un message clair
- [ ] Le glisser-déposer des niveaux persiste l'ordre
- [ ] Les indicateurs S01 sont cliquables et mènent aux listes filtrées
- [ ] Toutes les actions sont auditées
- [ ] Le seed produit une année complète exploitable pour les phases suivantes

---

## 9. Risques

| Risque | Parade |
|---|---|
| Oublier `academic_year_id` sur `classes` | Contrainte `NOT NULL` dès la migration initiale |
| Sélecteur d'année ignoré par certains écrans | Hook `useAcademicYear()` obligatoire ; revue de code systématique sur ce point |
| Établissement qui gère des cycles hétérogènes (primaire + collège + lycée) | Champ `cycle` sur `grade_levels`, filtrable dès maintenant |
| Le client veut renommer une classe en cours d'année | Autorisé, l'identifiant reste stable — mais les reçus déjà émis conservent l'ancien libellé via leur `snapshot` (voir Phase 07) |
