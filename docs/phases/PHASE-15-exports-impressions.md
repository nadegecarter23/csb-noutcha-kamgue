# PHASE 15 — Exports & impressions

**Durée estimée** : 1,5 semaine · **Pré-requis** : P14 · **Réf. cahier** : §77, §78

---

## 1. Objectif

Rendre CSB Noutcha KAMGUE compatible avec les habitudes administratives réelles.

Le §78 est explicite et mérite d'être pris au sérieux : *« CSB Noutcha KAMGUE doit être pensé pour fonctionner également avec les habitudes administratives actuelles. »* Dans un établissement camerounais, le document papier reste la référence en réunion, en conseil de direction, en contrôle. Une liste de classe affichée à l'écran ne remplace pas une liste affichée au mur.

Ce n'est pas une phase de confort. Un outil dont on ne peut rien sortir sera doublé d'un fichier Excel parallèle — et c'est la fin de la source de vérité unique.

---

## 2. Périmètre

### Inclus
- Moteur d'export : PDF, Excel (`.xlsx`), CSV
- Génération asynchrone pour les volumes importants
- Les 10 états du §77
- Les 8 documents imprimables du §78
- Mise en page A4 propre, en-têtes, pieds de page, pagination
- Modèles de documents personnalisables (logo, en-tête, mentions)
- Historique des exports

### Exclu
- Éditeur de rapports libre (V2)
- Envoi programmé d'états par e-mail (V2)

---

## 3. Architecture

```text
Demande d'export
      │
      ├── moins de 500 lignes → génération synchrone, téléchargement immédiat
      │
      └── au-delà            → job BullMQ
                                 → génération
                                 → dépôt dans files (S3)
                                 → notification à l'utilisateur
                                 → téléchargement par URL pré-signée (24 h)
```

Une génération synchrone qui bloque 40 secondes est perçue comme un plantage. Le seuil de 500 lignes est empirique et paramétrable.

| Format | Bibliothèque | Usage |
|---|---|---|
| PDF | `pdfmake` | Documents officiels, impression |
| Excel | `exceljs` | Retraitement par la comptabilité |
| CSV | natif, UTF-8 **avec BOM** | Import dans d'autres outils |

> Le BOM UTF-8 n'est pas un détail : sans lui, Excel sous Windows affiche « Nathan Fotsô » en mojibake, et l'utilisateur conclut que l'outil est cassé.

Tous les exports passent par la **même couche d'autorisation** que les écrans : un caissier ne peut pas exporter des données auxquelles il n'a pas accès à l'écran. Chaque export est audité (qui, quoi, quand, quel filtre) — une extraction de données personnelles doit être traçable.

---

## 4. Les états (§77)

| # | État | Formats | Contenu |
|---|---|---|---|
| 1 | Liste des élèves | PDF, Excel, CSV | Colonnes de S05, filtres appliqués |
| 2 | Élèves par classe | PDF, Excel | Groupé par classe, sous-totaux, un saut de page par classe |
| 3 | Élèves ayant payé | PDF, Excel | Situation « à jour » ou soldée |
| 4 | Élèves n'ayant pas payé | PDF, Excel | `paid = 0`, avec coordonnées des responsables — c'est le document de relance |
| 5 | Situation financière (par élève) | PDF | Relevé complet : frais, remises, tranches, paiements, solde |
| 6 | Paiements par période | Excel, CSV, PDF | Toutes les colonnes de C04, avec totaux |
| 7 | Paiements par opérateur | Excel, PDF | Groupé par moyen et par opérateur, pour rapprochement |
| 8 | Paiements par classe | Excel, PDF | Agrégé, avec taux de recouvrement |
| 9 | Reçus | PDF | Un reçu, ou un lot (par période, par élève) |
| 10 | Créances / impayés | PDF, Excel | Reste à payer par élève, trié décroissant, avec ancienneté et contacts |

L'état 4 est le plus utilisé en pratique : il doit contenir le nom du responsable principal et son numéro de téléphone, sinon il faut le croiser à la main avec une autre liste.

---

## 5. Les documents imprimables (§78)

| # | Document | Format | Détail |
|---|---|---|---|
| 1 | Fiche élève | A4 | État civil, scolarité, responsables, situation financière résumée |
| 2 | Fiche d'inscription | A4 | Document officiel, avec emplacements de signature (parent, établissement) |
| 3 | QR d'association | A4 ou demi-page | Voir Phase 04 ; impression unitaire ou par classe |
| 4 | Reçu | A5 / A4 / thermique 80 mm | Voir Phase 07, snapshot figé |
| 5 | Liste de classe | A4 paysage | Effectif, avec colonnes vierges pour annotation manuelle |
| 6 | État des paiements | A4 paysage | C07 imprimable |
| 7 | État des impayés | A4 paysage | Créances avec contacts |
| 8 | Situation d'un élève | A4 | Relevé détaillé, remis au parent au guichet |

### Charte des documents

Tout document imprimé porte :
- **En-tête** : logo, nom, adresse, téléphone, e-mail de l'établissement
- **Titre** et paramètres (année scolaire, classe, période, filtres appliqués)
- **Pied de page** : « Généré le 19/08/2026 à 10:15 par Marie Ngo · Page 1/12 · CSB Noutcha KAMGUE »
- Une **police lisible imprimée**, pas seulement à l'écran (11 pt minimum pour les tableaux)
- Un **noir et blanc exploitable** : la couleur seule ne doit jamais porter d'information (beaucoup d'imprimantes sont monochromes)

