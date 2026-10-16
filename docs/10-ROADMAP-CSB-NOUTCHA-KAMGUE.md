# Roadmap de transformation — CSB Noutcha KAMGUE

> **Document directeur et registre de reprise.** Lorsqu'une instruction demande
> « commence », « continue » ou « poursuis le projet », ouvrir ce fichier, lire
> d'abord la section **État de reprise**, puis reprendre la première tâche non
> terminée de la phase active. Mettre ce fichier à jour à chaque séance de travail.

## État de reprise

| Champ | Valeur |
|---|---|
| Projet cible | Plateforme de gestion complète du Complexe Scolaire Bilingue Noutcha KAMGUE |
| Phase active | Clôture externe de `CSB-09`, `CSB-11` et `CSB-12` |
| Prochaine tâche | Collecter les validations et accès listés dans `docs/operations/CSB-EXTERNAL-COMPLETION.md`, puis exécuter `CSB-11.8` en préproduction |
| Dernière tâche terminée | `CSB-09.7 — Vérifier visuellement tous les écrans et documents générés` |
| Dernière mise à jour | 2026-10-16 |
| Bloquants actuels | `CSB-11.8` attend l'URL, le jeton, l'inscription et la caisse dédiés de préproduction ; `CSB-09.1`, `CSB-09.5` et les validations externes de `CSB-12` attendent les paramètres réels du CSB |

### Légende des statuts

- `[ ]` à faire
- `[~]` en cours
- `[x]` terminé et vérifié
- `[!]` bloqué — la raison doit être inscrite à côté

### Règles de reprise

1. Lire les décisions métier et les invariants de ce document avant de modifier le code.
2. Reprendre la tâche marquée `[~]`. S'il n'y en a aucune, prendre la première tâche `[ ]` de la phase active.
3. Ne commencer une phase que lorsque les critères de sortie de ses prérequis sont validés.
4. Après chaque lot, exécuter les vérifications adaptées, inscrire le résultat dans le journal et actualiser l'état de reprise.
5. Ne jamais marquer une tâche `[x]` si ses tests ou ses critères d'acceptation ne sont pas satisfaits.
6. Tout changement de décision métier doit être ajouté à la section **Décisions validées** avant son implémentation.

---

## 1. Décisions métier validées

### 1.1 Structure du complexe

Le CSB Noutcha KAMGUE est un établissement unique comportant quatre périmètres opérationnels indépendants :

1. `CRECHE`
2. `MATERNELLE`
3. `PRIMAIRE`
4. `SECONDAIRE`

La crèche est une section indépendante. Le collège et le lycée ne sont pas des cycles d'accès séparés : ils restent regroupés sous le cycle `SECONDAIRE`. Ils pourront être représentés comme subdivisions pédagogiques afin de classer correctement les niveaux et les programmes.

### 1.2 Bilinguisme et filières

Chaque cycle possède :

- une section `FRANCOPHONE` ;
- une section `ANGLOPHONE`.

Le secondaire possède en plus des parcours ou filières :

- enseignement général ;
- enseignement technique.

La filière technique dispose de ses propres classes, matières, enseignants et affectations. Une classe appartient à un cycle, une section linguistique et, lorsque cela s'applique, une filière.

### 1.3 Cloisonnement des données

Par défaut, un employé ne voit que les données correspondant à ses affectations. Les limites peuvent porter sur :

- un ou plusieurs cycles ;
- une ou plusieurs sections linguistiques ;
- une ou plusieurs filières ;
- une ou plusieurs classes ;
- ses propres affectations pédagogiques.

Les fonctions disposant d'une vue globale sur tout le complexe sont :

- promoteur ;
- gestionnaire RH ;
- administrateur informatique ;
- économe principal ;
- comptable ou caissier expressément autorisé à travailler globalement ;
- chargé de communication.

La visibilité globale ne donne pas automatiquement tous les droits d'écriture. Les permissions fonctionnelles et le périmètre de données restent deux contrôles séparés. Par exemple, le chargé de communication peut publier dans tout le complexe sans pouvoir consulter les notes, les dossiers médicaux ou les détails financiers individuels.

### 1.4 Personnel et enseignants

- Chaque employé possède un compte individuel.
- Un employé peut être affecté à plusieurs cycles ou sections.
- Un enseignant voit par défaut uniquement ses classes, matières, emplois du temps, appels et évaluations.
- Les responsables de cycle voient leur cycle selon leurs permissions.
- La directrice chargée de la crèche, de la maternelle et du primaire reçoit explicitement ces trois périmètres.
- Le principal reçoit le périmètre secondaire.
- Le responsable de la section anglophone reçoit les sections anglophones définies par son mandat.

### 1.5 Finances par cycle

Chaque cycle possède :

- sa propre caisse ;
- ses propres sessions de caisse ;
- ses propres reçus ;
- sa propre séquence de numérotation ;
- son propre budget ;
- ses propres dépenses ;
- ses propres rapports financiers.

L'économe principal possède une vue financière globale et peut :

- créer ou attribuer les rôles de caisse prévus par l'administration ;
- affecter un caissier à un seul cycle, à plusieurs cycles ou à tous les cycles ;
- consolider les résultats financiers du complexe sans fusionner les écritures sources.

