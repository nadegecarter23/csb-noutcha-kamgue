# Déployer CSB Noutcha KAMGUE sur Vercel et Railway

Architecture cible :

- **Vercel** sert le dashboard Vite/React depuis `apps/web` ;
- **Railway API** exécute `dist/server.js` et expose le domaine public ;
- **Railway Worker** exécute `dist/worker.js`, sans domaine public ;
- PostgreSQL, Redis et le stockage objet sont des services managés Railway.

C'est l'**unique stratégie de déploiement** du projet. Railway et Vercel
déploient directement depuis GitHub ; il n'existe ni serveur SSH, ni image web
nginx, ni `docker-compose` de production. `infra/docker/docker-compose.yml`
sert uniquement au développement local.

## Environnements et promotion

| Environnement | Branche GitHub | Railway | Vercel | Données |
|---|---|---|---|---|
| Recette (`staging`) | `main` | environnement `staging` | déploiements Preview de `main` | synthétiques ou anonymisées |
| Production | `production` | environnement `production` | Production Branch = `production` | réelles |

Règles :

1. Dans chaque service Railway, activer **Wait for CI** : un commit n'est
   déployé que si le workflow `CI` est vert.
2. Protéger la branche `production` dans GitHub : fusion uniquement par pull
   request depuis `main`, approbation obligatoire de la direction technique et
   CI verte. Cette fusion est l'acte de mise en production.
3. Chaque environnement Railway possède ses propres services PostgreSQL, Redis,
   Bucket et ses propres secrets. Aucune valeur n'est partagée entre recette et
   production.
4. Après chaque mise en production, vérifier `/health/ready` et exécuter les
   smoke tests de [PRODUCTION-RUNBOOK.md](PRODUCTION-RUNBOOK.md).

## 1. Préparer Railway

Dans un nouveau projet Railway :

1. Ajouter une base **PostgreSQL** nommée `Postgres`.
2. Ajouter un service **Redis** nommé `Redis`.
3. Ajouter un **Bucket** nommé `Storage`, dans la région la plus proche disponible.
4. Ajouter le dépôt GitHub du projet comme service et le nommer `csb-api`.

Paramètres du service `csb-api` :

| Paramètre | Valeur |
|---|---|
| Branche | `main` en recette, `production` en production |
| Root Directory | `/` |
| Dockerfile Path | `/infra/docker/Dockerfile.api` |
| Pre-deploy Command | `node scripts/prisma.mjs migrate deploy` |
| Start Command | laisser vide, le Dockerfile lance `node dist/server.js` |
| Healthcheck Path | `/health` |
| Healthcheck Timeout | `300` secondes |
| Restart Policy | `ON_FAILURE` |

Le healthcheck de déploiement utilise la liveness `/health`, qui répond sans
attendre les dépendances. La disponibilité complète reste consultable sur
`/health/ready`.

Générer ensuite un domaine public dans **Settings > Networking**.

> Railway a déprécié `railway.json` et `railway.toml` pour les nouveaux
> services. Les réglages ci-dessus se font dans le Dashboard. Après avoir lié le
> projet avec la CLI récente, `railway config init` peut capturer
> l'infrastructure dans `.railway/railway.ts`. Toujours examiner
> `railway config plan` avant `railway config apply`.

## 2. Variables Railway

Le modèle prêt à copier se trouve dans `apps/api/.env.railway.example`.
Dans **Variables > Raw Editor**, adapter les noms des services et les domaines.

Correspondances principales :

```dotenv
DATABASE_URL=postgresql://cplan_app:${{shared.CPLAN_APP_DB_PASSWORD}}@${{Postgres.PGHOST}}:${{Postgres.PGPORT}}/${{Postgres.PGDATABASE}}
DATABASE_MIGRATION_URL=${{Postgres.DATABASE_URL}}
REDIS_URL=${{Redis.REDIS_URL}}
S3_ENDPOINT=${{Storage.ENDPOINT}}
S3_REGION=${{Storage.REGION}}
S3_BUCKET=${{Storage.BUCKET}}
S3_ACCESS_KEY_ID=${{Storage.ACCESS_KEY_ID}}
S3_SECRET_ACCESS_KEY=${{Storage.SECRET_ACCESS_KEY}}
S3_FORCE_PATH_STYLE=false
```

Railway injecte automatiquement `PORT`. L’API utilise cette valeur et écoute
avec `HOST=0.0.0.0` afin d'être accessible sur le réseau Railway.

Générer `JWT_SECRET` localement, puis coller uniquement le résultat dans une
variable scellée Railway :

```bash
node -e "console.log(require('node:crypto').randomBytes(48).toString('base64url'))"
```

`CORS_ORIGINS` doit contenir les origines exactes autorisées, séparées par une
virgule, sans chemin :

```dotenv
CORS_ORIGINS=https://VOTRE-PROJET.vercel.app,https://app.votre-domaine.cm
```

