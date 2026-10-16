# Sauvegarde et restauration PostgreSQL + fichiers

## Objectifs et responsabilités

Cette procédure couvre ensemble la base PostgreSQL et le bucket S3 privé. Une
sauvegarde n'est valide que si les deux jeux de données, leurs checksums et les
compteurs de contrôle appartiennent au même passage.

| Élément | Exigence |
|---|---|
| RPO | 24 h maximum ; activer le PITR du PostgreSQL managé pour réduire la perte |
| RTO | 4 h maximum jusqu'à validation et remise en lecture/écriture |
| Rétention | 30 sauvegardes quotidiennes et 12 preuves mensuelles de restauration |
| Stockage | compte/projet séparé, chiffrement au repos, accès exploitation uniquement |
| Responsable | exploitation produit la sauvegarde ; comptabilité valide les montants ; direction autorise la bascule |

Les secrets restent dans le gestionnaire de secrets. Aucun mot de passe, dump,
objet sauvegardé ou URL pré-signée ne doit entrer dans Git.

## Contenu d'une sauvegarde

Une sauvegarde locale créée par `infra/backup/backup-local.ps1` contient :

- `postgres.dump` : dump PostgreSQL au format custom, sans propriétaires ni privilèges ;
- `files/manifest.json` et `files/blobs/*` : clés, métadonnées, taille et SHA-256 de chaque objet S3 ;
- `control-counters.json` : compteurs métier définis par `control-counters.sql` ;
- `manifest.json` : version du format, source et SHA-256 des artefacts.

Le dossier `backups/` est ignoré par Git. Il sert uniquement au test local et
ne remplace pas le coffre de sauvegarde chiffré de production.

## Sauvegarde locale reproductible

Prérequis : PostgreSQL dans `cplan-postgres`, un endpoint S3 accessible et les
dépendances du workspace installées. Sous Windows :

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File infra\backup\backup-local.ps1 `
  -S3Endpoint http://127.0.0.1:9010 `
  -Bucket cplan-dev `
  -S3AccessKey $env:S3_ACCESS_KEY `
  -S3SecretKey $env:S3_SECRET_KEY
```

Le chemin du dossier créé est écrit sur la sortie standard. Copier ensuite ce
dossier vers le stockage de sauvegarde séparé, chiffré et immuable.

## Sauvegarde de production

1. Vérifier la dernière sauvegarde automatique du PostgreSQL managé et l'état du PITR.
2. Placer brièvement l'application en lecture seule si le fournisseur S3 ne permet pas un snapshot cohérent.
3. Produire un dump logique `pg_dump --format=custom --no-owner --no-privileges` avec un compte dédié en lecture.
4. Exporter tous les objets S3 avec leurs clés, tailles, types MIME, métadonnées et SHA-256. Conserver les versions si le bucket est versionné.
5. Exécuter `infra/backup/control-counters.sql` sur la même source.
6. Calculer SHA-256, signer le manifeste, chiffrer côté client ou avec une clé KMS dédiée, puis transférer dans un compte séparé.
7. Vérifier que les artefacts sont lisibles et appliquer la politique de rétention.
8. Lever le mode lecture seule et consigner l'heure, l'opérateur, l'identifiant du snapshot et le résultat.

## Restauration locale isolée

La commande ci-dessous crée une base `cplan_restore_verify_*` et un bucket
`cplan-restore-verify-*`, contrôle le résultat, puis les supprime. Elle refuse
donc de restaurer sur `cplan` ou `cplan-dev`.

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File infra\backup\verify-restore-local.ps1 `
  -BackupDirectory backups\AAAAMMJJTHHMMSSZ `
  -S3Endpoint http://127.0.0.1:9010 `
  -S3AccessKey $env:S3_ACCESS_KEY `
  -S3SecretKey $env:S3_SECRET_KEY
```

Le résultat attendu est `"status": "PASS"`, avec
`database_counters_match: true`. Les checksums sont vérifiés avant toute
restauration. Les objets sont revérifiés individuellement avant envoi.

## Reprise de production

1. Déclarer l'incident, geler les écritures et conserver journaux, callbacks et événements de paiement entrants.
2. Choisir le point de restauration selon l'heure du dernier paiement confirmé et documenter le RPO réel.
3. Restaurer PostgreSQL dans une **nouvelle** instance/base et les fichiers dans un **nouveau** bucket/prefixe.
4. Appliquer uniquement les migrations montantes compatibles avec la version applicative retenue.
5. Exécuter les compteurs de contrôle et exiger une égalité exacte avec l'instantané sauvegardé.
6. Vérifier `audit_discrepancies = 0`, puis tester connexion, consultation d'un élève, reçu PDF et téléchargement d'un fichier.
7. Faire valider les totaux financiers par la comptabilité et un échantillon de dossiers par le secrétariat.
8. Basculer les secrets/connexions vers les nouvelles cibles, démarrer en lecture seule, refaire les contrôles, puis autoriser les écritures.
9. Rejouer et rapprocher les transactions reçues après le point restauré. Ne jamais les réinjecter sans idempotence.
10. Conserver les anciennes cibles en lecture seule jusqu'à clôture de l'incident.

## Test périodique

Exécuter une restauration isolée chaque mois et avant toute migration
structurelle. La preuve doit contenir : identifiant de sauvegarde, horodatages,
RPO/RTO observés, résultat des checksums, compteurs avant/après, test d'accès à
un fichier et approbations exploitation/comptabilité.

En 2026, les images Docker publiques MinIO Community ne sont plus distribuées.
Le `docker-compose` construit donc localement le serveur et le client depuis des
tags source officiels figés dans `infra/docker/minio/`. Les scripts de sauvegarde
restent indépendants de `mc` : ils passent par l'API S3 avec le SDK de
l'application et demeurent compatibles avec tout fournisseur S3.