Un paiement, une session de caisse, un reçu, une dépense et une ligne budgétaire doivent toujours être rattachés à un cycle. Les rapports consolidés additionnent les données des cycles autorisés, mais ne déplacent ni ne dupliquent les opérations.

### 1.6 Données de démonstration

En attendant l'intégration des données réelles du CSB, le seed doit créer un jeu de démonstration cohérent dans chaque cycle :

- niveaux, classes et sections francophones/anglophones ;
- classes générales et techniques au secondaire ;
- élèves, responsables et inscriptions ;
- membres du personnel et affectations ;
- matières, emplois du temps, présences, évaluations et bulletins ;
- frais, caisses, paiements, reçus, budgets et dépenses ;
- comptes de test couvrant chaque profil d'accès.

### 1.7 Identité visuelle

La charte numérique de référence est définie dans
[`07-CHARTE-GRAPHIQUE.md`](07-CHARTE-GRAPHIQUE.md). Elle s'appuie sur l'écusson
officiel transmis et sur le site public du CSB. La palette principale associe le
bleu nuit `#0B1B3D`, le bleu royal du logo `#1F3D80`, l'orange du logo `#F08524`,
l'orange profond `#E67E22`, l'or `#F1C40F` et le blanc.

L'application conserve Inter pour la lisibilité des interfaces, avec Segoe UI en
repli. Le futur rebranding devra respecter les contraintes de contraste de la
charte et utiliser une variante compacte du logo dans les espaces réduits.

---

## 2. Architecture fonctionnelle cible

```text
Établissement : CSB Noutcha KAMGUE
│
├── Cycle : Crèche
│   ├── Section francophone
│   └── Section anglophone
│
├── Cycle : Maternelle
│   ├── Section francophone
│   └── Section anglophone
│
├── Cycle : Primaire
│   ├── Section francophone
│   └── Section anglophone
│
└── Cycle : Secondaire
    ├── Section francophone
    │   ├── Enseignement général
    │   └── Enseignement technique
    └── Section anglophone
        ├── Enseignement général
        └── Enseignement technique
```

### 2.1 Entités à introduire ou adapter

Noms indicatifs à confirmer pendant la conception technique :

- `SchoolUnit` ou `EducationCycle` : crèche, maternelle, primaire, secondaire ;
- `LanguageSection` : francophone, anglophone ;
- `EducationTrack` : général, technique ;
- `StaffAssignment` : rattachement organisationnel d'un employé ;
- `UserAccessScope` : périmètre de sécurité associé à un utilisateur et à un rôle ;
- `CycleCashDesk` ou rattachement de `CashSession` au cycle ;
- `CycleBudget` et lignes budgétaires ;
- séquences documentaires par cycle et type de document.

### 2.2 Périmètres d'accès

Les périmètres minimaux à supporter sont :

| Type | Exemple | Usage |
|---|---|---|
| `SCHOOL` | Tout le CSB | Promoteur, RH, administrateur informatique, économe principal |
| `CYCLE` | Maternelle | Direction ou secrétariat d'un cycle |
| `LANGUAGE_SECTION` | Primaire anglophone | Responsable d'une section |
| `TRACK` | Secondaire technique francophone | Responsable ou personnel technique |
| `CLASS` | CM2 A anglophone | Titulaire ou intervenant limité |
| `OWN_ASSIGNMENTS` | Classes enseignées | Enseignant |

Un rôle répond à la question « que peut faire l'utilisateur ? ». Un périmètre répond à la question « sur quelles données peut-il le faire ? ».

### 2.3 Invariants de sécurité

1. Le client web ou mobile ne constitue jamais la barrière de sécurité.
2. Chaque endpoint applique à la fois la permission et le périmètre de données.
3. Un identifiant transmis par le client est revalidé côté serveur dans le périmètre autorisé.
4. Les recherches, exports, tableaux de bord et fichiers respectent les mêmes périmètres que les écrans ordinaires.
5. Les traitements asynchrones et notifications conservent le cycle d'origine.
6. Les actions sensibles sont inscrites dans l'audit avec le cycle, la section et l'acteur.
7. Aucun utilisateur limité à un cycle ne peut déduire l'existence d'une donnée d'un autre cycle par un compteur, une erreur, une recherche ou un export.
8. Les tests de sécurité utilisent des données homonymes dans plusieurs cycles afin de détecter les mélanges.

### 2.4 Invariants de conservation des données

1. Un élève possède une identité permanente unique dans le complexe.
2. Le cycle courant d'un élève est déterminé par son inscription et sa classe, pas par une duplication de son identité.
3. Le passage d'un cycle à un autre crée une nouvelle inscription annuelle et conserve tout l'historique.
4. Un paiement ou un reçu émis n'est jamais déplacé silencieusement vers un autre cycle.
5. Les migrations sont additives avant toute suppression de colonne ou d'ancien comportement.
6. Toute donnée impossible à classer est signalée et bloque la finalisation de la migration.
7. Les totaux financiers, effectifs et nombres de documents sont comparés avant et après migration.

---

## 3. Roadmap d'implémentation