Le rappel des filtres appliqués est essentiel : un état d'impayés sans indication de la période ou de la classe est inexploitable trois jours plus tard.

### La liste de classe — un cas à part

```text
   CSB Noutcha KAMGUE                             Année 2026/2027
   LISTE DE CLASSE — 6e A                    Effectif : 52

   N°  Matricule   Nom et prénoms        Sexe  Né(e) le    Observations
   ─────────────────────────────────────────────────────────────────────
    1  CPLAN-00342 FOTSO Nathan            M   12/03/2014  ................
    2  CPLAN-00343 NGO Sarah               F   08/07/2013  ................
   ─────────────────────────────────────────────────────────────────────
```

Noms en majuscules, numérotation séquentielle, colonne d'observations vierge, lignes suffisamment espacées pour l'écriture manuscrite. C'est le document le plus imprimé d'un établissement ; il mérite d'être soigné.

---

## 6. API

```
POST /api/v1/exports
     { type, format, filters, options }
     → { export_id, status: 'PROCESSING' | 'READY', download_url? }
GET  /api/v1/exports/:id
GET  /api/v1/exports/:id/download        # URL pré-signée, 24 h
GET  /api/v1/exports                     # historique de l'utilisateur

GET  /api/v1/print/student/:id
GET  /api/v1/print/enrollment/:id
GET  /api/v1/print/class-list/:classId
GET  /api/v1/print/class-payment-status/:classId
GET  /api/v1/print/student-statement/:enrollmentId
GET  /api/v1/print/receipts?payment_ids=       # lot de reçus
GET  /api/v1/print/outstanding?class_id=&min_amount=
```

Modèles de documents personnalisables : `GET/PATCH /api/v1/document-templates` (en-tête, pied de page, mentions légales, signataire par défaut).

---

## 7. Ergonomie

Bouton `Exporter` présent sur chaque liste, proposant un menu déroulant : Excel · PDF · CSV · Imprimer. **Les filtres actifs à l'écran sont automatiquement appliqués à l'export** — un export qui ignore les filtres est une erreur classique et coûteuse.

```text
  ┌────────────────────────────────┐
  │  Exporter                      │
  │                                │
  │  Format   ● Excel ○ PDF ○ CSV  │
  │                                │
  │  Filtres appliqués             │
  │   Année 2026/2027              │
  │   Classe 6e A                  │
  │   Statut Actif                 │
  │   → 52 élèves                  │
  │                                │
  │  Colonnes      [Sélectionner]  │
  │  ☑ Inclure les totaux          │
  │                                │
  │       [Annuler]  [Exporter]    │
  └────────────────────────────────┘
```

Pour un export asynchrone : message immédiat (« Votre export est en préparation, vous serez notifié »), notification à la fin, retrouvable dans l'historique. L'utilisateur peut continuer à travailler.

---

## 8. Critères d'acceptation

- [ ] Les 10 états du §77 sont générables dans leurs formats annoncés
- [ ] Les 8 documents du §78 s'impriment correctement en A4
- [ ] Les filtres de l'écran sont appliqués à l'export, sans exception
- [ ] Un export Excel de 1 250 élèves se génère en moins de 10 s
- [ ] Un export de plus de 500 lignes bascule en asynchrone avec notification
- [ ] Le CSV s'ouvre dans Excel sous Windows **sans caractères corrompus** (BOM vérifié)
- [ ] Les totaux des exports correspondent exactement aux totaux affichés à l'écran
- [ ] Les documents PDF portent en-tête, pied de page, pagination et rappel des filtres
- [ ] La liste de classe est imprimable et exploitable manuellement (testée sur imprimante réelle)
- [ ] Le reçu s'imprime en A5 et en thermique 80 mm
- [ ] Un lot de 50 reçus se génère en un seul PDF
- [ ] Un utilisateur ne peut exporter que ce qu'il peut voir (test de permissions)
- [ ] Chaque export est audité
- [ ] Le logo et l'en-tête de l'établissement apparaissent sur tous les documents
- [ ] Les documents restent lisibles en impression noir et blanc

---

## 9. Risques

| Risque | Impact | Parade |
|---|---|---|
| Encodage CSV cassé sous Excel Windows | Rejet immédiat de la fonctionnalité | UTF-8 avec BOM, testé sur Excel réel — pas seulement LibreOffice |
| Exports lents bloquant l'interface | Timeouts, frustration | Seuil de bascule en asynchrone, notification |
| Écart entre l'export et l'écran | Contestation des chiffres | Même requête, même couche de calcul, test de cohérence en CI |
| Mise en page cassée à l'impression | Documents inutilisables | Tests sur imprimante réelle, pas uniquement en aperçu PDF |
| Fuite de données par export non contrôlé | Atteinte à la vie privée | Mêmes permissions que l'écran, audit systématique de chaque export |
| Exports volumineux saturant le stockage | Coût, saturation | Purge automatique après 30 jours, quota par utilisateur |
| Accents et caractères spéciaux dans les PDF | Documents illisibles | Polices avec jeu latin étendu embarquées dans `pdfmake` |
