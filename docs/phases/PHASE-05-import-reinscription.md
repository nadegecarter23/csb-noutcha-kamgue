# PHASE 05 — Import Excel & réinscription

**Durée estimée** : 1,5 semaine · **Pré-requis** : P04 · **Réf. cahier** : §39, §40, §68, §30

---

## 1. Objectif

Rendre l'outil utilisable **à l'échelle réelle**. Un établissement de 1 243 élèves ne saisit pas ses effectifs un par un, et ne réinscrit pas 1 036 élèves à la main. Cette phase conditionne l'adoption : sans elle, CSB Noutcha KAMGUE reste une démonstration.

Deux fonctionnalités distinctes qui partagent la même exigence — **traiter des centaines d'enregistrements sans jamais corrompre les données existantes** :
1. **Import Excel** — faire entrer l'existant dans le système (§40)
2. **Réinscription** — faire passer l'existant d'une année à la suivante (§39, §68)

---

## 2. Périmètre

### Inclus
- `import_batches`, `import_rows`
- Import d'élèves + responsables depuis Excel/CSV, en 6 étapes (§40)
- Modèle de fichier téléchargeable
- Correspondance de colonnes, prévisualisation, détection d'erreurs, correction en ligne
- Réinscription unitaire (S08)
- Réinscription en masse avec règles de promotion
- Assistant « Nouvelle année scolaire » (§68), hors volet tarifaire

### Exclu
- Import des frais et des paiements (traité en Phase 17, reprise de données)
- Duplication des structures tarifaires (Phase 06) — l'assistant du §68 réserve l'étape et la débranche vers la Phase 06

---

## 3. Import Excel (§40)

### 3.1 Les six étapes

```text
1. Télécharger le modèle      → .xlsx pré-formaté, avec une feuille « Instructions »
                                 et des listes déroulantes (classes, sexe, parenté)
2. Importer le fichier        → upload → files, création d'un import_batch (UPLOADED)
3. Correspondance de colonnes → détection automatique par nom d'en-tête,
                                 ajustement manuel, mémorisée pour les imports suivants
4. Prévisualisation           → validation ligne à ligne, batch = VALIDATED
5. Correction des erreurs     → édition en ligne, ou correction dans Excel et réimport
6. Import                     → job asynchrone, transaction par lot de 100 lignes
```

Chaque étape est **reprenable** : un `import_batch` interrompu se retrouve dans la liste et se poursuit. Les fichiers de 1 000 lignes ne se traitent pas dans une requête HTTP.

### 3.2 Colonnes du modèle

| Colonne | Obligatoire | Validation |
|---|---|---|
| Matricule | non | Unique ; généré si vide |
| Nom, Prénom | **oui** | Non vide |
| Date de naissance | non | Formats acceptés : `JJ/MM/AAAA`, `AAAA-MM-JJ`, série Excel |
| Sexe | **oui** | `M`/`F`/`Masculin`/`Féminin`/`Garçon`/`Fille` |
| Lieu de naissance | non | |
| Classe | **oui** | Doit exister dans l'année cible |
| Régime | non | Doit exister dans `student_categories` |
| Date d'inscription | non | Défaut : date du jour |
| Responsable 1 — Nom, Prénom, Parenté, Téléphone, E-mail | téléphone **oui** si le bloc est renseigné | Téléphone normalisable en E.164 |
| Responsable 2 — idem | non | |

### 3.3 Détection d'erreurs (§40)