### CSB-00 — Cadrage et filet de sécurité

**Objectif :** disposer d'un état de référence reproductible avant toute modification structurelle.

- [x] `CSB-00.1` Établir l'état de référence : build, lint, typecheck, tests, schéma Prisma, migrations et seed. Voir [`audits/CSB-00.1-ETAT-REFERENCE.md`](audits/CSB-00.1-ETAT-REFERENCE.md).
- [x] `CSB-00.2` Inventorier les tables, endpoints et écrans concernés par le cloisonnement. Voir [`audits/CSB-00.2-INVENTAIRE-CLOISONNEMENT.md`](audits/CSB-00.2-INVENTAIRE-CLOISONNEMENT.md).
- [x] `CSB-00.3` Ajouter des tests caractérisant le comportement actuel des données scolaires et financières. Voir [`audits/CSB-00.3-TESTS-CARACTERISATION.md`](audits/CSB-00.3-TESTS-CARACTERISATION.md).
- [x] `CSB-00.4` Documenter la procédure de sauvegarde et de restauration de PostgreSQL et des fichiers. Voir [`operations/BACKUP-RESTORE.md`](operations/BACKUP-RESTORE.md) et [`audits/CSB-00.4-SAUVEGARDE-RESTAURATION.md`](audits/CSB-00.4-SAUVEGARDE-RESTAURATION.md).
- [x] `CSB-00.5` Définir les compteurs de contrôle : élèves, inscriptions, paiements, reçus, soldes, personnel, notes et bulletins. Voir [`audits/CSB-00.5-COMPTEURS-CONTROLE.md`](audits/CSB-00.5-COMPTEURS-CONTROLE.md).

**Critères de sortie :** état de référence vert ou écarts documentés ; procédure de restauration testée ; aucun changement métier encore appliqué.

### CSB-01 — Référentiel organisationnel

**Objectif :** représenter sans ambiguïté les cycles, sections linguistiques et filières.

- [x] `CSB-01.1` Rédiger l'ADR du modèle organisationnel et choisir les noms définitifs des entités.
- [x] `CSB-01.2` Ajouter les quatre cycles : crèche, maternelle, primaire, secondaire.
- [x] `CSB-01.3` Ajouter les sections francophone et anglophone à chaque cycle.
- [x] `CSB-01.4` Ajouter les filières générale et technique au secondaire.
- [x] `CSB-01.5` Rattacher chaque niveau et chaque classe à une structure valide.
- [x] `CSB-01.6` Ajouter les contraintes empêchant les combinaisons invalides, notamment une filière technique hors secondaire.
- [x] `CSB-01.7` Exposer le référentiel dans les contrats, l'API et les écrans d'administration.

**Critères de sortie :** aucune classe active sans cycle et section ; filière technique limitée au secondaire ; tests unitaires et d'intégration verts.

### CSB-02 — Périmètres d'accès et authentification

**Objectif :** séparer les permissions fonctionnelles des données autorisées.

- [x] `CSB-02.1` Concevoir `StaffAssignment` et `UserAccessScope` avec support des affectations multiples.
- [x] `CSB-02.2` Étendre l'administration des utilisateurs pour attribuer rôles et périmètres.
- [x] `CSB-02.3` Ajouter les périmètres au contexte d'authentification sans produire de jetons excessivement volumineux.
- [x] `CSB-02.4` Créer un résolveur serveur central des filtres autorisés.
- [x] `CSB-02.5` Prévoir la révocation immédiate des sessions lors d'un changement de périmètre.
- [x] `CSB-02.6` Créer les profils initiaux de l'organigramme du CSB.
- [x] `CSB-02.7` Ajouter les tests de refus croisés entre cycles, sections, filières et classes.

**Critères de sortie :** aucun accès métier ne repose uniquement sur le masquage de l'interface ; toute modification de rôle ou périmètre invalide les sessions concernées.

### CSB-03 — Cloisonnement transversal des modules

**Objectif :** appliquer les périmètres à toutes les lectures et écritures.

- [x] `CSB-03.1` Élèves, inscriptions, responsables et imports.
- [x] `CSB-03.2` Référentiel pédagogique, matières et affectations.
- [x] `CSB-03.3` Emplois du temps, présences et assiduité.
- [x] `CSB-03.4` Évaluations, notes, bulletins et décisions.
- [x] `CSB-03.5` Discipline, sanctions, santé et informations sensibles.
- [x] `CSB-03.6` Personnel, contrats, congés et dossiers RH.
- [x] `CSB-03.7` Communication, devoirs, événements et messages.
- [x] `CSB-03.8` Bibliothèque, cantine, transport, stocks et achats.
- [x] `CSB-03.9` Recherche globale, tableaux de bord, exports et documents.
- [x] `CSB-03.10` Notifications, tâches planifiées et traitements asynchrones.

**Critères de sortie :** matrice de tests positive et négative pour chaque module ; aucune fuite par recherche, export, compteur, PDF ou notification.

### CSB-04 — Personnel et organigramme

**Objectif :** gérer tout le personnel sans mélanger les directions ni exposer les dossiers RH.

