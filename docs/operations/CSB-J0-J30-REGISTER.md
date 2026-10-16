# Registre de surveillance J0–J30 — CSB-12.7

Ce registre est ouvert le jour de la mise en production. Il conserve les contrôles, décisions et signatures sans recopier de secret ni de donnée personnelle d'élève. Référencer les tickets et rapports privés par leur identifiant.

## Cadence et responsabilités

| Période | Cadence minimale | Participants | Validation |
|---|---|---|---|
| J0–J7 | matin et soir | exploitation, administrateur IT, économe | point quotidien direction |
| J8–J30 | une fois par semaine | exploitation, économe, support | revue hebdomadaire direction |

L'exploitation contrôle disponibilité, erreurs, files et sauvegardes. L'économe valide paiements, caisses, reçus et rapprochements. Le support suit les tickets et formations de rattrapage. La direction arbitre les incidents majeurs et signe le bilan final.

## État initial J0

- Date et heure d'ouverture :
- Version ou commit :
- Responsable de bascule :
- Sauvegarde pré-bascule et checksum :
- Rapport de restauration :
- Rapport de charge :
- Recette métier signée :
- Compteurs de référence : élèves ___ ; inscriptions ___ ; paiements ___ ; reçus ___ ; solde attendu ___ ; solde encaissé ___ ; solde restant ___

## Fiche de contrôle à dupliquer

- Jour/période :
- Date et heure :
- Contrôleur :
- Fenêtre : matin / soir / hebdomadaire

| Contrôle | Mesure ou résultat | Seuil attendu | Statut | Preuve/ticket |
|---|---|---|---|---|
| `/health` et `/health/ready` |  | HTTP 200 | Vert / Orange / Rouge |  |
| Erreurs API |  | aucune hausse inexpliquée | Vert / Orange / Rouge |  |
| Files de notifications |  | pas de backlog hors SLA | Vert / Orange / Rouge |  |
| Paiements en investigation |  | tous affectés à un propriétaire | Vert / Orange / Rouge |  |
| Rapprochement financier |  | écart = 0 FCFA ou écart documenté | Vert / Orange / Rouge |  |
| Séquences de reçus |  | aucune collision ni rupture inexpliquée | Vert / Orange / Rouge |  |
| Sessions et clôtures de caisse |  | aucune session oubliée | Vert / Orange / Rouge |  |
| Sauvegarde |  | dernier job réussi et restaurable | Vert / Orange / Rouge |  |
| Tickets utilisateurs |  | critiques/majeurs pris en charge | Vert / Orange / Rouge |  |

Décision : `Poursuivre` / `Poursuivre sous surveillance` / `Déclencher incident` / `Activer le repli`.

Actions avant le prochain contrôle :

| Action | Propriétaire | Échéance | Ticket | État |
|---|---|---|---|---|
|  |  |  |  |  |

Signatures : exploitation __________ ; économe __________ ; direction si requise __________.

## Bilan J30

- Disponibilité mesurée :
- Nombre d'incidents critiques/majeurs/mineurs :
- Écarts financiers ouverts :
- Tickets encore ouverts avec acceptation explicite :
- Restaurations testées et date de la plus récente :
- Formations de rattrapage réalisées :
- Décision de sortie de surveillance renforcée : `Oui` / `Non`

Signatures : administrateur IT __________ ; économe __________ ; direction __________ ; date __________.

CSB-12.7 ne peut être clôturé qu'après J30, avec tous les contrôles renseignés, les écarts financiers signés et les incidents restants formellement acceptés.
