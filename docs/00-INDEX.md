# CSB Noutcha KAMGUE — Index de la documentation de développement

> Source de vérité fonctionnelle : `Cahier fonctionnel — CSB Noutcha KAMGUE` (88 sections).
> Ce dossier traduit ce cahier en **plan de développement exécutable**, découpé en phases.

---

## Comment lire / utiliser ces documents

### Documents transversaux (à lire une fois, à consulter en permanence)

| Fichier | Contenu | Quand le lire |
|---|---|---|
| [01-VISION-PERIMETRE.md](01-VISION-PERIMETRE.md) | Ce qu'on construit, ce qu'on ne construit pas, les 8 dimensions métier | Avant tout |
| [02-ARCHITECTURE-TECHNIQUE.md](02-ARCHITECTURE-TECHNIQUE.md) | Stack, monorepo, décisions techniques (ADR), environnements | Avant la Phase 0 |
| [03-MODELE-DONNEES.md](03-MODELE-DONNEES.md) | Schéma PostgreSQL complet, table par table | En continu |
| [04-REGLES-METIER-FINANCIERES.md](04-REGLES-METIER-FINANCIERES.md) | Le cœur : dette, paiement, affectation, solde, contrepassation | Avant la Phase 6 |
| [05-RBAC-PERMISSIONS.md](05-RBAC-PERMISSIONS.md) | Rôles, permissions granulaires, matrice d'accès | Avant la Phase 1 |
| [06-CONVENTIONS-DEV.md](06-CONVENTIONS-DEV.md) | Nommage, API, erreurs, tests, git, definition of done | Avant la Phase 0 |
| [10-ROADMAP-CSB-NOUTCHA-KAMGUE.md](10-ROADMAP-CSB-NOUTCHA-KAMGUE.md) | Transformation du projet en plateforme complète du CSB, décisions validées et registre de reprise | Avant toute nouvelle modification |
| [operations/CSB-13-QUALITY-GATES.md](operations/CSB-13-QUALITY-GATES.md) | Playwright, budget du bundle, CI et charge k6 de préproduction | Avant chaque livraison |
| [operations/CSB-EXTERNAL-COMPLETION.md](operations/CSB-EXTERNAL-COMPLETION.md) | Données, décisions et preuves externes nécessaires pour clôturer CSB-09, CSB-11 et CSB-12 | Avant la mise en service réelle |
| [operations/CSB-J0-J30-REGISTER.md](operations/CSB-J0-J30-REGISTER.md) | Registre remplissable de surveillance et bilan après mise en production | De J0 à J30 |

### Documents de phase

Chaque fichier `phases/PHASE-XX-*.md` est **autonome** et contient toujours les mêmes rubriques :

1. **Objectif** — la question métier à laquelle la phase répond
2. **Pré-requis** — phases dont elle dépend
3. **Périmètre** — inclus / explicitement exclu
4. **Modèle de données** — tables créées ou modifiées
5. **API** — endpoints livrés
6. **Règles métier** — invariants à respecter
7. **Interfaces** — écrans (avec référence au cahier : P01, S05, C04…)
8. **Tests & critères d'acceptation** — la Definition of Done de la phase
9. **Risques / points d'attention**

> **Règle d'or** : on ne démarre pas une phase tant que la DoD de ses pré-requis n'est pas verte.

---

## Découpage en phases

### Bloc A — Fondations (aucune valeur métier visible, mais tout en dépend)

| # | Phase | Livre | Durée estimée |
|---|---|---|---|
| 00 | [Socle projet](phases/PHASE-00-socle-projet.md) | Monorepo, Docker, PostgreSQL, migrations, CI, squelettes API/Web/Mobile | 1 sem |
| 01 | [Identité, rôles & accès](phases/PHASE-01-identite-roles-acces.md) | `users`, RBAC, JWT, OTP, multi-établissement (`school_id`), socle d'audit | 2 sem |

### Bloc B — IDENTITÉ & SCOLARITÉ (le dossier élève)

| # | Phase | Livre | Durée estimée |
|---|---|---|---|
| 02 | [Référentiel scolaire](phases/PHASE-02-referentiel-scolaire.md) | Établissement, années scolaires, niveaux, classes + shell du dashboard React | 1,5 sem |
| 03 | [Élèves & inscriptions](phases/PHASE-03-eleves-inscriptions.md) | `students`, `enrollments`, matricule, statuts, fiche élève | 2 sem |
| 04 | [Responsables & associations](phases/PHASE-04-responsables-associations.md) | `guardians`, `student_guardians`, invitations, QR code, codes d'association | 2 sem |
| 05 | [Import Excel & réinscription](phases/PHASE-05-import-reinscription.md) | Import massif, réinscription, parcours nouvelle année | 1,5 sem |

### Bloc C — OBLIGATION (ce que l'élève doit)

