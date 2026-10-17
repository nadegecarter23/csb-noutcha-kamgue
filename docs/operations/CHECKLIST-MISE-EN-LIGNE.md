# Check-list de mise en ligne — Railway + Vercel

Résumé opérationnel de [DEPLOY-VERCEL-RAILWAY.md](DEPLOY-VERCEL-RAILWAY.md), à
dérouler dans l'ordre pour chaque environnement (recette `staging`, puis
`production`). Cocher chaque ligne ; ne jamais copier de secret dans ce fichier.

## 0. Préalables

- [ ] Code poussé sur GitHub (`main` pour la recette, `production` pour la production).
- [ ] CI verte sur le commit à déployer.
- [ ] Comptes Railway et Vercel ouverts, reliés au dépôt GitHub.
- [ ] Identifiants Mobile Money disponibles (sandbox MTN MoMo acceptable en recette ;
      le mode de paiement factice est refusé dès que `NODE_ENV=production`).
- [ ] Serveur SMTP et expéditeur validés.

## 1. Railway — infrastructure

- [ ] Projet Railway créé, environnement `staging` (puis `production`).
- [ ] Service **PostgreSQL** `Postgres`.
- [ ] Service **Redis** `Redis`.
- [ ] **Bucket** `Storage`.

## 2. Railway — rôle de base restreint (obligatoire)

- [ ] Mot de passe fort généré, enregistré en variable partagée `CPLAN_APP_DB_PASSWORD`.
- [ ] Script exécuté avec l'URL publique propriétaire :
      `psql "$DATABASE_PUBLIC_URL" -v app_password="$CPLAN_APP_DB_PASSWORD" -f infra/railway/create-runtime-role.sql`
- [ ] Résultat affiché : `super_utilisateur f · contourne_rls f · tables_possedees 0`.

## 3. Railway — service API `csb-api`

| Réglage | Valeur |
|---|---|
| Source | dépôt GitHub, branche `main` (recette) ou `production` |
| Dockerfile Path | `/infra/docker/Dockerfile.api` |
| Pre-deploy Command | `node scripts/prisma.mjs migrate deploy` |
| Healthcheck Path | `/health` (timeout 300 s) |
| Wait for CI | activé |

- [ ] Variables collées depuis `apps/api/.env.railway.example`, placeholders remplacés.
- [ ] `JWT_SECRET` généré (`node -e "console.log(require('node:crypto').randomBytes(48).toString('base64url'))"`).
- [ ] Variables contrôlées : `railway variables --service csb-api --kv > /tmp/csb.env`,
      `pnpm deployment:validate --file /tmp/csb.env --target staging`, puis `rm /tmp/csb.env`.
- [ ] Premier déploiement réussi ; domaine public généré.
- [ ] `/health` et `/health/ready` répondent `200` (PostgreSQL, Redis, stockage `up`).

## 4. Premier administrateur

- [ ] Variables `BOOTSTRAP_*` renseignées temporairement.
- [ ] `railway ssh --service csb-api -- node dist/bootstrap.js` → « Bootstrap terminé ».
- [ ] `BOOTSTRAP_ADMIN_PASSWORD` supprimée, service redéployé.
- [ ] Connexion de l'administrateur : changement de mot de passe imposé, puis accès normal.

## 5. Vercel — dashboard web

- [ ] Projet importé depuis GitHub, **Root Directory = racine du dépôt**.
- [ ] Production Branch = `production`.
- [ ] `VITE_API_BASE_URL=https://<domaine-api>/api/v1` et `VITE_ENABLE_DEMO_MODE=false`
      (Production et Preview). Sans elles, le build échoue volontairement.
- [ ] Déploiement réussi ; page `/login` affichée.
- [ ] Domaine Vercel ajouté à `CORS_ORIGINS` de l'API, API redéployée.
- [ ] Connexion depuis le navigateur réussie.

## 6. Railway — worker `csb-worker`

- [ ] Même dépôt, même Dockerfile, Start Command `node dist/worker.js`.
- [ ] Mêmes variables que l'API (dont `DATABASE_URL` sur `cplan_app`).
- [ ] Public Networking et healthcheck désactivés ; un seul réplica.

## 7. Recette fonctionnelle

- [ ] Un compte par profil créé et son périmètre attribué (cycle, section…).
- [ ] Chaque profil ne voit que son périmètre (ex. responsable du primaire : classes du primaire seulement).
- [ ] Encaissement, reçu PDF, clôture de caisse, bulletin PDF, budget et dépense testés.
- [ ] Sauvegarde puis restauration testées (`docs/operations/BACKUP-RESTORE.md`).

## Encore bloquant pour l'usage réel

- **SMS** : aucun fournisseur n'est branché ; en production chaque envoi échoue
  (invitations du personnel, inscription des parents, mot de passe oublié).
- **E-mails et notifications push** : simulés, non envoyés.
- **Application mobile** : pas encore de configuration de build (`eas.json`) ;
  `EXPO_PUBLIC_API_URL` devra pointer vers l'API Railway.
