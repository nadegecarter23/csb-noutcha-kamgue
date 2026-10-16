# Recette finale — Phase 17

La recette est exécutée en staging sur une copie anonymisée. Chaque cas conserve l’identifiant de requête, les captures utiles, le résultat attendu et la signature du métier.

## Douze parcours obligatoires

1. Administrateur : création d’année, niveaux, classes et utilisateurs.
2. Scolarité : création d’un élève, inscription, responsables et frais affectés.
3. Import : classeur avec lignes valides, doublons, téléphones invalides, validation puis exécution.
4. Comptable : consultation du tableau de bord, état par classe et export.
5. Parent : connexion, enfants autorisés uniquement, détail et échéancier.
6. Parent : Mobile Money réussi, reçu visible et notification reçue.
7. Caissier : ouverture, paiement espèces, reçu, clôture et rapprochement.
8. Parent : déclaration externe avec preuve, correction puis validation comptable.
9. Comptable : réallocation puis extourne ; aucun montant historique n’est modifié.
10. Direction : remise à double validation, agrégats et journal d’audit.
11. Isolation : identifiants d’une autre école renvoient 404 sans révéler de données.
12. Résilience : webhook dupliqué, nouvelle tentative réseau et clé d’idempotence ne créent qu’un paiement.

Les parcours web 1, 2, 4, 7, 9, 10, 11 et 12 sont automatisés dans la suite Vitest/API ; les parcours mobiles 5, 6 et 8 utilisent `apps/mobile/.maestro`. La charge utilise `tests/load/k6-school-opening.js` : 50 utilisateurs pendant 30 minutes et 200 paiements/heure, avec moins de 1 % d’erreurs et un p95 inférieur à 750 ms.

## Contrôle individuel §88

Pour 20 élèves tirés au hasard, rapprocher manuellement et par requête : identité complète, classe et année, frais nets, somme des allocations de paiements réussis moins extournes, détail des transactions, solde de `v_enrollment_balance`, responsables acceptés et opérations d’audit associées. Toute différence bloque la mise en production.

## Critère de sortie

Zéro anomalie critique/majeure, sauvegarde restaurée, tests CI verts, métier signataire, support et astreinte confirmés. Les anomalies mineures ont un propriétaire et une échéance.
