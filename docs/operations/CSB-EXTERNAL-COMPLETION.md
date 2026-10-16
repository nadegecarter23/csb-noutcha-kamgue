# Données externes requises pour terminer les tâches CSB

Ce document regroupe uniquement les décisions et opérations qui ne peuvent pas être déduites du code. Il ne doit contenir aucun mot de passe, jeton ou secret en clair. Les secrets sont saisis directement dans GitHub, Railway, Vercel ou le gestionnaire de secrets retenu.

## 1. Identité officielle — CSB-09.1

À faire valider par la direction :

| Élément | Valeur de travail | Validation attendue |
|---|---|---|
| Nom officiel | Complexe Scolaire Bilingue Noutcha KAMGUE | Oui / correction |
| Nom court | CSB Noutcha KAMGUE | Oui / correction |
| Sigle | CSB-NK | Oui / correction |
| Devise | Apprendre · Persévérer · Réussir | Oui / correction |
| Signature | L’école des génies | Oui / correction |
| Adresse | Dogpassi, Douala, Cameroun | Adresse postale complète |
| Téléphone public | Non fourni | Numéro officiel au format international |
| E-mail public | Non fourni | Boîte officielle administrée par le CSB |
| Logo officiel | Blason public intégré dans les applications | Validation de la direction |
| Logo maître | PNG public haute définition disponible | Fichier SVG/PDF maître à fournir pour l'impression professionnelle |

Preuve de clôture : validation datée de la direction et mise à jour de `docs/brand/IDENTITE-CSB-NK.md`.

## 2. Identifiants et domaines — CSB-09.5

La compatibilité actuelle conserve `@cplan/*`, le schéma `cplan://` et les noms de bases. Les choix suivants restent à confirmer :

| Usage | Proposition | Décision attendue |
|---|---|---|
| Application web | `app.<domaine-csb>` | Domaine possédé par le CSB |
| API | `api.<domaine-csb>` | Domaine possédé par le CSB |
| E-mail transactionnel | `no-reply@<domaine-csb>` | Domaine et expéditeur vérifiés |
| Support | `support@<domaine-csb>` | Boîte et responsable |
| Identifiant Android | `cm.cplan.app` | Conserver ou remplacer avant publication |
| Identifiant iOS | `cm.cplan.app` | Conserver ou remplacer avant publication |
| Liens universels | `https://app.<domaine-csb>` | Domaine et fichier d'association |

Preuve de clôture : DNS/TLS actifs, expéditeur vérifié, liens universels testés et décision mobile archivée.

## 3. Préproduction et charge — CSB-11.8

Créer l'environnement GitHub `preproduction`, puis renseigner sans les copier dans ce document :

- `LOAD_API_URL` ;
- `LOAD_ACCESS_TOKEN` d'un compte de charge dédié ;
- `LOAD_ENROLLMENT_ID` d'une inscription synthétique ;
- `LOAD_SCOPE_UNIT_IDS` si le compte est limité à certains cycles ;
- variable facultative `LOAD_PAYMENT_AMOUNT`.

Avant le lancement : ouvrir une session de caisse dédiée, vérifier que les données sont synthétiques et laisser `enable_cash_close=false` au premier essai. Déclencher ensuite le workflow **Charge de rentrée CSB** avec la confirmation exacte `PREPROD`.

Preuve de clôture : rapport k6 conservé, moins de 1 % d'échecs, p95 tableau inférieur à 750 ms, p95 paiement inférieur à 1 000 ms et rapprochement financier sans divergence.

## 4. Environnements et services — CSB-12.1 et CSB-12.2

Pour `staging` et `production`, fournir ou créer :

- projet Railway, PostgreSQL, Redis, bucket privé, service API et worker ;
- projet Vercel et domaines correspondants ;
- identifiants MTN MoMo et Orange Money ;
- fournisseur SMS et clés ;
- serveur SMTP et expéditeur validé ;
- canaux d'alertes et destinataires d'astreinte ;
- politique de sauvegarde et stockage secondaire.