- [x] `CSB-04.1` Ajouter direction, service, fonction, supérieur hiérarchique et affectations multiples.
- [x] `CSB-04.2` Configurer les fonctions du secondaire : principal, secrétariat, préfet des études, surveillant général et responsable anglophone.
- [x] `CSB-04.3` Configurer la direction crèche-maternelle-primaire et ses responsables.
- [x] `CSB-04.4` Configurer promoteur, RH, administration informatique, économe et communication.
- [x] `CSB-04.5` Limiter le délégué du personnel aux informations nécessaires à son mandat.
- [x] `CSB-04.6` Ajouter les vues d'organigramme et les filtres par cycle, section, service et statut.
- [x] `CSB-04.7` Auditer les consultations et modifications des données RH sensibles.

**Critères de sortie :** affectations multiples fonctionnelles ; confidentialité RH testée ; chaîne hiérarchique consultable sans donner de permissions indues.

### CSB-05 — Scolarité bilingue et filière technique

**Objectif :** adapter les référentiels et parcours pédagogiques aux quatre cycles.

- [x] `CSB-05.1` Définir les niveaux francophones et anglophones de démonstration de chaque cycle.
- [x] `CSB-05.2` Définir les niveaux et classes du secondaire général et technique.
- [x] `CSB-05.3` Permettre des matières communes ou spécifiques à une section et une filière.
- [x] `CSB-05.4` Adapter les coefficients, barèmes, périodes et règles de bulletin par cycle/section/filière.
- [x] `CSB-05.5` Adapter la maternelle et la crèche aux évaluations qualitatives lorsque nécessaire.
- [x] `CSB-05.6` Tester les transferts de classe, section, filière et cycle sans perte d'historique.

**Critères de sortie :** chaque parcours dispose de classes, matières, enseignants et règles pédagogiques cohérentes ; historique conservé lors des changements.

### CSB-06 — Comptabilité et caisses par cycle

**Objectif :** garantir l'autonomie financière de chaque cycle et la consolidation globale.

- [x] `CSB-06.1` Rattacher frais, paiements, allocations, caisses et reçus à un cycle contrôlé.
- [x] `CSB-06.2` Créer une ou plusieurs caisses autorisées par cycle.
- [x] `CSB-06.3` Créer des séquences de reçus indépendantes par cycle.
- [x] `CSB-06.4` Rattacher budgets, catégories, fournisseurs, commandes et dépenses aux cycles.
- [x] `CSB-06.5` Autoriser un caissier mono-cycle, multi-cycle ou global.
- [x] `CSB-06.6` Créer le tableau consolidé de l'économe principal avec ventilation obligatoire par cycle.
- [x] `CSB-06.7` Adapter clôtures, rapprochements, exports et pièces justificatives.
- [x] `CSB-06.8` Vérifier les invariants comptables et la non-collision des numéros de reçus.

**Critères de sortie :** chaque montant est traçable vers un cycle ; les caisses et séquences sont indépendantes ; le consolidé égale exactement la somme des cycles autorisés.

### CSB-07 — Expérience utilisateur multi-périmètre

**Objectif :** rendre le périmètre courant visible et empêcher les erreurs de saisie.

- [x] `CSB-07.1` Ajouter un sélecteur de cycle pour les utilisateurs multi-cycles.
- [x] `CSB-07.2` Ajouter les sélecteurs de section, filière et classe lorsque nécessaires.
- [x] `CSB-07.3` Afficher en permanence le périmètre actif dans l'en-tête des espaces sensibles.
- [x] `CSB-07.4` Adapter la navigation aux permissions et périmètres réels.
- [x] `CSB-07.5` Empêcher une action financière ou scolaire sans périmètre explicite.
- [x] `CSB-07.6` Créer des tableaux de bord propres à chaque fonction de l'organigramme.
- [x] `CSB-07.7` Vérifier l'utilisation sur mobile, tablette et ordinateur.

**Critères de sortie :** aucune ambiguïté sur le cycle actif ; changement de périmètre sûr ; interfaces accessibles et responsives.

### CSB-08 — Données de démonstration complètes

**Objectif :** fournir un établissement de démonstration réaliste couvrant tous les cas.

- [x] `CSB-08.1` Créer le CSB et ses quatre cycles.
- [x] `CSB-08.2` Alimenter les sections francophones et anglophones.
- [x] `CSB-08.3` Alimenter le secondaire général et technique.
- [x] `CSB-08.4` Créer personnel, organigramme, rôles et périmètres.
- [x] `CSB-08.5` Créer élèves, responsables, inscriptions et historique minimal.
- [x] `CSB-08.6` Créer pédagogie, emplois du temps, appels, notes et bulletins.
- [x] `CSB-08.7` Créer frais, quatre caisses, paiements, reçus, budgets et dépenses.
- [x] `CSB-08.8` Rendre le seed idempotent et ajouter des assertions sur les volumes créés.
- [x] `CSB-08.9` Documenter les comptes de démonstration et leurs périmètres.

**Critères de sortie :** un seul lancement du seed produit un scénario complet ; les relances ne créent aucun doublon ; tous les profils peuvent être testés.

### CSB-09 — Rebranding CSB Noutcha KAMGUE

**Objectif :** remplacer l'identité de l'ancien produit après stabilisation de la nouvelle architecture.

