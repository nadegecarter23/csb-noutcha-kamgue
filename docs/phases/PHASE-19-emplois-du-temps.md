# Phase 19 — Emplois du temps

Statut : **livrée et validée**.

## Objectif

Planifier les cours hebdomadaires à partir des affectations pédagogiques, sans collision de classe, d’enseignant ou de salle.

## Modèle

- `timetable_rooms` : salles propres à l’établissement, capacité et état.
- `timetable_entries` : affectation, classe, salle, jour, heures et état `DRAFT`, `PUBLISHED` ou `CANCELLED`.

## API

- `GET|POST /api/v1/timetable/rooms`
- `GET|POST /api/v1/timetable/entries`
- `POST /api/v1/timetable/entries/:id/cancel`
- `POST /api/v1/timetable/publish`

## Invariants

- Le créneau et son affectation appartiennent à la même année et au même établissement.
- La fin est strictement postérieure au début.
- Deux créneaux actifs ne se chevauchent jamais pour une même classe, une même salle ou un même enseignant.
- La suppression physique est interdite : un créneau est annulé et reste auditable.
- Seuls les créneaux publiés seront visibles dans les portails élève et parent.
