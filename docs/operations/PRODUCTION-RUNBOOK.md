# Exploitation, mise en production et retour arrière

## Socle de production

- PostgreSQL managé, haute disponibilité, chiffrement, sauvegarde quotidienne et PITR ; rétention 30 jours.
- Deux API derrière le reverse proxy, worker séparé, Redis AOF persistant, bucket S3 privé/versionné avec chiffrement.
- TLS uniquement sur les domaines web/API, secrets injectés par le gestionnaire de secrets, rôle runtime `cplan_app` distinct du propriétaire de migration.
- Prometheus lit `/metrics`; erreurs applicatives vers Sentry et logs structurés centralisés conservés 90 jours.

## Avant bascule

Valider la configuration de production, CORS, DNS/TLS, callbacks opérateurs, SMS/e-mail, bucket privé, migrations, alertes, charge, recette signée, restauration réelle d’une sauvegarde et formation. Vérifier qu’aucun compte ou secret de test n’existe.

## Bascule

Geler la source, sauvegarder, migrer/valider les données, fusionner la pull request `main` → `production` (Railway exécute `migrate deploy` en pré-déploiement de l’API, avant son démarrage), faire les smoke tests, ouvrir progressivement puis surveiller métriques, journaux et rapprochements. `main` va automatiquement en recette ; la branche protégée `production`, fusionnée uniquement après approbation et CI verte, alimente la production Railway et Vercel.

## Retour arrière

Déclencheurs : corruption ou fuite, erreurs > 2 %, paiement/solde divergent, indisponibilité prolongée. Fermer les écritures, conserver logs et événements, redéployer l’image précédente. Ne jamais rétrograder le schéma à l’aveugle : si la migration n’est pas rétrocompatible, restaurer la sauvegarde/PITR dans une nouvelle base, valider, puis commuter. Informer utilisateurs et opérateurs, rapprocher toutes les transactions reçues pendant l’incident.

## Sauvegarde et restauration

Une tâche quotidienne produit une sauvegarde chiffrée avec checksum dans un compte séparé. Un test de restauration mensuel mesure RPO/RTO, exécute migrations, contrôles de cohérence, échantillon §88 et documente la preuve. Objectifs : RPO 24 h maximum (PITR réduit la perte) et RTO 4 h.

La procédure exécutable, les cibles isolées et les compteurs d'acceptation sont décrits dans [`BACKUP-RESTORE.md`](BACKUP-RESTORE.md).

## Après lancement

J0–J7 : point matin/soir, suivi des paiements, files, SLA et tickets. J8–J30 : revue hebdomadaire, optimisation et formation de rattrapage. Propriétaires : exploitation pour disponibilité/sauvegardes, comptabilité pour rapprochement, direction pour arbitrage, DPO/référent sécurité pour incidents.
