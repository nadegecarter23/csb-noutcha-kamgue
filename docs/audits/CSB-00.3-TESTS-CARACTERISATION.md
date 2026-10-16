# CSB-00.3 — Tests de caractérisation avant cloisonnement

Date : **2026-10-11**

## Objectif

Figer les comportements scolaires et financiers actuels qui seront volontairement modifiés par les phases de cloisonnement CSB. Ces tests décrivent l'existant ; ils ne valident pas encore les futures règles par cycle, section ou filière.

## Scénario de référence ajouté

Le fichier `apps/api/src/__tests__/csb-current-behavior.integration.test.ts` construit un établissement comportant :

- une année scolaire active ;
- un niveau primaire (`CM2`) et un niveau secondaire actuel (`6e`, enum `COLLEGE`) ;
- une classe et un élève dans chacun de ces deux cycles ;
- une structure de frais commune de 100 000 FCFA ;
- deux situations financières partiellement payées.

## Comportements figés

1. **Liste scolaire globale** — sans filtre de classe, le service élèves retourne actuellement les élèves des deux cycles de l'établissement ; un filtre de classe réduit correctement le résultat.
2. **Consolidation financière globale** — les dashboards et regroupements additionnent actuellement tous les cycles : 200 000 FCFA attendus, 100 000 FCFA encaissés et 100 000 FCFA de solde.
3. **Recherche et exports globaux** — la recherche et l'export `STUDENTS_LIST` couvrent les deux cycles ; l'export par classe reste correctement limité à la classe demandée.
4. **Paiement multi-cycle actuel** — un paiement unique de 100 000 FCFA peut actuellement cibler deux inscriptions appartenant à des cycles différents, produire deux allocations et un seul reçu.

Le quatrième comportement est intentionnellement caractérisé comme une dette : `CSB-06` devra inverser cette attente et exiger qu'un paiement, ses allocations, son reçu et sa session de caisse appartiennent à un seul cycle.

## Vérifications

| Vérification | Résultat |
|---|---|
| Test ciblé Vitest | 4 tests sur 4 réussis |
| Suite API complète | 177 tests sur 177 réussis, 19 fichiers |
| Typecheck API | Réussi |
| Lint API | Réussi |
| Formatage du nouveau test | Conforme à Prettier |

## Utilisation future

Lors de l'introduction des portées :

- les trois premiers tests devront être complétés par des variantes utilisateur limité/global ;
- le test de paiement multi-cycle devra être remplacé par un refus explicite et transactionnel ;
- les totaux consolidés devront rester égaux à la somme exacte des cycles autorisés ;
- les tests d'isolation entre établissements existants devront rester verts sans modification.