| # | Phase | Livre | Durée estimée |
|---|---|---|---|
| 06 | [Structure financière](phases/PHASE-06-structure-financiere.md) | Frais, structures tarifaires, tranches, affectation aux élèves, remises | 2,5 sem |

### Bloc D — TRANSACTION, AFFECTATION & PREUVE (le cœur)

| # | Phase | Livre | Durée estimée |
|---|---|---|---|
| 07 | [Noyau paiement & reçus](phases/PHASE-07-noyau-paiement-recus.md) | `payments`, `payment_allocations`, moteur de solde, contrepassation, reçus PDF | 3 sem |
| 08 | [Caisse — encaissement physique](phases/PHASE-08-caisse-encaissement.md) | Premier canal réel : espèces/chèque/banque au guichet (C06) | 1,5 sem |

### Bloc E — APPLICATION PARENT

| # | Phase | Livre | Durée estimée |
|---|---|---|---|
| 09 | [App Parent — onboarding](phases/PHASE-09-app-parent-onboarding.md) | P01→P05 : compte, OTP, détection enfants, QR, codes | 2,5 sem |
| 10 | [App Parent — consultation](phases/PHASE-10-app-parent-consultation.md) | P06→P08, P15 : accueil, dossier enfant, situation financière, historique, reçus | 2 sem |

### Bloc F — CANAUX DE PAIEMENT DISTANTS

| # | Phase | Livre | Durée estimée |
|---|---|---|---|
| 11 | [Mobile Money](phases/PHASE-11-mobile-money.md) | MTN MoMo / Orange Money, webhooks, idempotence, réconciliation (P09→P13) | 3 sem |
| 12 | [Paiements externes & validation](phases/PHASE-12-paiements-externes.md) | Déclaration parent (P14) + validation comptable (C05) | 2 sem |

### Bloc G — PILOTAGE & EXPLOITATION

| # | Phase | Livre | Durée estimée |
|---|---|---|---|
| 13 | [Notifications](phases/PHASE-13-notifications.md) | In-app, push, SMS, e-mail, relances d'échéance automatiques | 2 sem |
| 14 | [Dashboards & reporting](phases/PHASE-14-dashboards-reporting.md) | C01, C07, D01, analyse par classe, recherche avancée financière | 2,5 sem |
| 15 | [Exports & impressions](phases/PHASE-15-exports-impressions.md) | PDF / Excel / CSV, documents imprimables | 1,5 sem |
| 16 | [Audit, sécurité & confidentialité](phases/PHASE-16-audit-securite.md) | Journal d'audit complet, cloisonnement responsables, durcissement | 2 sem |
| 17 | [Recette, déploiement & exploitation](phases/PHASE-17-recette-deploiement.md) | Tests de bout en bout, reprise de données, mise en production, run | 2,5 sem |

### Bloc H — GESTION SCOLAIRE COMPLÈTE

| # | Phase | Livre | Statut |
|---|---|---|---|
| 18 | [Référentiel pédagogique](phases/PHASE-18-referentiel-pedagogique.md) | Matières, enseignants et affectations par classe | **Terminé** |
| 19 | [Emplois du temps](phases/PHASE-19-emplois-du-temps.md) | Salles, créneaux, conflits et publication | **Terminé** |
| 20 | [Présences et assiduité](phases/PHASE-20-presences.md) | Appels, absences, retards, justificatifs et alertes | **Terminé** |
| 21 | [Évaluations et notes](phases/PHASE-21-evaluations-notes.md) | Périodes, barèmes, notes, compétences et règles de calcul | **Terminé** |
| 22 | [Bulletins](phases/PHASE-22-bulletins.md) | Moyennes, rangs, appréciations, décisions et PDF | **Terminé** |
| 23 | [Vie scolaire](phases/PHASE-23-vie-scolaire.md) | Discipline, sanctions et infirmerie | **Terminé** |
| 24 | [Personnel](phases/PHASE-24-personnel.md) | Contrats, charges et congés | **Terminé** |
| 25 | [Communication](phases/PHASE-25-communication.md) | Annonces, calendrier, devoirs et messages | **Terminé** |
| 26 | [Services](phases/PHASE-26-services.md) | Bibliothèque, cantine, transport et stocks | **Terminé** |
| 27 | [Portails acteurs](phases/PHASE-27-portails-acteurs.md) | Espaces enseignant, famille et élève | **Terminé** |
| 28 | [Dépenses, achats et fournisseurs](phases/PHASE-28-depenses-achats-fournisseurs.md) | Fournisseurs, commandes, factures, approbations, échéances et règlements | **Terminé** |
| 29 | [Modules configurables](phases/PHASE-29-modules-configurables.md) | Activation par établissement, dépendances, garde API et navigation dynamique | **Terminé** |

La trajectoire complète est décrite dans [08-EXTENSION-GESTION-SCOLAIRE.md](08-EXTENSION-GESTION-SCOLAIRE.md) et ses critères de fin dans [09-OBJECTIFS-GESTION-COMPLETE.md](09-OBJECTIFS-GESTION-COMPLETE.md).