Ne pas autoriser toutes les URL de Preview Vercel avec un joker. Ajouter une
origine de preview précise uniquement lorsqu'elle doit réellement accéder à
l'API de production.

### Rôle PostgreSQL applicatif (obligatoire)

Le compte `postgres` fourni par Railway est super-utilisateur et propriétaire
des tables : il **contourne la RLS**. Connectée avec lui, l'API ne cloisonnerait
plus les établissements ni les cycles, et les pièces financières redeviendraient
supprimables. L'API refuse donc de démarrer en production avec ce compte, et
`pnpm deployment:validate` le signale.

À faire **une fois par environnement**, de préférence avant le premier
déploiement de l'API (le script reste valable sur une base déjà migrée) :

1. Générer un mot de passe fort et l'enregistrer dans Railway comme variable
   partagée `CPLAN_APP_DB_PASSWORD` (**Project Settings > Shared Variables**).
2. Copier l'URL publique propriétaire du service Postgres
   (`DATABASE_PUBLIC_URL`, onglet **Variables** du service), puis exécuter
   depuis la racine du dépôt :

```bash
psql "$DATABASE_PUBLIC_URL" -v app_password="$CPLAN_APP_DB_PASSWORD" \
     -f infra/railway/create-runtime-role.sql
```

   Sans `psql` installé, la même commande passe par Docker :

```bash
docker run --rm -i postgres:16-alpine psql "$DATABASE_PUBLIC_URL" \
  -v app_password="$CPLAN_APP_DB_PASSWORD" -f - < infra/railway/create-runtime-role.sql
```

3. Vérifier la dernière ligne affichée : `super_utilisateur = f`,
   `contourne_rls = f`, `tables_possedees = 0`.

Le script est idempotent : le rejouer avec un nouveau mot de passe effectue une
rotation (mettre ensuite à jour la variable partagée et redéployer).

## 3. Worker Railway

Créer un second service depuis le même dépôt et le nommer `csb-worker`.

| Paramètre | Valeur |
|---|---|
| Branche | identique au service API de l'environnement |
| Root Directory | `/` |
| Dockerfile Path | `/infra/docker/Dockerfile.api` |
| Start Command | `node dist/worker.js` |
| Pre-deploy Command | vide — les migrations sont exécutées par l’API |
| Public Networking | désactivé |
| Healthcheck | désactivé |

Partager avec lui les mêmes variables PostgreSQL, Redis, Bucket, paiement et
notification que l’API, y compris `DATABASE_URL` sur le rôle `cplan_app` : le
worker applique le même garde-fou au démarrage. Garder un seul worker tant que les tâches ne possèdent
pas de verrou distribué explicite.

## 4. Préparer Vercel

Importer le dépôt GitHub du projet dans Vercel. Garder la
**Root Directory à la racine du dépôt**, car `apps/web` dépend de paquets situés
dans `packages/`. Dans **Settings > Git**, définir `production` comme
Production Branch.

Le fichier `vercel.json` configure déjà :

- l’installation pnpm verrouillée ;
- `pnpm --filter @cplan/web build` ;
- le répertoire produit `apps/web/dist` ;
- le fallback React Router vers `index.html` ;
- le cache immuable des assets générés ;
- les principaux en-têtes de sécurité.

Ajouter dans Vercel, pour Production et Preview :

```dotenv
VITE_API_BASE_URL=https://VOTRE-API.up.railway.app/api/v1
VITE_ENABLE_DEMO_MODE=false
```

Les variables `VITE_*` sont publiques dans le JavaScript du navigateur. Elles
ne doivent contenir aucun secret. Le mode démo est explicitement désactivé en
production afin qu'un échec réseau ne connecte jamais un compte fictif.

Sur Vercel, le build **échoue volontairement** si `VITE_API_BASE_URL` manque ou
n'est pas une URL HTTPS se terminant par `/api/v1`, ou si le mode démo est
activé en production : sans ce contrôle, le dashboard serait publié mais
incapable de joindre l'API.

## 5. Initialiser la première école et son administrateur

Une fois les migrations terminées, renseigner temporairement dans le service API
les variables `BOOTSTRAP_*` du modèle, avec un mot de passe unique d'au moins
16 caractères. Ouvrir un shell Railway sur le service API et exécuter :

```bash
node dist/bootstrap.js
```

Le bootstrap crée les permissions, les rôles système, l'école et son premier
administrateur. Il peut être relancé sans dupliquer ces données et ne remplace
pas le mot de passe d'un administrateur déjà créé.

Après le succès, supprimer au minimum `BOOTSTRAP_ADMIN_PASSWORD` des variables
Railway, puis redéployer le service pour qu'il ne reste pas dans son environnement.

