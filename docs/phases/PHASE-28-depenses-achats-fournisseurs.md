# Phase 28 — Dépenses, achats et fournisseurs

## Objectif

Piloter les décaissements de l’établissement depuis la demande d’achat jusqu’au règlement, en conservant la séparation entre saisie, approbation et paiement.

## Périmètre livré

- Référentiel fournisseurs et catégories de dépenses.
- Bons d’achat avec lignes, calcul serveur, soumission, approbation, rejet et réception.
- Dépenses et factures avec échéance, justificatif privé, rapprochement facultatif à un bon d’achat et contrôle du dépassement.
- Paiements partiels ou complets par espèces, virement, dépôt, chèque, Mobile Money ou autre moyen.
- Encours par fournisseur, échéancier, impayés échus et règlements du mois.
- Sorties d’espèces intégrées à la session de caisse et à son rapprochement.
- Journal d’audit et permissions distinctes pour consulter, saisir, approuver, réceptionner et payer.

## Modèle de données

Les tables `suppliers`, `expense_categories`, `purchase_orders`, `purchase_order_lines`, `expenses` et `supplier_payments` sont rattachées à `school_id`. Les pièces utilisent `files` avec le type `EXPENSE_DOCUMENT`. Un paiement en espèces référence une `cash_session` et crée un mouvement `CASH_OUT`.

La migration est `20261003220000_procurement_expenses`. Elle ajoute des index sur les validations en attente et les dépenses payables par échéance.

## API

- `GET /api/v1/procurement/overview`
- `POST|PATCH /api/v1/suppliers[/:id]`
- `POST /api/v1/expense-categories`
- `POST /api/v1/purchase-orders`
- `POST /api/v1/purchase-orders/:id/submit|decision|receive`
- `POST /api/v1/expense-documents`
- `POST /api/v1/expenses`
- `POST /api/v1/expenses/:id/submit|decision|pay`
- `GET /api/v1/expenses/:id/document`

## Règles métier

1. Les montants et totaux sont recalculés côté serveur.
2. L’auteur d’un bon ou d’une dépense ne peut pas approuver sa propre saisie.
3. Un rejet exige un motif.
4. Une facture liée à un bon ne peut pas dépasser son montant disponible.
5. Un paiement ne peut dépasser le solde et sa date ne peut être future.
6. Un paiement en espèces exige une caisse ouverte par l’utilisateur qui paie.
7. La clé d’idempotence empêche le double paiement.
8. Les justificatifs sont privés, limités aux formats PDF, JPEG et PNG, et exposés par URL signée de cinq minutes.

## Interface

La route `/procurement` fournit une vue de pilotage, un échéancier, la file d’approbation, les dépenses, les bons d’achat, les fournisseurs et les catégories. Les actions visibles suivent les permissions de l’utilisateur et l’interface reste utilisable sur mobile.

## Validation

- Génération Prisma, typecheck, ESLint et build de production.
- Tests de contrat pour les dates, lignes de commande, rejets et moyens de paiement.
- Jeu de démonstration interactif couvrant les états approuvé, partiellement payé, soumis et réceptionné.

## Limite comptable

Cette phase couvre les achats, les dettes fournisseurs et les décaissements. La comptabilité générale complète demande encore un plan comptable, des journaux, des écritures en partie double, les clôtures, balances et états financiers.
