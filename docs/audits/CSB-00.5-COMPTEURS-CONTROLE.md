# CSB-00.5 — Compteurs de contrôle

La requête exécutable `infra/backup/control-counters.sql` retourne un document
JSON déterministe, trié par établissement. Il est capturé avant sauvegarde et
comparé après restauration.

| Domaine | Compteurs |
|---|---|
| Élèves | total, actifs |
| Inscriptions | total, actives |
| Paiements | total, réussis, extournés, montant net du grand livre |
| Reçus | total, non annulés |
| Soldes | à payer, payé, reste ; nombre d'écarts avec la vue d'audit |
| Personnel | total, actif |
| Notes | total |
| Bulletins | total, publiés |
| Fichiers | métadonnées en base et somme des tailles déclarées |

Les montants sont exprimés en FCFA/XAF. Le montant des paiements additionne les
écritures `SUCCESS` et `REVERSED`, conformément au grand livre actuel. Les
soldes proviennent exclusivement de `v_enrollment_balance`. Toute valeur non
nulle de `audit_discrepancies` bloque la restauration ou la migration.

## Référence observée le 11 octobre 2026

Pour l'établissement `CPLAN` : 50 élèves actifs, 50 inscriptions actives,
40 paiements dont 39 réussis, 3 reçus actifs, 10 500 000 XAF dus,
5 700 000 XAF payés, 4 800 000 XAF restant dus, 7 personnels actifs,
18 notes, 6 bulletins et zéro divergence de solde.

Cette photographie décrit les données locales de démonstration à l'instant du
test ; elle n'est pas une valeur métier attendue en production. Seule l'égalité
entre l'avant et l'après constitue le critère d'acceptation.
