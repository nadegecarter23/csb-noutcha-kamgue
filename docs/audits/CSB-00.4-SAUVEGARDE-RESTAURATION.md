# CSB-00.4 — Sauvegarde et restauration

## Livrables

- procédure d'exploitation : `docs/operations/BACKUP-RESTORE.md` ;
- sauvegarde locale : `infra/backup/backup-local.ps1` ;
- restauration isolée : `infra/backup/verify-restore-local.ps1` ;
- export/restauration S3 fournisseur-agnostique : `infra/backup/object-store.mjs` ;
- checksums SHA-256 et manifeste versionné pour chaque jeu de sauvegarde.

## Preuve du test du 11 octobre 2026

Le test a utilisé PostgreSQL 16 local et un endpoint S3 éphémère contenant un
objet de 9 554 octets. La sauvegarde a été restaurée dans des cibles générées,
distinctes des sources :

```json
{
  "status": "PASS",
  "database_counters_match": true,
  "file_objects": 1,
  "file_size_bytes": 9554
}
```

Les SHA-256 ont été contrôlés avant restauration. Les compteurs PostgreSQL
étaient identiques après `pg_restore`. Le bucket et la base temporaires ont été
supprimés après le test ; les sources n'ont jamais été écrasées.

Le premier essai a détecté une différence de taille causée par l'envoi en flux
avec encodage segmenté de l'émulateur. L'envoi a été corrigé pour utiliser le
buffer binaire contrôlé, puis le test complet a réussi. Cette détection confirme
que le contrôle ne se contente pas du succès HTTP de la copie.
