# Objectifs — système complet de gestion d’établissement

Ces objectifs sont ordonnés par dépendance métier. Un objectif est terminé lorsque le modèle, l’API, les permissions, l’audit, l’interface responsive, les données de démonstration et les contrôles automatisés associés sont livrés.

## O1 — Organiser les enseignements et le temps

**Portée :** matières, affectations, salles et emplois du temps.

**Critères de fin :** aucune classe, aucun enseignant et aucune salle ne peuvent avoir deux cours qui se chevauchent ; l’emploi du temps est consultable par classe et enseignant ; les brouillons peuvent être publiés.

Statut : **livré — référentiel, salles, planification, conflits, publication et vues responsives validés**.

## O2 — Suivre la présence des élèves

**Portée :** appel par cours ou journée, absences, retards, justificatifs, validation et notification des responsables.

**Dépend de :** O1, car l’appel s’attache à un créneau planifié et à une inscription annuelle.

Statut : **livré — appel par cours, retards, validation, justificatifs et alertes familles validés**.

## O3 — Mesurer les apprentissages

**Portée :** périodes, évaluations, barèmes, notes, compétences, pondérations et calculs de moyenne versionnés.

**Dépend de :** référentiel pédagogique et inscriptions.

Statut : **livré — périodes, types, compétences, règles versionnées, cahier de notes, publication et verrouillage validés**.

## O4 — Produire et publier les bulletins

**Portée :** appréciations, moyennes, rangs configurables, conseils de classe, décisions et PDF figés.

**Dépend de :** O3.

Statut : **livré — calcul pondéré sur 20, rangs ex æquo, appréciations, décisions, publication figée et PDF validés**.

## O5 — Piloter la vie scolaire

**Portée :** discipline, incidents, sanctions, convocations, infirmerie et suivi confidentiel.

**Dépend de :** O2 pour consolider assiduité et comportement.

Statut : **livré — incidents, mesures disciplinaires, clôture et infirmerie avec permissions confidentielles séparées**.

## O6 — Administrer le personnel

**Portée :** dossiers RH, fonctions, contrats, services, charges horaires, congés, absences et documents.

**Dépend de :** O1 pour rapprocher contrat, fonction et charge d’enseignement.

Statut : **livré — dossiers, contrats, charge planifiée, alertes de surcharge, congés et décisions validés**.

## O7 — Relier l’école et les familles

**Portée :** annonces, messagerie, calendrier, devoirs, pièces jointes et notifications multicanales.

**Dépend de :** O2, O4 et O5 pour transmettre les événements publiés.

Statut : **livré — annonces ciblées, calendrier, devoirs et messages internes réunis dans un centre unique**.

## O8 — Gérer les services de l’établissement

**Portée :** bibliothèque, cantine, transport et stocks, avec facturation optionnelle vers le noyau financier.

**Dépend de :** élèves, inscriptions et structure financière déjà livrés.

Statut : **livré — bibliothèque, prêts et retours, cantine, lignes de transport et stocks avec seuils d’alerte**.

## O9 — Fournir les portails par acteur

**Portée :** espace enseignant, espace élève et application parent enrichie.

**Dépend de :** tous les objectifs précédents ; chaque portail expose uniquement les données autorisées et publiées.

Statut : **livré — portail adaptatif enseignant, famille et élève, limité aux classes, enfants et contenus publiés autorisés**.

## O10 — Maîtriser les achats et décaissements

**Portée :** fournisseurs, catégories, demandes et bons d’achat, dépenses, justificatifs, approbations, réceptions, échéances, paiements et sorties de caisse.

**Dépend de :** noyau financier, caisse, stockage privé, RBAC et audit.

Statut : **livré — cycle achat-facture-paiement, séparation des tâches, paiements partiels, encours fournisseurs et rapprochement de caisse validés**.

## O11 — Adapter les modules à chaque établissement

**Portée :** catalogue des domaines fonctionnels, activation et désactivation par établissement, dépendances, contrôle serveur, navigation dynamique et audit.

**Dépend de :** paramètres d’établissement, RBAC et journal d’audit.

Statut : **livré — 14 modules configurables, données conservées, dépendances automatiques et blocage API indépendant des permissions**.