- [!] `CSB-09.1` Valider le nom officiel, le sigle, le slogan, l'adresse et les contacts — validation de la direction, téléphone, e-mail et logo maître attendus.
- [x] `CSB-09.2` Obtenir ou créer les logos et variantes nécessaires.
- [x] `CSB-09.3` Remplacer les textes visibles web, mobile, API et documents.
- [x] `CSB-09.4` Renommer les assets, titres, métadonnées, modèles d'e-mail et fichiers exportés.
- [!] `CSB-09.5` Choisir les nouveaux identifiants techniques, domaines et noms de services — propriété des domaines et décision sur les identifiants mobiles attendues.
- [x] `CSB-09.6` Mettre à jour README, documentation et guides de déploiement.
- [x] `CSB-09.7` Vérifier visuellement tous les écrans et documents générés.

**Critères de sortie :** aucune ancienne marque visible ; identifiants techniques validés ; build web/mobile/API vert.

### CSB-10 — Import futur des données réelles

**Objectif :** préparer une reprise contrôlée des données du CSB sans perte ni mélange.

- [x] `CSB-10.1` Définir les modèles Excel par domaine et par cycle.
- [x] `CSB-10.2` Créer une zone de prévisualisation et de validation avant import.
- [x] `CSB-10.3` Détecter doublons, homonymes, responsables communs et matricules conflictuels.
- [x] `CSB-10.4` Exiger cycle, section, filière et classe pour chaque inscription.
- [x] `CSB-10.5` Produire un rapport d'anomalies sans modifier les données valides existantes.
- [x] `CSB-10.6` Ajouter réconciliation et rapport avant/après import.
- [x] `CSB-10.7` Tester restauration et reprise après interruption.

**Critères de sortie :** imports idempotents ou reprenables ; aucune ligne ambiguë intégrée silencieusement ; rapports de contrôle disponibles.

### CSB-11 — Sécurité, recette et non-régression

**Objectif :** démontrer que la plateforme ne perd et ne mélange aucune donnée.

- [x] `CSB-11.1` Tests d'isolation entre les quatre cycles.
- [x] `CSB-11.2` Tests d'isolation francophone/anglophone.
- [x] `CSB-11.3` Tests d'isolation général/technique.
- [x] `CSB-11.4` Tests enseignant limité à ses affectations.
- [x] `CSB-11.5` Tests des sept fonctions à visibilité globale avec permissions minimales.
- [x] `CSB-11.6` Tests des caisses, reçus, budgets et dépenses indépendants.
- [x] `CSB-11.7` Tests de recherche, rapports, exports, PDF et notifications.
- [!] `CSB-11.8` Tests de charge de rentrée scolaire et de clôture de caisse — scénario et garde-fous prêts ; URL, jeton, inscription et caisse de préproduction absents.
- [x] `CSB-11.9` Revue de sécurité, sauvegarde, restauration et journal d'audit.

**Critères de sortie :** zéro fuite connue ; zéro divergence financière ; restauration validée ; recette métier signée.

### CSB-12 — Déploiement et exploitation

**Objectif :** mettre le CSB en service avec une exploitation durable.

- [!] `CSB-12.1` Créer les environnements développement, recette et production — développement prêt ; comptes Railway/Vercel et approbation de déploiement externe attendus.
- [!] `CSB-12.2` Configurer base, stockage, secrets, domaines, e-mails et notifications — fournisseurs, domaines et secrets réels attendus.
- [!] `CSB-12.3` Créer les premiers comptes nominatifs et imposer le changement de mot de passe — blocage technique du mot de passe initial livré et testé ; identités, contacts et périmètres validés des utilisateurs attendus.
- [!] `CSB-12.4` Former les responsables par cycle et les fonctions globales — programme, exercices et fiche signable prêts ; participants, formateur et calendrier attendus.
- [x] `CSB-12.5` Préparer guides courts, assistance et procédure d'incident.
- [x] `CSB-12.6` Organiser le passage des données de démonstration aux données réelles.
- [!] `CSB-12.7` Surveiller la première rentrée, les encaissements et les clôtures — cadence, seuils, responsabilités et registre J0–J30 prêts ; production et date de rentrée réelles attendues.

**Critères de sortie :** production sauvegardée et supervisée ; utilisateurs formés ; responsabilités d'exploitation attribuées.

### CSB-13 — Qualité continue et performance opérationnelle

**Objectif :** rendre les contrôles web, performance et charge reproductibles avant chaque livraison.

- [x] `CSB-13.1` Installer et configurer Playwright pour Chrome bureau et mobile.
- [x] `CSB-13.2` Automatiser le tableau de bord, le périmètre actif et la recherche globale.
- [x] `CSB-13.3` Automatiser la navigation mobile et contrôler les débordements de page.
- [x] `CSB-13.4` Faire échouer les parcours sur les erreurs console ou les erreurs de page.
- [x] `CSB-13.5` Définir un budget JavaScript et découper les dépendances lourdes.
- [x] `CSB-13.6` Ajouter les parcours navigateur et leurs traces à la CI.
- [x] `CSB-13.7` Préparer un test k6 de rentrée/caisse déclenchable uniquement en préproduction.

