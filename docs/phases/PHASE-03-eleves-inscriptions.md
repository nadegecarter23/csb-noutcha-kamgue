# PHASE 03 — Élèves & inscriptions

**Durée estimée** : 2 semaines · **Pré-requis** : P02 · **Réf. cahier** : §5, §34, §35, §36, §37, §75, §76, §81 (règles 1, 5, 6)

---

## 1. Objectif

Implanter la **dimension IDENTITÉ** (§87) et la **dimension SCOLARITÉ** : l'élève comme entité permanente, et son inscription comme fait annuel. C'est la phase où se joue la longévité du modèle : si l'on confond les deux ici, tout l'historique du §80 devient impossible.

---

## 2. Périmètre

### Inclus
- `students`, `enrollments`, `student_class_changes`
- Génération du matricule
- Statuts de l'élève (§5) et de l'inscription
- Création d'élève avec inscription en une seule opération (S06)
- Liste des élèves avec filtres, recherche, tri, pagination (S05)
- Fiche élève administration avec onglets (S07)
- Changement de classe
- Recherche globale (§76), volet élèves
- Photo de l'élève
- Indicateurs réels de S01
- Impression de la fiche élève

### Exclu
- Responsables (Phase 04) — l'onglet existe, il est vide
- Finances (Phase 06/07) — les onglets existent, ils sont vides
- Import Excel (Phase 05)
- Réinscription en masse (Phase 05)

---

## 3. Modèle de données

Détail en [../03-MODELE-DONNEES.md](../03-MODELE-DONNEES.md) section D.

### Les deux invariants de la phase

```sql
-- Une seule inscription par élève et par année (règle 6 du §81)
ALTER TABLE enrollments
  ADD CONSTRAINT uq_enrollments_student_year UNIQUE (student_id, academic_year_id);

-- Matricule unique par établissement
ALTER TABLE students
  ADD CONSTRAINT uq_students_number UNIQUE (school_id, student_number);
```

Et l'invariant **négatif**, tout aussi important :

> La table `students` ne contient **ni** `class_id`, **ni** `academic_year_id`, **ni** `grade_level_id`. Toute tentative d'en ajouter une doit être refusée en revue de code. La classe d'un élève est une propriété de son inscription, pas de lui-même.

Cohérence à valider en service (impossible en SQL simple) : la classe choisie appartient bien à l'année de l'inscription.

### Index de recherche (§76)

```sql
CREATE INDEX idx_students_search ON students
  USING gin ((unaccent(lower(first_name || ' ' || last_name))) gin_trgm_ops);
CREATE INDEX idx_students_number ON students (school_id, student_number);
```
Recherche insensible à la casse et aux accents, tolérante aux fautes de frappe (« fotsi » trouve « Fotso »).

---

## 4. Génération du matricule

Format paramétrable dans `school_settings` : `{prefix}{seq:padding}` → `CPLAN-00342`.

```text
1. Verrouiller la ligne number_sequences (school_id, 'STUDENT_NUMBER', '')
2. current_value += 1
3. Formater selon le paramétrage
4. Insérer l'élève dans la même transaction
```