Les valeurs doivent être distinctes entre staging et production. La production doit refuser le mode de paiement factice et désactiver le mode démonstration.

Le déploiement suit uniquement Vercel + Railway (voir [DEPLOY-VERCEL-RAILWAY.md](DEPLOY-VERCEL-RAILWAY.md)) : `main` alimente la recette, la branche protégée `production` alimente la production, et l'option Railway **Wait for CI** bloque tout commit dont la CI échoue. Avant chaque mise en production, exporter les variables Railway et exécuter `pnpm deployment:validate --file <fichier> --target <staging|production>`, qui refuse toute valeur fictive.

Preuve de clôture : `/health` et `/health/ready` verts, smoke tests web/API/mobile, sauvegarde puis restauration réelle, alertes testées et inventaire des secrets signé sans exposer leurs valeurs.

## 5. Comptes nominatifs — CSB-12.3

Pour chaque personne, fournir : prénom, nom, téléphone E.164, e-mail, fonction, cycle/section/filière autorisés et responsable validant l'accès. Le premier lot minimal couvre :

- direction ou promoteur ;
- administrateur informatique ;
- économe/comptable ;
- caissier de chaque cycle ;
- responsable de chaque cycle ;
- scolarité ;
- support de démarrage.

Le compte administrateur initial créé par le bootstrap reçoit un secret temporaire transmis hors messagerie courante. Il est automatiquement limité au profil, au changement de mot de passe et à la déconnexion jusqu'à sa rotation. Les autres comptes sont créés sans mot de passe : chaque employé reçoit un OTP d'invitation par SMS et choisit lui-même son secret. Tester ensuite le périmètre de chaque compte et supprimer tout compte de démonstration de la production.

Le mécanisme local est couvert par un test d'intégration complet : connexion avec le secret temporaire, refus `403` d'une autre opération, changement du mot de passe, levée du blocage et conservation de la session courante.

Preuve de clôture externe : matrice nominative signée, invitations effectivement reçues, connexions et périmètres testés, rotation du compte initial constatée et journal d'audit vérifié.

## 6. Formation — CSB-12.4

Planifier quatre sessions distinctes : administration/scolarité, comptabilité/caisse, direction/responsables de cycle et support informatique. Pour chaque session, conserver : date, formateur, participants, présence, exercice pratique, incidents rencontrés et validation finale.

Exercices minimaux : connexion, changement de périmètre, inscription, encaissement, impression d'un reçu, clôture, rapprochement, export, association parent et escalade d'incident.

Support d'exécution : dupliquer la fiche de session de [TRAINING-AND-MOBILE-RELEASE.md](TRAINING-AND-MOBILE-RELEASE.md) pour chacun des quatre groupes.

Preuve de clôture : feuilles de présence et résultats des exercices signés.

## 7. Surveillance de rentrée — CSB-12.7

La période J0–J7 exige deux contrôles quotidiens ; J8–J30 exige une revue hebdomadaire. Relever au minimum : disponibilité, erreurs API, files de notifications, paiements en investigation, écarts de rapprochement, séquences de reçus, sessions de caisse, sauvegardes et tickets utilisateurs.

Support d'exécution : utiliser [CSB-J0-J30-REGISTER.md](CSB-J0-J30-REGISTER.md) dès l'ouverture de la production.

Preuve de clôture : journal J0–J30 complet, incidents clos ou acceptés, rapprochement signé par l'économe et bilan final validé par la direction.

## Ordre d'exécution

1. Valider l'identité et les domaines.
2. Créer staging et y exécuter smoke tests, restauration et charge.
3. Créer les comptes et former les utilisateurs sur staging.
4. Provisionner production et effectuer la bascule contrôlée.
5. Surveiller J0–J30 et signer le bilan.