**Critères de sortie :** parcours desktop/mobile verts sans erreur d'exécution ; budget du bundle respecté ; CI reproductible ; charge protégée par confirmation et environnement de préproduction.

---

## 4. Matrice initiale des responsabilités

Cette matrice devra être transformée en rôles et périmètres configurables pendant `CSB-02`.

| Fonction | Périmètre par défaut | Domaines principaux |
|---|---|---|
| Promoteur | Établissement | Pilotage global, validations et rapports consolidés |
| Administrateur informatique | Établissement | Comptes, rôles, configuration et audit technique |
| Gestionnaire RH | Établissement | Personnel, contrats, congés et organigramme |
| Économe principal | Établissement | Finances, budgets, dépenses, caisses et consolidation |
| Comptable/caissier global autorisé | Établissement | Opérations financières explicitement accordées |
| Chargé de communication | Établissement | Publications et événements, sans accès indu aux données sensibles |
| Principal | Secondaire | Administration, pédagogie, discipline et pilotage du secondaire |
| Secrétaire du principal | Secondaire | Dossiers administratifs autorisés du secondaire |
| Préfet des études | Secondaire | Pédagogie, évaluations, résultats et conseils de classe |
| Surveillant général | Secondaire | Présences, retards, discipline et incidents |
| Responsable anglophone | Sections anglophones autorisées | Coordination pédagogique et rapports de section |
| Directrice crèche/maternelle/primaire | Trois cycles attribués | Administration et pédagogie de ces cycles |
| Secrétaire de la directrice | Trois cycles attribués | Inscriptions et dossiers administratifs autorisés |
| Responsable de la crèche | Crèche | Fonctionnement, présence, sécurité et suivi des enfants |
| Responsable de la maternelle | Maternelle | Pédagogie, présence et suivi des enfants |
| Délégué du personnel | Périmètre mandaté | Représentation, sans accès RH complet |
| Enseignant | Affectations propres | Cours, appels, évaluations et appréciations autorisées |
| Caissier de cycle | Cycle attribué | Encaissement, sessions et reçus du cycle |

---

## 5. Points à confirmer sans bloquer le démarrage

Ces éléments devront être validés au plus tard avant la phase indiquée :

- avant `CSB-04` : nom officiel du poste « DIOF STUDY » et étendue exacte de son mandat ;
- avant `CSB-05` : liste officielle des niveaux, séries et spécialités techniques ;
- avant `CSB-05` : méthode d'évaluation de la crèche et de la maternelle ;
- avant `CSB-06` : format attendu des numéros de reçus par cycle ;
- avant `CSB-06` : existence d'une caisse unique ou de plusieurs guichets physiques dans un même cycle ;
- avant `CSB-09` : logo, couleurs, slogan, contacts, domaines et identifiants mobiles officiels ;
- avant `CSB-09` : obtenir le logo maître vectoriel et faire valider ses variantes compactes ;
- avant `CSB-10` : format et qualité des sources réelles à importer.

---

## 6. Journal d'avancement

