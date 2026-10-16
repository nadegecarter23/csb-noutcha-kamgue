# CSB-13 — Qualité continue et performance

Ce lot ajoute des garde-fous reproductibles avant toute mise en production du CSB.

## Parcours navigateur

Les tests Playwright couvrent trois profils d'affichage :

- bureau : ouverture du tableau de bord, identité CSB, périmètre actif, recherche globale et fermeture au clavier ;
- tablette : tiroir responsive, navigation vers les élèves et absence de débordement horizontal ;
- mobile : ouverture du menu, navigation vers les élèves et absence de débordement horizontal de la page.

Chaque parcours échoue en cas d'erreur JavaScript dans la console. Les exécuter avec :

```bash
pnpm e2e:web
```

En CI, les traces et captures d'échec sont conservées sept jours.

## Parcours natifs de l'application parent

Quatre flux Maestro couvrent la connexion, la navigation principale, l'accès à
l'association d'un enfant et la préparation d'un paiement. Le scénario de
paiement s'arrête avant la confirmation afin de ne créer aucune transaction.

Le contrôle local et la CI vérifient systématiquement la présence, l'identifiant
d'application et les étapes critiques des fichiers YAML :

```bash
pnpm --filter @cplan/mobile test
```

L'exécution sur un émulateur Android ou un terminal de recette nécessite
Maestro, une version installée de l'application et les identifiants d'un compte
parent de test transmis à l'exécution, jamais inscrits dans les scénarios :

```bash
maestro test \
  -e PARENT_PHONE=<telephone-parent> \
  -e PARENT_PASSWORD=<mot-de-passe-de-recette> \
  apps/mobile/.maestro
```

Cette exécution native reste obligatoire avant une publication sur les stores.

## Budget du client web

Le build refuse :

- tout chunk JavaScript supérieur à 500 Kio ;
- un total JavaScript supérieur à 950 Kio.

Commande :

```bash
pnpm --filter @cplan/web build:budget
```

## Charge de rentrée et de caisse

Le workflow GitHub Actions `Charge de rentrée CSB` est exclusivement manuel et protégé par l'environnement `preproduction`. Il nécessite les secrets `LOAD_API_URL`, `LOAD_ACCESS_TOKEN`, `LOAD_ENROLLMENT_ID` et, si nécessaire, `LOAD_SCOPE_UNIT_IDS`. Le jeton doit appartenir à un compte de charge disposant déjà d'une session de caisse ouverte.

Le déclencheur doit saisir exactement `PREPROD`. Le scénario exerce pendant 30 minutes le tableau comptable avec 50 utilisateurs virtuels. L'option `enable_payments` ajoute 200 encaissements par heure sur l'inscription dédiée. Les seuils sont : moins de 1 % d'échecs, p95 inférieur à 750 ms pour le tableau et inférieur à 1 000 ms pour les paiements.

L'option `enable_cash_close`, désactivée par défaut, clôture une seule fois la caisse dédiée après la charge. Cette action est irréversible : elle déclare volontairement des montants nuls avec un motif d'écart explicite afin d'exercer le calcul, le verrouillage et l'audit de clôture. Son statut doit être `CLOSED` et son p95 inférieur à 1 500 ms.

Le jeton doit appartenir à un compte de charge dédié, limité au périmètre d'essai. L'inscription cible, la caisse et les paiements créés doivent rester dans la base de préproduction, jamais dans la production. Utiliser une nouvelle session de caisse pour chaque exécution avec clôture.

La syntaxe du scénario peut être vérifiée sans installer k6 :

```bash
pnpm load:check
```

## Critère de passage

Une livraison est admissible en recette lorsque lint, types, tests, build avec budget et Playwright sont verts. Le test k6 est en plus obligatoire avant la rentrée scolaire ou une modification sensible de la caisse.
