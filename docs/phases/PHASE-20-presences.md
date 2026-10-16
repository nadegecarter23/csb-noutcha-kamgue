# Phase 20 — Présences et assiduité

Statut : **livrée et validée**.

## Objectif

Effectuer l’appel à partir d’un cours publié, suivre absences et retards par inscription annuelle, traiter les justificatifs et prévenir les responsables autorisés.

## Modèle

- `attendance_sessions` : une feuille d’appel par cours planifié et par date, d’abord en brouillon puis validée.
- `attendance_records` : une ligne par inscription active avec statut, minutes de retard, observation, justificatif et horodatage de l’alerte.

## API

- `GET|POST /api/v1/attendance/sessions`
- `PUT /api/v1/attendance/sessions/:id/records`
- `POST /api/v1/attendance/sessions/:id/validate`
- `PATCH /api/v1/attendance/records/:id/justification`

## Invariants

- L’appel référence toujours une inscription de la classe et de l’année du cours.
- Un seul appel existe pour un cours et une date ; la date doit correspondre au jour planifié.
- Un appel validé est figé. Le traitement ultérieur porte uniquement sur le justificatif.
- La validation déclenche une notification dédupliquée pour chaque absence ou retard vers les responsables acceptés qui autorisent les notifications.
- Chaque création, enregistrement, validation et décision de justificatif est auditée et isolée par établissement.