| Date | Tâche | Résultat | Vérifications | Prochaine action |
|---|---|---|---|---|
| 2026-10-10 | Création de la roadmap | Décisions métier consolidées et phases CSB-00 à CSB-12 définies | Relecture structurelle du document | Démarrer `CSB-00.1` à la prochaine instruction |
| 2026-10-10 | Analyse de l'identité visuelle | Charte CSB issue du logo et du site public, palette et règles d'accessibilité documentées | Source du site et couleurs du logo comparées ; contrastes WCAG calculés | Conserver `CSB-00.1` comme prochaine tâche applicative |
| 2026-10-11 | `CSB-00.1` — état de référence | Socle restauré et vérifié ; 30 migrations à jour ; seed idempotent ; écarts Node, formatage et bundle documentés | `pnpm.cmd check` : 15/15 tâches et 278 tests verts ; `pnpm.cmd build` vert ; Prisma valide ; seed exécuté deux fois | Démarrer `CSB-00.2` |
| 2026-10-11 | `CSB-00.2` — inventaire du cloisonnement | 89 modèles, 267 endpoints, 43 chemins web et 18 écrans mobiles classés ; ancrages directs, héritages et risques transversaux documentés | Extraction du schéma Prisma, des 27 modules de routes, du routeur web et des écrans Expo ; contrôle des totaux | Démarrer `CSB-00.3` |
| 2026-10-11 | `CSB-00.3` — tests de caractérisation | Comportements actuels multi-cycle figés pour listes, reporting, recherche, exports et paiement | 4 nouveaux tests ; suite API 177/177 verte ; typecheck et lint API verts | Démarrer `CSB-00.4` |
| 2026-10-11 | `CSB-00.4` — sauvegarde/restauration | Procédure PostgreSQL + S3, scripts avec checksums et restauration dans des cibles isolées | Restauration PostgreSQL 16 et objet S3 de 9 554 octets : `PASS` ; cibles temporaires nettoyées | Exécuter `CSB-00.5` |
| 2026-10-11 | `CSB-00.5` — compteurs et clôture CSB-00 | Compteurs déterministes par établissement pour élèves, inscriptions, paiements, reçus, soldes, personnel, notes, bulletins et fichiers | Requête exécutée sur `CPLAN` ; comparaison avant/après restauration identique ; écarts de solde = 0 ; `pnpm.cmd check` 15/15 et 282 tests verts ; build vert | Démarrer `CSB-01.1` |
| 2026-10-11 | `CSB-01` à `CSB-03` — organisation et cloisonnement | Référentiel bilingue, affectations et portées multiples, résolution serveur, révocation immédiate et seconde barrière RLS sur les modules sensibles | 33 migrations à jour ; `pnpm.cmd check` 15/15 et 286 tests verts ; build de production vert ; 4 tests RLS positifs/négatifs ajoutés | Démarrer `CSB-04.1` |
| 2026-10-11 | `CSB-04` à `CSB-06` — personnel, pédagogie et comptabilité par cycle | Organigramme hiérarchique, fonctions préconfigurées, matières et règles par section/filière, évaluations qualitatives, caisses/budgets/séquences de reçus par unité et tableau comptable consolidé | 39 migrations à jour sur `cplan` et `cplan_test` ; `pnpm.cmd check` 15/15 et 289 tests verts ; build API/web vert ; invariants multi-cycle et non-collision testés | Démarrer `CSB-07.1` |
| 2026-10-11 | `CSB-07` à `CSB-11` — exploitation multi-périmètre, démonstration, identité, imports et sécurité | Sélecteur de portée transmis et validé par l’API, seed CSB-NK multi-cycle idempotent, identité visible, imports reprenables et revue de sécurité | 40 migrations à jour ; seed exécuté deux fois avec volumes identiques ; `pnpm.cmd check` 15/15, 184 tests API et 289 tests au total ; builds API/web verts | Faire valider l’identité officielle et exécuter la QA visuelle/charge |
| 2026-10-11 | `CSB-12` — préparation à l’exploitation | Exemples d’environnements staging/production, guide de bascule J0–J30, supervision, incidents, sauvegarde et migration documentés | Déploiement externe non exécuté : domaines, secrets, fournisseurs, comptes nominatifs et calendrier de formation attendus du CSB | Valider les paramètres réels puis déployer staging |
| 2026-10-14 | `CSB-13` — qualité continue et performance | Playwright bureau/mobile, recherche démo corrigée, navigation responsive contrôlée, budget du bundle, CI E2E et workflow k6 de préproduction livrés | Formatage, lint et types verts ; `pnpm e2e:web` : 2/2 verts et captures inspectées ; 184 tests API et 291 tests automatisés au total ; build avec budget : 810 947 octets, sans chunk supérieur à 500 Kio | Fournir les accès de préproduction pour exécuter `CSB-11.8` |
| 2026-10-14 | `CSB-11.8` — préparation de la charge réelle | Endpoint d'encaissement corrigé, profils rentrée/paiements séparés, contrôle de session ouverte et clôture irréversible optionnelle ajoutés ; seuils par scénario documentés | `pnpm load:check` vert ; k6 et paramètres `LOAD_*` absents localement, donc aucune mutation externe exécutée | Configurer l'environnement GitHub `preproduction`, ouvrir une caisse dédiée puis déclencher le workflow avec `PREPROD` |
| 2026-10-14 | `CSB-07.7` — QA responsive | Parcours critiques automatisés sur ordinateur, tablette 820 × 1180 et mobile Pixel 7 ; tiroirs, navigation, périmètre et absence de débordement global contrôlés | `pnpm e2e:web` : 3/3 verts ; captures bureau, tablette et mobile inspectées ; aucune erreur console | Poursuivre la revue visuelle exhaustive `CSB-09.7` lorsque les éléments officiels seront validés |
| 2026-10-14 | `CSB-09.7` — QA identité visuelle | Identité CSB vérifiée sur 37 routes web, favicon, marque mobile, reçu et export PDF ; anciens assets web retirés, assets mobiles renommés, données démo complétées et séparateur du tableau PDF corrigé | `pnpm e2e:web` : 4/4 verts ; captures web et rendus PDF inspectés ; lint/types mobile verts ; types web/API verts ; 184/184 tests API et 7/7 tests web verts | Obtenir les validations officielles de `CSB-09.1` et `CSB-09.5`, puis exécuter `CSB-11.8` en préproduction |
| 2026-10-14 | Audit de clôture des tâches CSB | Ancienne marque retirée de la documentation active et des exemples ; comptes démo du README réalignés avec le seed ; dossier unique des décisions, accès et preuves externes créé ; toutes les tâches non exécutables localement marquées bloquées avec leur cause | Recherche des anciennes mentions visible : zéro occurrence hors historiques/tests/migrations ; `pnpm.cmd check` : 15/15 tâches et 291 tests verts | Fournir les éléments de `docs/operations/CSB-EXTERNAL-COMPLETION.md` pour reprendre la clôture réelle |
| 2026-10-14 | `CSB-12.1`–`CSB-12.2` — garde-fous de déploiement | Modèles staging/production réalignés avec la configuration API ; ancien domaine CORS implicite retiré ; validateur de secrets, URLs, placeholders et fournisseurs ajouté ; déploiement bloqué avant migration si invalide et contrôle `/health/ready` après mise à jour | 4/4 tests du validateur, 8/8 tests de configuration API, typecheck et lint API verts ; modèle staging correctement refusé tant que ses placeholders ne sont pas remplacés | Renseigner les secrets et domaines réels, puis lancer le validateur sur staging |
| 2026-10-14 | `CSB-12.3` — sécurité du premier accès | Le compte administrateur créé au bootstrap porte désormais un mot de passe temporaire obligatoire ; l'API n'autorise que le profil, la rotation et la déconnexion jusqu'au changement ; le web redirige vers le formulaire puis rétablit la session | Migration 41 appliquée sur `cplan` et `cplan_test` ; parcours connexion → blocage 403 → changement → déblocage vert ; `pnpm.cmd check` : 15/15 tâches, 185 tests API et 292 tests automatisés au total | Recevoir la matrice nominative validée, créer les comptes en staging et vérifier leurs périmètres |
| 2026-10-14 | `CSB-12.4` et `CSB-12.7` — supports d'exécution | Programme de quatre formations avec exercices, émargement et décision ; registre J0–J30 avec état initial, contrôles matin/soir ou hebdomadaires, actions, signatures et bilan final | Liens ajoutés au dossier unique des preuves externes et à l'index documentaire ; aucune session ni donnée de production inventée | Fixer les participants et le calendrier après disponibilité de staging, puis ouvrir le registre lors de la bascule |
| 2026-10-15 | Stabilisation tests, stockage S3 et documentation | Délais Vitest adaptés aux scénarios PostgreSQL concurrents ; contrôles statiques séparés des tests lourds ; images MinIO serveur/client construites depuis des tags source officiels épinglés ; bucket privé `cplan-dev` recréé ; index et états d'avancement synchronisés | `pnpm check` vert : 292 tests automatisés et 4 contrôles de déploiement ; `pnpm e2e:web` : 5/5 verts ; MinIO sain, initialisation sortie 0 et `/health/ready` annonce PostgreSQL, Redis et stockage `up` | Fournir les éléments de `docs/operations/CSB-EXTERNAL-COMPLETION.md` pour clôturer les opérations externes |
| 2026-10-15 | Redirections par profil et console Super administrateur | Chaque compte rejoint automatiquement son espace après connexion ; la console plateforme consolide établissements, utilisateurs, élèves, personnel, encaissements, santé technique et activité récente sans charger les données d'un établissement | `pnpm check` vert : 304 tests automatisés et 4 contrôles de déploiement ; `pnpm e2e:web` : 7/7 verts sur ordinateur, tablette et mobile ; 2/2 tests d'intégration plateforme ; PostgreSQL, Redis et stockage annoncés `up` | Valider les comptes nominatifs et l'environnement de préproduction avant la bascule réelle |
| 2026-10-15 | Automatisation native de l'application parent | Le test mobile factice est remplacé par un validateur réel ; 4 flux Maestro couvrent connexion, navigation, association et préparation d'un paiement sans transaction ; des identifiants d'accessibilité stables fiabilisent les interactions | Validation statique 4/4, lint, types et formatage mobile verts ; exécution native non lancée car Maestro et émulateur sont absents du poste | Installer Maestro sur le poste de recette, installer l'APK et exécuter les flux avec un compte parent dédié |
| 2026-10-16 | Refonte du cockpit Super administrateur | Le tableau de bord est recentré sur le pilotage du CSB : effectifs et capacité, recouvrement, présence, alertes, comparaison des quatre cycles, priorités opérationnelles et qualité des données ; la santé technique reste secondaire | Agrégats API et contrats enrichis ; 2/2 tests d'intégration plateforme ; build web sous budget ; parcours Playwright desktop et mobile verts sur un port E2E isolé ; captures desktop et mobile inspectées | Faire confirmer par la direction les seuils d'alerte et les indicateurs prioritaires avant la recette métier |
| 2026-10-16 | Audit de cohérence — `CSB-06.4` réellement appliqué | Achats, dépenses et paiements fournisseurs imputés à un cycle et cloisonnés par RLS (absente jusque-là sur ces tables) ; facture liée au cycle de son bon d'achat, décaissement en espèces sur la caisse du même cycle ; budgets annuels par cycle avec consommation (API `PUT /budgets`, permission `budgets.manage`, onglet Budgets) ; annonces visant tout le complexe (périmètre global requis) ou un cycle ; double contrôle des remises au-dessus du seuil. Correctifs RLS découverts : responsables invisibles (`id` non qualifié) et portail famille vide sous le rôle restreint | Migration `20261016090000` rejouée sur base vierge ; 5 nouveaux tests d'intégration sous `cplan_app` ; 195 tests API verts ; lint, types et builds verts ; captures Playwright desktop et mobile inspectées | Relancer le bootstrap en recette pour charger `budgets.manage`, puis faire saisir par l'économe les budgets 2026 de chaque cycle |

## 7. Modèle d'entrée de journal

À copier après chaque lot :

```text
| AAAA-MM-JJ | CSB-XX.Y — intitulé | Résultat concret | Tests/commandes et résultats | Tâche suivante |
```

