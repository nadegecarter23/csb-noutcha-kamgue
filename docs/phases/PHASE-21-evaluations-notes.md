# Phase 21 — Évaluations et notes

Statut : **Terminé** — 2026-10-02.

La phase livre les périodes académiques, types d’évaluation, compétences et règles de calcul versionnées. Le cahier de notes contrôle les barèmes, les absences et les droits de saisie, puis distingue brouillon, publication et verrouillage.

Règles consolidées :

- les périodes d’une même année ne se chevauchent pas et une seule période peut être ouverte ;
- le cycle est `DRAFT → OPEN → CLOSED`, sans retour arrière ; une clôture exige que toutes les évaluations soient verrouillées ;
- une évaluation reprend le coefficient par défaut de son type si aucun coefficient n’est fourni ;
- seules une matière active, une affectation de la classe et des inscriptions valides peuvent recevoir des notes ;
- les notes deviennent immuables après verrouillage ou clôture de la période ;
- la politique applicable est d’abord celle du cycle de la classe, puis la politique générale de l’année ;
- les absences sont soit exclues du calcul (`EXCLUDE`), soit comptées à zéro (`ZERO`).

Validation : contrats Zod testés, permissions séparées de lecture, gestion, saisie et publication, audit des écritures, contraintes SQL de cohérence, isolation RLS des tables de liaison, mode démonstration et build global validé.
