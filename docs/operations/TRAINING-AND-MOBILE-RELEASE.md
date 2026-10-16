# Formation et publication mobile

## Programme de formation — CSB-12.4

Les exercices sont réalisés en staging avec des données synthétiques. Aucun secret de production ne doit apparaître dans les supports, captures ou feuilles de présence.

| Session | Public | Durée cible | Exercices obligatoires |
|---|---|---:|---|
| Administration et scolarité | administrateur IT, scolarité, secrétariats | 3 h | premier accès, année/niveaux/classes, compte invité, élève, inscription, responsable, import |
| Comptabilité et caisse | économe, comptables, caissiers par cycle | 3 h | ouverture de caisse, encaissement, reçu, recherche, clôture, rapprochement, extourne et escalade |
| Direction et responsables de cycle | direction, principal, directrices et responsables | 2 h | changement de périmètre, tableaux de bord, état par classe, remise, export et audit |
| Support informatique | administrateur IT et suppléant | 3 h | comptes, rôles, périmètres, santé des services, sauvegarde/restauration, incident et repli |

### Déroulé commun

1. Vérifier l'identité du participant et son périmètre attendu.
2. Faire exécuter le premier accès et, pour le compte bootstrap, le changement obligatoire du mot de passe.
3. Présenter uniquement les modules accessibles au rôle concerné.
4. Faire réaliser les exercices sans partager de compte.
5. Noter chaque exercice `Acquis`, `À revoir` ou `Non réalisé`.
6. Ouvrir un ticket pour toute anomalie ; ne jamais la contourner avec des droits supplémentaires permanents.
7. Faire signer le participant et le formateur.

### Fiche de session à dupliquer

- Session :
- Environnement et URL :
- Date, début et fin :
- Formateur :
- Validateur métier :
- Version ou commit déployé :

| Participant | Fonction | Cycle/périmètre | Présent | Exercice pratique | Résultat | Signature |
|---|---|---|---|---|---|---|
|  |  |  | Oui / Non |  | Acquis / À revoir / Non réalisé |  |

| Incident ou question | Sévérité | Propriétaire | Échéance | Ticket | Décision |
|---|---|---|---|---|---|
|  |  |  |  |  |  |

Décision de session : `Validée` / `Rattrapage requis` / `Bloquée`.

Signatures : formateur __________ ; validateur métier __________ ; date __________.

La preuve de clôture de CSB-12.4 comprend les quatre fiches signées, les résultats des exercices, les tickets associés et la liste des rattrapages terminés. Les douze parcours de référence sont détaillés dans [ACCEPTANCE-PLAN.md](ACCEPTANCE-PLAN.md).

## Publication mobile

Pour Android/iOS : builds signés par CI, canaux internal → beta → production, captures et politique de confidentialité validées, liens universels testés, rollout progressif 10/25/50/100 %. Les mises à jour OTA ne modifient que le JavaScript compatible ; tout changement natif passe par les stores. L’API expose une version compatible et la configuration de publication fixe une version minimale, avec message de mise à jour obligatoire pour les versions vulnérables.
