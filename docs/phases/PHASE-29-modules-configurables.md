# Phase 29 — Modules configurables par établissement

## Objectif

Permettre à l’administrateur d’activer ou désactiver les domaines fonctionnels utilisés par son établissement, sans supprimer les données ni modifier les rôles.

## Fonctionnement

- Le catalogue contient 14 modules : référentiel scolaire, élèves, pédagogie, présences, évaluations, frais, paiements, achats, vie scolaire, personnel, communication, services, portails et reporting.
- L’absence de configuration signifie « activé », ce qui préserve tous les établissements existants après migration.
- Seul un utilisateur disposant de `settings.update` peut modifier un module.
- Tous les utilisateurs authentifiés peuvent lire la configuration afin d’adapter leur navigation.
- La désactivation masque les menus et fait refuser les API concernées, même si le jeton contient encore une permission correspondante.
- Les données restent en base et redeviennent immédiatement accessibles après réactivation.

## Dépendances

Activer un module active automatiquement ses prérequis. Désactiver un prérequis désactive ses modules dépendants. Par exemple, désactiver « Élèves et inscriptions » désactive aussi les présences, les évaluations, la facturation, la vie scolaire, la communication, les services et les portails.

## API

- `GET /api/v1/modules` : état courant du catalogue.
- `PATCH /api/v1/modules/:code` : activation ou désactivation, réservé à `settings.update`.

## Sécurité et audit

Le contrôle est exécuté côté API dans la garde de permission. Le masquage du menu améliore l’expérience mais ne constitue pas la barrière de sécurité. Chaque changement est journalisé avec le module demandé, l’état souhaité et les modules modifiés par dépendance.

## Migration

`20261005090000_school_modules` crée `school_module_settings`, isolée par `school_id`. Aucune donnée métier n’est supprimée lors d’une désactivation.