Deux options offertes à l'établissement :
- **Automatique** (défaut) : séquence continue.
- **Manuel** : la scolarité saisit le matricule (reprise d'un existant lors de la migration des données). Contrôle d'unicité, et la séquence est repositionnée si le matricule saisi est supérieur au compteur.

Le matricule est **immuable** après création. Le corriger exige la permission `students.update` avec motif obligatoire et audit — c'est un identifiant qui figure sur des documents déjà imprimés.

---

## 5. Statuts

### Élève (§5)

| Statut | Signification | Conséquence |
|---|---|---|
| `ACTIVE` | Scolarisé | Apparaît partout par défaut |
| `INACTIVE` | Temporairement non scolarisé | Exclu des listes par défaut, dossier consultable |
| `GRADUATED` | A terminé son cursus | Exclu de la réinscription |
| `TRANSFERRED` | Parti dans un autre établissement | Dossier figé, historique conservé |
| `SUSPENDED` | Exclusion temporaire | Reste inscrit, la dette demeure |
| `ARCHIVED` | Dossier archivé | Consultable uniquement par recherche explicite |

### Inscription

`DRAFT` → `ACTIVE` → (`SUSPENDED`) → `COMPLETED` | `WITHDRAWN` | `CANCELLED`

`CANCELLED` est réservé à l'erreur de saisie : **interdit si des paiements existent** (§75). Un élève parti en cours d'année passe en `WITHDRAWN`, ce qui conserve la dette et les paiements.

### Suppression (§75)

```text
L'élève a-t-il une inscription, un paiement, un reçu ou une opération financière ?
   ├── NON  → suppression physique possible (permission students.archive, motif, audit)
   └── OUI  → suppression REFUSÉE par l'API
              → proposer : désactiver · transférer · archiver
```
L'API renvoie un `409` avec le décompte de ce qui bloque : « Suppression impossible : 1 inscription, 3 paiements, 3 reçus. »

---

## 6. API

```
GET    /api/v1/students
       ?academic_year_id=&grade_level_id=&class_id=&status=&gender=
       &enrollment_status=&has_guardian_account=&q=&page=&page_size=&sort=
GET    /api/v1/students/:id
POST   /api/v1/students                 # crée l'élève + son inscription (transaction unique)
PATCH  /api/v1/students/:id
POST   /api/v1/students/:id/status      # changement de statut, motif obligatoire
POST   /api/v1/students/:id/photo       # upload → files
DELETE /api/v1/students/:id             # refusé s'il existe un historique
GET    /api/v1/students/:id/history     # journal métier consolidé

GET    /api/v1/enrollments?student_id=&academic_year_id=&class_id=&status=
POST   /api/v1/enrollments              # inscription pour une année donnée
PATCH  /api/v1/enrollments/:id
POST   /api/v1/enrollments/:id/transfer-class   # { to_class_id, reason }
POST   /api/v1/enrollments/:id/cancel

GET    /api/v1/search?q=                # recherche globale (§76)
GET    /api/v1/dashboard/registrar      # indicateurs S01
```

### `POST /students` — payload

```jsonc
{
  "student": {
    "student_number": null,              // null = génération automatique
    "first_name": "Nathan", "last_name": "Fotso",
    "date_of_birth": "2014-03-12", "place_of_birth": "Douala",
    "gender": "M"
  },
  "enrollment": {
    "academic_year_id": "…", "class_id": "…",
    "student_category_id": "…",          // régime
    "enrollment_date": "2026-09-01",
    "enrollment_type": "NEW"
  },
  "guardians": [ /* Phase 04 — accepté dès maintenant, ignoré */ ]
}
```

Réponse : l'élève, son inscription, et (à partir de la Phase 04) le code d'association généré.

---

## 7. Interfaces

### S05 — Liste des élèves

```text
┌───────────────────────────────────────────────────────────────────────┐
│ Élèves                        [Ajouter] [Importer] [Exporter] [⋯]     │
├───────────────────────────────────────────────────────────────────────┤
│ 🔍 Nom, matricule, téléphone parent…                                  │
│ Année 2026/2027 ▾  Niveau ▾  Classe ▾  Sexe ▾  Statut ▾  Parent ▾    │
├───────────────────────────────────────────────────────────────────────┤
│ Matricule    Nom       Prénom  Sexe  Classe  Resp. principal   Tél.   │
│ CPLAN-00342  Fotso     Nathan   M    6e A    Jean Fotso   699…  Actif │
└───────────────────────────────────────────────────────────────────────┘
                                              1 243 élèves · page 1/50
```

- Colonnes du §34, avec choix des colonnes affichées, mémorisé par utilisateur.
- Recherche unique couvrant nom, prénom, matricule et téléphone parent, avec debounce 300 ms, exécutée côté serveur.
- Filtres combinables, reflétés dans l'URL (une liste filtrée doit être partageable par lien).
- Sélection multiple → actions groupées : changer de classe, exporter, imprimer (la réinscription en masse arrive en Phase 05).
- Pagination serveur, 25 par défaut.

### S06 — Création d'un élève

Formulaire en trois sections (§35), sur une seule page avec ancres — **pas un assistant multi-étapes** : la scolarité saisit à la chaîne, chaque clic supplémentaire coûte.

1. **Informations personnelles** — matricule (auto, modifiable), nom, prénom, date de naissance (sélecteur adapté à une saisie rapide, pas un calendrier), sexe, lieu de naissance, photo.
2. **Informations scolaires** — année (pré-remplie), niveau, classe (filtrée par le niveau, avec l'effectif affiché : `6e A — 52/60`), régime, date d'inscription, type d'inscription, statut.
3. **Responsables** — section présente, activée en Phase 04.

Barre d'action fixe en bas : `Enregistrer` · `Enregistrer et créer un autre` (conserve année/niveau/classe) · `Annuler`.
Sauvegarde de brouillon en local pour ne rien perdre en cas de rechargement.

### Après création (§36)

Panneau de confirmation :
```text
✓ Nathan Fotso créé — CPLAN-00342 — 6e A

[Imprimer la fiche]  [Copier le code d'association]  [Imprimer le QR]   ← Phase 04
[Voir le dossier]    [Créer un autre élève]
```

### S07 — Fiche élève

```text
┌────────────────────────────────────────────────────────────┐
│  [photo]  Nathan Fotso                        [Modifier]   │
│           CPLAN-00342 · 6e A · 2026/2027      [Actions ▾]  │
│           ● Actif                                          │
├────────────────────────────────────────────────────────────┤
│ Informations │ Responsables │ Inscriptions │ Finances │    │
│ Paiements │ Documents │ Historique                         │
└────────────────────────────────────────────────────────────┘
```

| Onglet | Phase | Contenu |
|---|---|---|
| Informations | **03** | État civil, scolarité de l'année, modification en place |
| Responsables | 04 | Placeholder « Aucun responsable enregistré » |
| Inscriptions | **03** | Frise chronologique : `2026/2027 — 6e A — Actif`, une ligne par année (§80) |
| Finances | 06 | Placeholder |
| Paiements | 07 | Placeholder |
| Documents | 15 | Placeholder |
| Historique | **03** | Journal métier lisible : créations, changements de classe, changements de statut |

Menu `Actions` : changer de classe · changer de statut · réinscrire (Phase 05) · imprimer la fiche · archiver.

### Changement de classe

Modale : classe actuelle → nouvelle classe (avec effectif), motif (obligatoire), date d'effet. Écrit dans `student_class_changes` **et** met à jour `enrollments.class_id`. Avertissement si la classe cible est pleine, sans blocage.

### Recherche globale (§76)

Accessible par `Ctrl+K` depuis n'importe quel écran. Résultats groupés par type (Élèves, Responsables, Paiements, Reçus — les trois derniers arrivent aux phases suivantes), navigation au clavier, ouverture directe de la fiche.

---

## 8. Règles métier

1. Un élève appartient à un établissement (règle 1) et ne dépend d'aucun compte parent.
2. Une inscription par élève et par année (règle 6), garantie en base.
3. La classe d'une inscription appartient à l'année de cette inscription.
4. Le matricule est unique par établissement et immuable en pratique.
5. Créer un élève crée toujours au moins une inscription — un élève sans inscription n'a pas de sens métier.
6. Un élève peut être `ACTIVE` sans classe (`class_id = NULL`) : c'est l'indicateur « élèves non affectés » de S01.
7. Changer un élève de classe ne crée **jamais** une nouvelle inscription (c'est la réinscription qui le fait, Phase 05).
8. Détection de doublon à la création : même nom + même prénom + même date de naissance ⇒ avertissement bloquant à confirmer explicitement.

---

## 9. Critères d'acceptation

- [ ] Création d'un élève avec matricule automatique, séquence correcte
- [ ] 20 créations simultanées produisent 20 matricules distincts et consécutifs (test de concurrence)
- [ ] Une deuxième inscription du même élève pour la même année est refusée en base
- [ ] Une classe d'une autre année ne peut être choisie pour l'inscription
- [ ] La recherche « fotsi » trouve « Fotso » ; « 00342 » trouve l'élève par matricule
- [ ] Les filtres sont reflétés dans l'URL et l'URL restaure l'état
- [ ] Le changement de classe crée une ligne d'historique et apparaît dans l'onglet Historique
- [ ] La suppression d'un élève sans historique fonctionne ; avec inscription, elle est refusée avec le détail du blocage
- [ ] L'onglet Inscriptions affiche la frise multi-années (testé avec 3 années de données)
- [ ] `Ctrl+K` ouvre la recherche globale et permet d'atteindre un élève au clavier
- [ ] La liste de 1 243 élèves se charge en moins de 500 ms (page de 25)
- [ ] Les indicateurs S01 sont exacts et cliquables
- [ ] La fiche élève s'imprime correctement (format A4)
- [ ] Toutes les mutations sont auditées

---

## 10. Risques

| Risque | Impact | Parade |
|---|---|---|
| Ajouter `class_id` sur `students` « pour simplifier » | **Critique** — perte de tout l'historique | Point de vigilance explicite en revue de code ; test qui vérifie l'absence de la colonne |
| Course sur la séquence de matricules | Doublons | Verrou de ligne `number_sequences` + test de concurrence à 20 requêtes parallèles |
| Reprise de matricules existants (établissement déjà en activité) | Collisions | Mode manuel + repositionnement de la séquence + contrôle d'unicité à l'import (Phase 05) |
| Saisie de masse laborieuse (127 nouveaux élèves à la rentrée) | Rejet de l'outil par la scolarité | « Enregistrer et créer un autre » conservant le contexte + import Excel en Phase 05 |
| Dates de naissance approximatives (fréquent) | Blocage de saisie | Champ non obligatoire, avertissement seulement |