Le seeder de démonstration est bloqué en production. Pour une plateforme de
staging seulement, définir temporairement `ALLOW_DEMO_SEED=true`, exécuter
`node scripts/seed.mjs`, puis remettre immédiatement la variable à `false`.
Sur Railway, il est préférable de ne pas modifier la variable du service et de
l'activer uniquement pour la commande distante :

```bash
railway ssh --service csb-api -- env ALLOW_DEMO_SEED=true node scripts/seed.mjs
```

## 6. Ordre du premier déploiement

Avant toute migration ou changement de variables, exporter les variables du
service API dans un fichier temporaire hors dépôt, les contrôler sans afficher
leurs secrets, puis supprimer le fichier :

```bash
railway variables --service csb-api --environment production --kv > /tmp/csb-api.env
pnpm deployment:validate --file /tmp/csb-api.env --target production
rm /tmp/csb-api.env
```

Remplacer `production` par `staging` pour la recette. Le contrôle refuse
notamment les placeholders, les origines CORS locales ou non HTTPS, les secrets
JWT trop courts, le mode de paiement factice et une configuration Mobile Money
partielle. Ne fusionner vers `production` qu'après un contrôle réussi.

1. Provisionner PostgreSQL, Redis et le Bucket Railway.
2. Créer le rôle `cplan_app` (section « Rôle PostgreSQL applicatif ») et la
   variable partagée `CPLAN_APP_DB_PASSWORD`.
3. Configurer les variables de l’API et du worker, puis les contrôler avec
   `pnpm deployment:validate`.
4. Déployer l’API (le pré-déploiement applique les migrations avec le compte
   propriétaire) et générer son domaine public.
5. Exécuter le bootstrap de production.
6. Déployer Vercel avec `VITE_API_BASE_URL` pointant vers cette API.
7. Ajouter le domaine Vercel définitif à `CORS_ORIGINS`, puis redéployer l’API.
8. Démarrer le worker.
9. Vérifier :

```text
https://VOTRE-API.up.railway.app/health
https://VOTRE-API.up.railway.app/health/ready
https://VOTRE-PROJET.vercel.app/login
```

### Récupérer une première migration Railway échouée

L'environnement Docker local crée deux rôles PostgreSQL (`cplan` et
`cplan_app`). Une base managée Railway ne les crée pas automatiquement. Les
migrations CSB Noutcha KAMGUE appliquent désormais les permissions propres à `cplan_app`
uniquement lorsque ce rôle existe.

Si une ancienne révision a déjà échoué avec `P3018` et
`role "cplan_app" does not exist`, corriger aussi l'état de la base avant de
redéployer :

- **Base de premier déploiement, sans aucune donnée à conserver :** supprimer
  le service PostgreSQL Railway concerné, en créer un nouveau, vérifier que
  `DATABASE_URL` et `DATABASE_MIGRATION_URL` référencent ce nouveau service,
  puis redéployer l'API avec la version corrigée. C'est la récupération la plus
  sûre, car la migration interrompue a pu créer une partie de ses objets.
- **Base contenant déjà des données :** ne pas la supprimer et ne pas lancer
  `migrate reset`. Sauvegarder la base, terminer ou annuler manuellement les
  étapes déjà exécutées, puis réconcilier l'historique avec
  `node scripts/prisma.mjs migrate resolve --applied 20260819185105_identity_and_access`
  ou `--rolled-back` selon la stratégie choisie. Cette opération doit être
  préparée à partir de l'état réel de la base ; marquer simplement la migration
  comme annulée ne retire pas les objets déjà créés.

Après récupération, le pre-deploy Railway exécute normalement :

```bash
node scripts/prisma.mjs migrate deploy
```

## 7. Prérequis métier avant la production réelle

Deux garde-fous sont volontaires :

- `PAYMENT_PROVIDER_MODE=fake` est refusé quand `NODE_ENV=production` ;
- sans fournisseur SMS réel, l'API démarre avec le fournisseur `DISABLED`, mais
  chaque opération exigeant un SMS échoue explicitement et aucun OTP n'est
  écrit dans les logs.

Avant le passage en production, configurer les identifiants MTN/Orange, brancher
le fournisseur SMS choisi, renseigner SMTP et remplacer toutes les valeurs
`CONFIGURER_*` ou `VOTRE_*` du modèle Railway.

## 8. Application Expo

Lors d’un build mobile de production, définir aussi :

```dotenv
EXPO_PUBLIC_API_URL=https://VOTRE-API.up.railway.app/api/v1
```

Sans cette variable, Expo utilise automatiquement l’API locale du poste en mode
développement.

## Documentation officielle

- [Vercel — monorepos](https://vercel.com/docs/monorepos)
- [Vercel — projets Vite](https://vercel.com/docs/frameworks/frontend/vite)
- [Railway — Infrastructure as Code](https://docs.railway.com/infrastructure-as-code)
- [Railway — Dockerfiles](https://docs.railway.com/builds/dockerfiles)
- [Railway — healthchecks](https://docs.railway.com/deployments/healthchecks)
