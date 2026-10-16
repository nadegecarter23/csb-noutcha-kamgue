# Mise en service du CSB Noutcha KAMGUE

## Environnements et responsabilités

`development` utilise Docker local ; `staging` (Railway + Vercel Preview) reçoit automatiquement la branche `main` avec données anonymisées ; `production` (Railway + Vercel Production) est déployée par la fusion approuvée d'une pull request de `main` vers la branche protégée `production`. Voir [DEPLOY-VERCEL-RAILWAY.md](DEPLOY-VERCEL-RAILWAY.md). Les secrets sont distincts, stockés hors dépôt et renouvelés au minimum chaque année.

La direction valide la bascule. L’administrateur informatique gère identités, domaines et incidents. L’économe contrôle soldes, caisses et rapprochements. Chaque responsable de cycle valide ses effectifs, classes et emplois du temps.

## Bascule

Geler la source, sauvegarder et vérifier la restauration, importer en staging, signer la réconciliation, créer le compte administrateur initial avec mot de passe temporaire obligatoire puis inviter les autres comptes nominatifs par OTP, déployer les migrations puis API/worker/web, exécuter les smoke tests et ouvrir progressivement par cycle.

## Surveillance J0–J30

Contrôler matin et soir disponibilité, erreurs, files de notifications, paiements bloqués, écarts de rapprochement, séquences de reçus et clôtures. J0–J7 : point quotidien direction/économe/IT. J8–J30 : revue hebdomadaire, formation de rattrapage et traitement des écarts documentés. Consigner chaque contrôle et le bilan signé dans [CSB-J0-J30-REGISTER.md](CSB-J0-J30-REGISTER.md).

Les procédures détaillées sont dans `PRODUCTION-RUNBOOK.md`, `INCIDENT-RESPONSE.md`, `BACKUP-RESTORE.md`, `DATA-MIGRATION.md` et `TRAINING-AND-MOBILE-RELEASE.md`.
