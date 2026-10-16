# Phase 18 — Référentiel pédagogique

## Objectif

Donner à l’établissement une source de vérité pour répondre à la question : « qui enseigne quelle matière, dans quelle classe, pour quel volume hebdomadaire ? »

## Modèle et API

- `subjects` : référentiel des matières par établissement.
- `teaching_assignments` : lien annuel entre classe, matière et enseignant.
- `GET /api/v1/pedagogy/overview`
- `GET|POST /api/v1/subjects`
- `PATCH /api/v1/subjects/:id` (code, libellé, couleur et activation).
- `POST /api/v1/teaching-assignments` (création ou mise à jour de l’affectation unique classe–matière).

## Règles métier

- La classe appartient à l’année scolaire envoyée.
- La matière et l’enseignant actif appartiennent au même établissement.
- Une seule affectation existe pour un triplet année–classe–matière.
- Une affectation sans enseignant reste `PLANNED`; avec enseignant elle devient `ACTIVE`.
- Le volume hebdomadaire est compris entre 1 et 40 heures.
- Le coefficient de matière est propre à l’affectation classe–matière et doit être strictement positif.
- Une matière inactive ne peut plus recevoir de nouvelle affectation ni d’évaluation ; ses affectations actives sont désactivées, sans supprimer l’historique.

## Suite

La Phase 19 utilisera ces affectations pour produire les créneaux d’emploi du temps et détecter les conflits de classe, d’enseignant et de salle.