**Total indicatif : ~38 semaines-équipe** (à paralléliser : voir le chemin critique ci-dessous).

---

## Chemin critique et parallélisation

```text
P00 ──> P01 ──┬──> P02 ──> P03 ──┬──> P04 ──> P05
              │                  │
              │                  └──> P06 ──> P07 ──┬──> P08
              │                                     ├──> P11
              │                                     ├──> P12
              │                                     └──> P10
              │
              └──> P09 (peut démarrer dès P04 côté API)
                            │
                            └──> P10 ──> P13

P14, P15, P16 : démarrables dès P07 livré, finalisés en fin de projet
P17 : transversal, commence en continu dès P08
```

**Deux flux parallélisables** à partir de P07 :
- *Flux Établissement* : P08 → P12 → P14 → P15 (une équipe web/back)
- *Flux Parent* : P09 → P10 → P11 → P13 (une équipe mobile/back)

---

## Tableau de suivi

> À maintenir à jour à chaque fin de phase. Statuts : `À faire` / `En cours` / `En recette` / `Terminé`.

| Phase | Statut | Démarrée le | Terminée le | Notes |
|---|---|---|---|---|
| P00 Socle projet | **Terminé** | 2026-08-19 | 2026-10-11 | Socle, outillage et contrôles automatisés opérationnels |
| P01 Identité & accès | **Terminé** | 2026-08-20 | 2026-10-11 | Authentification, utilisateurs, rôles et permissions livrés |
| P02 Référentiel scolaire | **Terminé** | | 2026-10-11 | Référentiel bilingue et organisation multi-cycle livrés |
| P03 Élèves & inscriptions | **Terminé** | | 2026-10-11 | Dossiers élèves, inscriptions et cloisonnement livrés |
| P04 Responsables & associations | **Terminé** | | 2026-10-11 | Responsables, liens familiaux et invitations livrés |
| P05 Import & réinscription | **Terminé** | | 2026-10-11 | Imports contrôlés et réinscriptions livrés |
| P06 Structure financière | **Terminé** | | 2026-10-11 | Grilles tarifaires et structure comptable livrées |
| P07 Noyau paiement & reçus | **Terminé** | | 2026-10-11 | Paiements, reçus et invariants financiers livrés |
| P08 Caisse | **Terminé** | | 2026-10-11 | Sessions, encaissements et clôtures livrés |
| P09 App Parent onboarding | **Terminé** | | 2026-10-11 | Activation et rattachement parent livrés |
| P10 App Parent consultation | **Terminé** | | 2026-10-11 | Consultation des soldes, reçus et données scolaires livrée |
| P11 Mobile Money | **Terminé** | | 2026-10-11 | Parcours et abstraction fournisseur livrés |
| P12 Paiements externes | **Terminé** | | 2026-10-11 | Enregistrement, rapprochement et contrôles livrés |
| P13 Notifications | **Terminé** | | 2026-10-11 | Notifications et rappels livrés |
| P14 Dashboards & reporting | **Terminé** | | 2026-10-11 | Indicateurs et tableaux de bord livrés |
| P15 Exports & impressions | **Terminé** | | 2026-10-11 | Exports, reçus et impressions livrés |
| P16 Audit & sécurité | **Terminé** | | 2026-10-11 | Audit, protections et politiques de rétention livrés |
| P17 Recette & déploiement | **En cours / externe** | | | Préproduction, comptes nominatifs, formation, bascule et suivi J0–J30 en attente des accès CSB |

---

## Traçabilité cahier fonctionnel → phase

| Sections du cahier | Phase |
|---|---|
| §1, §2, §84, §87, §88 | 01-VISION-PERIMETRE |
| §60 à §64, §85 | 03-MODELE-DONNEES |
| §55, §56 | 05-RBAC / P01 |
| §31, §32, §33 (S02, S03, S04) | P02 |
| §5, §34 à §37, §75 (S05, S06, S07) | P03 |
| §6 à §13, §38, §69 à §74 (P02→P05, S01) | P04 + P09 |
| §39, §40, §68 (S08, S09) | P05 |
| §16 à §19, §42, §43, §50 (C02, C03) | P06 |
| §28, §51, §52, §58, §59, §81 | P07 |
| §47, §67 (C06) | P08 |
| §7, §8, §10, §11, §12 (P01→P05) | P09 |
| §13, §14, §15, §27, §80 (P06→P08, P15) | P10 |
| §20 à §24, §65 (P09→P13) | P11 |
| §25, §26, §45, §46, §66 (P14, C05) | P12 |
| §29, §79 | P13 |
| §41, §44, §48, §49, §53, §54, §76 (C01, C04, C07, D01) | P14 |
| §77, §78 | P15 |
| §57, §71, §74 | P16 |
| §82 (MVP) | P00→P16 |
| §83 (V2) | Hors périmètre V1 |