| Contrôle | Sévérité | Comportement |
|---|---|---|
| Matricule dupliqué **dans le fichier** | Erreur | Ligne bloquée |
| Matricule déjà présent **en base** | Erreur | Ligne bloquée, avec un lien vers l'élève existant |
| Numéro de téléphone invalide | Erreur | Ligne bloquée |
| Classe inexistante | Erreur | Ligne bloquée, avec proposition de correspondance approchante (« 6eA » → « 6e A » ?) |
| Date incorrecte ou incohérente (naissance dans le futur, âge > 30 ans) | Erreur / Avertissement | Selon le cas |
| Champ obligatoire vide | Erreur | Ligne bloquée |
| **Doublon potentiel** (même nom + prénom + date de naissance qu'un élève existant) | Avertissement | Ligne importable après confirmation explicite |
| Classe au-delà de sa capacité | Avertissement | Importable |
| Téléphone parent déjà associé à un autre nom de responsable | Avertissement | Importable, mais signalé |

Les avertissements n'empêchent pas l'import ; les erreurs, si. **Aucun import partiel silencieux** : soit la ligne est valide et importée, soit elle est rejetée et listée dans un rapport téléchargeable.

### 3.4 Exécution

```text
Pour chaque lot de 100 lignes, dans une transaction :
  · créer ou retrouver le guardian (par téléphone normalisé)
  · créer l'élève (matricule auto si absent)
  · créer l'inscription pour l'année cible
  · créer les liens student_guardians en statut PENDING
  · marquer import_rows.status = IMPORTED avec created_entity_id
En cas d'échec d'un lot : ce lot est annulé, les autres continuent, l'erreur est consignée
```

Barre de progression en temps réel (interrogation périodique, ou SSE). À la fin : rapport avec le décompte importé / ignoré / en erreur, et export des lignes en erreur au format Excel pour correction et réimport.

**Important** : l'import crée les liens parents en `PENDING`, jamais en `ACCEPTED`. Le parent devra toujours accepter (§9). Un import ne contourne pas la règle de sécurité.

### 3.5 API

```
GET    /api/v1/imports/template?type=STUDENTS      # .xlsx
POST   /api/v1/imports                             # upload → batch
POST   /api/v1/imports/:id/mapping                 # correspondance des colonnes
POST   /api/v1/imports/:id/validate                # lance la validation (job)
GET    /api/v1/imports/:id                         # état + statistiques
GET    /api/v1/imports/:id/rows?status=ERROR       # lignes, filtrables
PATCH  /api/v1/imports/:id/rows/:rowId             # correction en ligne
POST   /api/v1/imports/:id/execute                 # lance l'import (job)
GET    /api/v1/imports/:id/report                  # rapport .xlsx
DELETE /api/v1/imports/:id                         # abandon (avant exécution)
```

---

## 4. Réinscription (§39)

### 4.1 Le principe, à ne pas manquer

```text
Nathan Fotso — élève permanent — CPLAN-00342
   │
   ├── enrollment 2026/2027 · 6e A · status = COMPLETED
   └── enrollment 2027/2028 · 5e A · status = ACTIVE      ← NOUVELLE LIGNE
```

Une réinscription **crée une inscription**, elle n'en modifie aucune. Les paiements, les frais, les reçus de 2026/2027 restent rattachés à l'ancienne inscription et demeurent intacts (§68).

### 4.2 Réinscription unitaire — S08

```text
┌────────────────────────────────────────────┐
│ Réinscrire Nathan Fotso                    │
├────────────────────────────────────────────┤
│ Situation actuelle                         │
│   2026/2027 · 6e A · Actif                 │
│   Solde : 25 000 FCFA restants  ⚠          │
│                                            │
│ Réinscrire pour                            │
│   Année    [2027/2028 ▾]                   │
│   Niveau   [5e ▾]        (proposé : 5e)    │
│   Classe   [5e A ▾]      (42/60)           │
│   Régime   [Externe ▾]                     │
│   Date     [01/09/2027]                    │
│                                            │
│ ☑ Reporter les responsables                │
│ ☐ Créer un frais « Reliquat 2026/2027 »   │
│   de 25 000 FCFA sur la nouvelle année     │
│                                            │
│              [Annuler]  [Réinscrire]       │
└────────────────────────────────────────────┘
```

Le niveau suivant est proposé automatiquement via `grade_levels.order_index`. Le solde débiteur est affiché mais **ne bloque pas** — le blocage est une décision de l'établissement, pas du logiciel. La case « Reliquat » est le mécanisme explicite de report (voir [../04-REGLES-METIER-FINANCIERES.md](../04-REGLES-METIER-FINANCIERES.md) §10) ; elle n'agit qu'à partir de la Phase 06.

### 4.3 Réinscription en masse

```text
Étape 1 — Sélection
   Année source [2026/2027] → cible [2027/2028]
   Filtres : niveau, classe, statut, situation financière
   Liste avec cases à cocher, « tout sélectionner » sur le filtre courant

Étape 2 — Règles de promotion
   6e  → 5e   : classe [répartition automatique ▾ | 5e A | 5e B]
   5e  → 4e   : …
   3e  → 2nde : …
   Terminale  → [Diplômé (GRADUATED), pas de réinscription]

   Répartition automatique : équilibrage des effectifs, en conservant
   les groupes existants quand c'est possible

Étape 3 — Prévisualisation
   1 036 élèves à réinscrire · 12 en avertissement · 3 en erreur
   Tableau détaillé, désélection possible ligne à ligne

Étape 4 — Exécution
   Job asynchrone, progression, rapport final
```

Avertissements traités : solde débiteur, élève `INACTIVE`/`SUSPENDED`, classe cible saturée, absence de classe cible pour le niveau.

### 4.4 Assistant « Nouvelle année scolaire » (§68)

Enchaîne les étapes déjà construites en un seul parcours guidé :

```text
1. Créer l'année 2027/2028                     → Phase 02
2. Copier les niveaux                          → Phase 02
3. Copier les classes                          → Phase 02
4. Copier les structures tarifaires            → Phase 06 (étape désactivée ici)
5. Sélectionner et réinscrire les élèves       → cette phase
6. Affecter aux classes                        → cette phase
7. Créer les affectations de frais             → Phase 06
8. Activer l'année                             → Phase 02
```

Chaque étape indique clairement si elle est faite, en attente ou ignorée. L'assistant est **interruptible et reprenable** : préparer une rentrée prend des jours, pas une session de navigateur.

### 4.5 API

```
POST /api/v1/enrollments/reenroll               # unitaire
POST /api/v1/enrollments/bulk-reenroll/preview  # simulation, sans écriture
POST /api/v1/enrollments/bulk-reenroll          # exécution (job)
GET  /api/v1/enrollments/bulk-reenroll/:jobId   # progression
GET  /api/v1/academic-years/:id/rollover-status # état de l'assistant
```

---

## 5. Règles métier

1. Un import crée toujours les liens responsables en `PENDING`.
2. Un import ne modifie jamais un élève existant en V1 (mode création seule). Le mode « mise à jour » est une évolution ultérieure, trop risqué pour un premier usage.
3. La réinscription crée une nouvelle inscription et ne touche pas aux précédentes.
4. Un élève déjà inscrit pour l'année cible est ignoré (jamais dupliqué) — la contrainte d'unicité l'empêche de toute façon.
5. Un élève `GRADUATED` ou `TRANSFERRED` est exclu de la réinscription en masse.
6. La réinscription bascule l'ancienne inscription en `COMPLETED` (paramétrable : certains établissements préfèrent la laisser `ACTIVE` jusqu'à la clôture de l'année).
7. Un solde débiteur n'empêche pas la réinscription — il est signalé.
8. Les responsables sont repris par défaut, avec leur statut d'association préservé : un parent déjà `ACCEPTED` n'a pas à ré-accepter chaque année.

> Le point 8 mérite attention : l'association est portée par `(student_id, guardian_id)`, pas par l'inscription. Elle traverse donc naturellement les années. C'est le comportement correct — redemander une acceptation annuelle serait une régression d'usage.

---

## 6. Critères d'acceptation

- [ ] Le modèle Excel se télécharge, avec instructions et listes déroulantes
- [ ] Un fichier de 500 élèves + responsables s'importe en moins de 2 minutes
- [ ] Les cinq contrôles du §40 sont détectés et signalés avec un message actionnable
- [ ] Une classe inexistante propose une correspondance approchante
- [ ] Les lignes en erreur sont exportables, corrigeables et réimportables
- [ ] Deux responsables partageant un numéro dans le fichier produisent **un seul** `guardian`
- [ ] Les liens créés par import sont bien en `PENDING`
- [ ] Un import interrompu peut être repris
- [ ] La réinscription unitaire crée une inscription sans altérer la précédente
- [ ] Après réinscription, l'onglet Inscriptions affiche les deux années
- [ ] La réinscription en masse de 1 000 élèves aboutit en moins de 3 minutes, avec rapport
- [ ] La répartition automatique équilibre les effectifs
- [ ] Un élève déjà inscrit pour l'année cible est ignoré sans erreur
- [ ] L'assistant du §68 se suit de bout en bout, avec interruption et reprise
- [ ] Les paiements de l'année précédente restent intacts et consultables

---

## 7. Risques

| Risque | Impact | Parade |
|---|---|---|
| Import qui corrompt des données existantes | **Critique** | Mode création seule ; validation intégrale avant toute écriture ; transaction par lot |
| Doublons massifs d'élèves | Base inexploitable | Détection nom + prénom + date de naissance, confirmation explicite obligatoire |
| Fichiers Excel réels chaotiques (colonnes fusionnées, en-têtes sur 3 lignes, dates en texte) | Import impossible | Correspondance manuelle de colonnes ; parseur tolérant ; accompagner le premier import avec le client |
| Réinscription en masse lancée deux fois | Duplication | Contrainte d'unicité `(student_id, academic_year_id)` + verrou d'idempotence sur le job |
| Timeout HTTP sur les gros volumes | Échec silencieux | Tout ce qui dépasse 50 lignes passe en job asynchrone |
| Mauvaise répartition automatique | Rejet par la scolarité | Prévisualisation complète, modifiable ligne à ligne avant exécution |
