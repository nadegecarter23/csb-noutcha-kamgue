# ADR-021 — Référentiel organisationnel et périmètres d’accès

- Statut : accepté
- Date : 2026-10-11
- Décideurs : direction CSB et équipe produit
- Phases : CSB-01, CSB-02, CSB-03

## Contexte

Le produit isolait déjà les établissements, mais ne distinguait pas les quatre
composantes du CSB, leurs sections linguistiques, leurs filières ni les classes
auxquelles un employé est affecté. L’ancien enum `EducationCycle` séparait
collège et lycée et ne représentait pas la crèche.

Le rôle fonctionnel répond à « que peut faire cet utilisateur ? ». Il ne doit
pas répondre à « sur quelles données peut-il le faire ? ». Mélanger ces deux
questions conduirait à multiplier les rôles (`COMPTABLE_PRIMAIRE`,
`COMPTABLE_SECONDAIRE`, etc.) et rendrait les contrôles incomplets.

## Décision

### Référentiel

Les noms définitifs sont :

- `OrganizationalUnit` : une des unités `CRECHE`, `MATERNELLE`, `PRIMAIRE`, `SECONDAIRE` ;
- `LanguageSection` : section `FRANCOPHONE` ou `ANGLOPHONE`, rattachée à une unité ;
- `EducationTrack` : filière `GENERAL` ou `TECHNIQUE`, rattachée uniquement au secondaire ;
- `GradeLevel` : niveau rattaché à une unité ;
- `Class` : classe annuelle rattachée obligatoirement à une unité et une section, et à une filière pour le secondaire.

Collège et lycée sont des subdivisions pédagogiques du secondaire, pas des
périmètres d’accès autonomes. Ils pourront être représentés ultérieurement par
les niveaux ou une subdivision sans modifier ce modèle.

### Affectations et autorisations

- `StaffAssignment` décrit l’affectation opérationnelle d’un membre du personnel ;
- `UserAccessScope` décrit les données qu’un compte peut consulter ou modifier ;
- les portées sont cumulatives et peuvent viser `SCHOOL`, `UNIT`,
  `LANGUAGE_SECTION`, `TRACK`, `CLASS` ou `OWN_ASSIGNMENTS` ;
- un rôle reste une collection de permissions, indépendante des portées ;
- toute modification de portée révoque immédiatement les sessions du compte.

Les JWT ne contiennent pas la liste des classes. Ils restent courts et portent
uniquement l’identité, la session, l’établissement, les rôles et permissions.
Les portées sont relues côté serveur pendant l’authentification de chaque
requête, ce qui rend une modification effective sans attendre l’expiration du
jeton.

### Double barrière

L’API résout un `EffectiveAccessScope` central. Chaque transaction positionne
`app.user_id` en plus de `app.school_id`. PostgreSQL applique ensuite la RLS aux
ancrages de classe et aux données héritées. Les routes parent conservent leur
autorisation fondée sur les associations enfant-parent.

Une absence d’utilisateur dans le contexte est réservée aux migrations, tests
de service et jobs internes explicitement lancés hors requête. Une route HTTP
protégée doit toujours passer par `authenticate` puis `requireSchoolContext`.

## Invariants de base

1. Toute classe active possède une unité et une section actives.
2. Le niveau et la classe appartiennent à la même unité.
3. La section et la filière appartiennent à la même unité que la classe.
4. Une classe non secondaire ne possède aucune filière.
5. Une classe secondaire possède une filière générale ou technique.
6. Une portée ne renseigne que la cible correspondant à son type.
7. Une cible de portée appartient au même établissement que le compte.
8. Les colonnes utilisées par les clés étrangères et les filtres RLS sont indexées.

Ces invariants sont vérifiés en base, pas seulement par Zod ou l’interface.

## Migration des données historiques

`COLLEGE` et `LYCEE` sont fusionnés vers `SECONDAIRE`. Les niveaux existants
reçoivent l’unité correspondante. Le jeu de démonstration historique ne portait
aucune information linguistique ni de filière ; son backfill est explicitement
journalisé comme `FRANCOPHONE` + `GENERAL` afin de permettre la migration. Une
base réelle doit exporter et faire valider ce rapport de classement avant la
bascule ; aucun classement automatique ne doit être considéré comme une donnée
officielle sans validation humaine.

## Conséquences

- les listes, recherches, agrégats, PDF et exports partagent le même périmètre ;
- les clés de cache client incluent le périmètre actif lorsqu’un filtre est sélectionné ;
- les traitements asynchrones doivent conserver un instantané ou une provenance de portée ;
- les requêtes RLS utilisent des fonctions `STABLE SECURITY DEFINER` et des
  index composites pour éviter une vérification coûteuse par ligne ;
- les référentiels réellement globaux au CSB restent visibles avec la permission fonctionnelle adéquate.
