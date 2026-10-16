# Revue de sécurité et non-régression CSB-11

La défense repose sur quatre couches : permission de route, établissement du jeton, portée organisationnelle relue à chaque requête, puis RLS PostgreSQL. Les mutations financières utilisent idempotence, transactions et audit append-only. Les paiements, allocations, reçus et journaux ne sont pas supprimables par le rôle applicatif.

La recette couvre les unités, sections, filières, affectations propres, caisses et séquences de reçus. Les recherches, rapports et exports réutilisent les mêmes contraintes serveur. Les sauvegardes sont vérifiées dans des cibles isolées avec compteurs avant/après.

Avant production : rotation de tous les secrets, suppression des comptes de démonstration, test de restauration récent, contrôle TLS/CORS, validation des callbacks opérateurs, analyse des dépendances, test de charge, signature de la recette métier et attribution d’un responsable d’incident.
