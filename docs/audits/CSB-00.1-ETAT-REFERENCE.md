# CSB-00.1 — État de référence technique et fonctionnel

Date de vérification : **2026-10-11**  
Périmètre : monorepo `cplan` avant toute adaptation métier propre au CSB Noutcha KAMGUE.

## Résumé

Le socle applicatif est fonctionnel et reproductible après restauration des dépendances et régénération du client Prisma. Le pipeline principal est vert : lint, typecheck, tests et build réussissent. Le schéma PostgreSQL est à jour et le seed de démonstration est idempotent sur deux exécutions consécutives.

Deux écarts de qualité non bloquants sont enregistrés : la machine utilise Node.js 24 alors que le projet cible Node.js 22, et le contrôle Prettier signale 152 fichiers historiques. Aucun changement métier n'a été appliqué pendant cet audit.

## Environnement observé

| Élément | Valeur observée | Référence attendue | État |
|---|---:|---:|---|
| Node.js | `v24.21.0` | `>=22`, cible de build `node22` | Écart à corriger pour reproduire la production |
| pnpm | `10.33.2` | `10.33.2` | Conforme |
| PostgreSQL | 16, conteneur `healthy`, port `5442` | PostgreSQL 16 | Conforme |
| Redis | conteneur `healthy`, port `6389` | Redis 7 | Conforme |
| Mailpit | conteneur `healthy`, ports `1035`/`8035` | Mailpit local | Conforme |

Sous PowerShell, le shim `pnpm.ps1` est bloqué par la politique d'exécution de la machine. Les commandes de référence utilisent donc `pnpm.cmd`, sans modification de la politique système.

## Vérifications exécutées

| Contrôle | Commande | Résultat |
|---|---|---|
| Dépendances | `pnpm.cmd install --frozen-lockfile` | Réussite, 1 031 paquets restaurés depuis le lockfile |
| Client Prisma | `pnpm.cmd db:generate` | Réussite, Prisma Client `6.19.3` généré |
| Lint + types + tests | `pnpm.cmd check` | Réussite, 15 tâches sur 15 |
| Tests API | inclus dans `pnpm.cmd check` | 173 tests, 18 fichiers, tous réussis |
| Tests contrats | inclus dans `pnpm.cmd check` | 26 tests, 6 fichiers, tous réussis |
| Tests domaine | inclus dans `pnpm.cmd check` | 74 tests, 5 fichiers, tous réussis |
| Tests web | inclus dans `pnpm.cmd check` | 5 tests, 1 fichier, tous réussis |
| Total automatisé | somme des suites | **278 tests réussis** |
| Build | `pnpm.cmd build` | API et web réussis ; mobile délégué à EAS comme prévu |
| Schéma Prisma | `prisma validate` | Valide |
| Migrations | `node scripts/prisma.mjs migrate status` | 30 migrations, base à jour |
| Seed | `pnpm.cmd db:seed`, exécuté deux fois | Réussite deux fois, volumes identiques, 56 familles de données non vides |
| Format | `pnpm.cmd format:check` | Échec documenté : 152 fichiers à reformater |

## Photographie fonctionnelle

- Schéma de données : **89 modèles** et **68 enums** Prisma.
- API : **28 fichiers de routes métier** sous `apps/api/src/modules`.
- Web : **21 répertoires fonctionnels**, couvrant notamment scolarité, pédagogie, présences, évaluations, bulletins, personnel, finance, caisse, achats, communication, services, reporting, exports, audit et administration.
- Mobile parent : authentification, associations enfant-parent, consultation, paiements et notifications ; le script de test courant rappelle que la recette mobile de bout en bout est portée par Maestro/EAS.
- Données de démonstration : 50 élèves, 7 niveaux, 9 classes, 7 dossiers de personnel, 6 bulletins, 3 reçus et 56 familles de données vérifiées.

## Écarts et risques enregistrés

1. **Version Node non alignée.** Les vérifications passent sous Node 24, mais la CI et les images doivent continuer d'utiliser Node 22 jusqu'à validation explicite d'une montée de version.
2. **Dette de formatage.** Prettier signale 152 fichiers. Une réécriture globale n'est pas incluse dans l'audit afin d'éviter un diff massif sans valeur métier ; elle devra être traitée dans un lot isolé.
3. **Bundle web principal.** Vite produit un chunk principal de `659,71 kB` (`186,85 kB` gzip) et émet un avertissement au-delà de 500 kB. Les routes lourdes déjà différées limitent une partie du coût, mais un découpage supplémentaire est à prévoir.
4. **Cache Turbo historique.** Certains journaux rejoués proviennent de l'ancien chemin `D:\Mes_projets_ia\school_fees_app`. Les tâches sensibles API/web ont été rejouées dans le chemin actuel ; pour une mesure de performance propre, purger `.turbo` dans un lot dédié.
5. **Commande Prisma directe.** `prisma migrate status` sans l'enveloppe du projet utilise volontairement une URL factice de build. Toute opération de migration doit passer par `apps/api/scripts/prisma.mjs` ou les scripts pnpm prévus.

## Conclusion

`CSB-00.1` est terminé : l'état de référence est vert pour le pipeline applicatif et les écarts restants sont explicitement documentés. La prochaine tâche est `CSB-00.2`, l'inventaire détaillé des tables, endpoints et écrans à adapter au cloisonnement par cycle, section linguistique, filière et classe.
