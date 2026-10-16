# Extension vers un système complet de gestion scolaire

Le noyau financier et administratif existant reste la source de vérité pour les élèves, les inscriptions, les responsables et les paiements. L’extension pédagogique s’ancre sur les mêmes entités permanentes : `students` pour l’identité, `enrollments` pour l’année scolaire et `classes` pour le groupe d’apprentissage.

## Parcours de livraison

| Phase | Domaine | Résultat attendu | Statut |
|---|---|---|---|
| 18 | Référentiel pédagogique | Matières, enseignants, affectations par classe, volumes horaires | **Terminé** |
| 19 | Emplois du temps | Créneaux, salles, détection des conflits, vues classe/enseignant | **Terminé** |
| 20 | Présences | Appel par cours, absences, retards, justificatifs et alertes parents | **Terminé** |
| 21 | Évaluations | Périodes, types d’évaluation, barèmes, notes et compétences | **Terminé** |
| 22 | Bulletins | Moyennes, rangs, appréciations, décisions et PDF | **Terminé** |
| 23 | Vie scolaire | Discipline, incidents, sanctions, infirmerie et suivi | **Terminé** |
| 24 | Personnel | Dossiers RH, contrats, congés et charges | **Terminé** |
| 25 | Communication | Annonces, messagerie, devoirs et calendrier | **Terminé** |
| 26 | Services | Bibliothèque, cantine, transport et stocks | **Terminé** |
| 27 | Portails | Espaces enseignant, élève et famille | **Terminé** |
| 28 | Dépenses, achats et fournisseurs | Demandes, approbations, commandes, réceptions et paiements | **Terminé** |
| 29 | Modules configurables | Activation des modules et réglages propres à chaque établissement | **Terminé** |

## Invariants d’architecture

- Une note, une présence ou un bulletin référence toujours une `enrollment`, jamais uniquement un élève.
- Un cours planifié référence une affectation pédagogique, une classe, une matière et un enseignant.
- Les règles de calcul des moyennes sont versionnées par année scolaire et par cycle.
- Toutes les tables métier portent `school_id` et appliquent la même politique RLS que le noyau existant.
- Les parents ne voient que les inscriptions reliées par une association acceptée.
- Les publications sensibles (bulletin, sanction, absence) sont auditées et disposent d’un état brouillon/publié.

## Phase 18 livrée

La première tranche introduit `subjects` et `teaching_assignments`, trois permissions dédiées, les gardes API, l’audit, l’isolation multi-établissement et le centre web **Pédagogie**. Les administrateurs, la direction et la scolarité peuvent gérer les matières et les affectations ; les enseignants disposent d’un accès en lecture au centre pédagogique.

Cette phase prépare directement les emplois du temps : une affectation est l’unité qui relie une matière, une classe, un enseignant, une année scolaire et un volume hebdomadaire.
