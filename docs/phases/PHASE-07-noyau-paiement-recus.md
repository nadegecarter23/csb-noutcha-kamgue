# PHASE 07 — Noyau paiement, affectation & reçus

**Durée estimée** : 3 semaines · **Pré-requis** : P06 · **Réf. cahier** : §28, §50, §51, §52, §58, §59, §62, §81 (règles 7, 8, 9)

---

## 1. Objectif

Implanter les trois dimensions restantes du §87 : **TRANSACTION**, **AFFECTATION**, **PREUVE**.

C'est **la phase la plus importante du projet**. Tout ce qui suit — caisse, Mobile Money, paiements externes, dashboards, exports — n'est qu'un canal d'entrée ou une vue de lecture branchée sur ce noyau. Un défaut ici se propage partout ; une conception juste ici rend les six phases suivantes mécaniques.

**Aucune interface de paiement n'est livrée dans cette phase.** On construit le moteur, pas les portes d'entrée. La Phase 08 (caisse) sera la première à l'utiliser pour de vrai, et servira de validation.

---

## 2. Périmètre

### Inclus
- `payments`, `payment_allocations`, `receipts`
- Machine à états des paiements (§59)
- Moteur d'allocation automatique en cascade et allocation dirigée
- Gestion du surpaiement / avance et réaffectation
- Contrepassation (§58)
- Génération du numéro de reçu et du PDF (§28)
- Vues `v_enrollment_balance` et `v_enrollment_balance_audit`
- Job de réconciliation nocturne
- Onglet Paiements de la fiche élève (S07)
- Écran C04 (liste des paiements) en lecture seule
- API de consultation des paiements

### Exclu
- Encaissement au guichet (Phase 08)
- Mobile Money (Phase 11)
- Paiements externes (Phase 12)
- Notifications (Phase 13) — les événements sont émis, les canaux viendront

---

## 3. Modèle de données

Détail en [../03-MODELE-DONNEES.md](../03-MODELE-DONNEES.md) section G. **Toutes les règles algorithmiques de cette phase sont dans [../04-REGLES-METIER-FINANCIERES.md](../04-REGLES-METIER-FINANCIERES.md) sections 3 à 8** — ce document ne les répète pas, il décrit leur implantation.

### La séparation à ne jamais perdre de vue (§51)

```text
        payments                     ← LE MOUVEMENT D'ARGENT
        100 000 FCFA
        Orange Money
        OM-39284023
             │
             │  ventilation
             ▼
  ┌──────────┴───────────┐
payment_allocations       ← L'IMPUTATION SUR LA DETTE
  25 000 → SFA Inscription
  75 000 → SFA Pension (tranche 1)
```

Ce que cette séparation permet, et qu'un modèle plat interdirait :
- un paiement couvrant plusieurs frais (§51)
- un paiement couvrant plusieurs enfants (§52)
- un paiement partiellement affecté, le reste en avance
- une réaffectation ultérieure sans toucher au mouvement d'argent
- une contrepassation propre

### Protections en base

```sql
-- Anti double-crédit sur les paiements opérateur
CREATE UNIQUE INDEX uq_payments_provider_ref
  ON payments (provider, provider_reference) WHERE provider_reference IS NOT NULL;

-- Référence unique
ALTER TABLE payments ADD CONSTRAINT uq_payments_reference UNIQUE (reference);

-- Un reçu par paiement
ALTER TABLE receipts ADD CONSTRAINT uq_receipts_payment UNIQUE (payment_id);

-- Suppression impossible
REVOKE DELETE ON payments, payment_allocations, receipts FROM cplan_app;
```

---

## 4. Le service de paiement — architecture

```text
PaymentService
  ├── create(input)                    → PENDING, quel que soit le canal
  ├── transitionTo(id, status, ctx)    → machine à états, seul point de changement de statut
  ├── markSuccess(id, ctx)             → LA méthode centrale (voir §5)
  ├── markFailed(id, reason)
  ├── cancel(id, reason)
  ├── reverse(id, { reason, partialAmount? })
  ├── allocate(id, targets?)           → auto ou dirigée
  └── reallocate(id, targets)          → réaffectation d'une avance

AllocationEngine  (packages/domain — PUR, sans I/O)
  ├── computeAllocations(amount, openTargets, settings) → Allocation[]
  ├── sortTargets(targets)             → priorité, puis échéance, puis nom
  └── validateManualAllocations(...)

ReceiptService
  ├── issue(paymentId, tx)             → numéro + snapshot, dans la transaction
  └── renderPdf(receiptId)             → job asynchrone
```

**Règle d'or de la phase** : `markSuccess` est le **seul** chemin par lequel un paiement devient effectif. Les trois canaux (caisse, Mobile Money, externe) l'appellent tous. Aucun n'a le droit d'écrire directement `status = 'SUCCESS'` ni de créer des allocations lui-même. C'est ce qui garantit qu'il n'existe qu'une seule logique de solde dans le produit.

---

## 5. `markSuccess` — la transaction critique

```ts
async markSuccess(paymentId, ctx) {
  return db.$transaction(async (tx) => {
    // 1. Verrou sur le paiement, relecture du statut
    const payment = await tx.payment.findUniqueForUpdate(paymentId);
    if (payment.status === 'SUCCESS') return payment;        // idempotent
    assertTransitionAllowed(payment.status, 'SUCCESS');

    // 2. Verrou sur les inscriptions concernées (anti-concurrence)
    await tx.lockEnrollments(ctx.enrollmentIds);

    // 3. Calcul des allocations — fonction PURE
    const openTargets = await tx.loadOpenTargets(ctx.enrollmentIds);
    const allocations = ctx.manualAllocations
      ? validateManualAllocations(payment.amount, ctx.manualAllocations, openTargets)
      : computeAllocations(payment.amount, openTargets, settings);

    // 4. Écritures
    await tx.paymentAllocation.createMany(allocations);
    await tx.incrementPaidAmounts(allocations);              // SFA + tranches
    await tx.refreshStatuses(allocations);

    // 5. Reliquat
    const allocated = sum(allocations);
    await tx.payment.update(paymentId, {
      status: 'SUCCESS',
      paidAt: ctx.paidAt ?? now(),
      validatedAt: now(), validatedBy: ctx.userId,
      unallocatedAmount: payment.amount - allocated,
    });

    // 6. Reçu — numéro + snapshot figé, DANS la transaction
    const receipt = await receiptService.issue(paymentId, tx);

    // 7. Audit
    await audit.log({ action: 'payment.succeed', ... }, tx);

    return { payment, allocations, receipt };
  }, { isolationLevel: 'ReadCommitted', timeout: 10_000 });
}

// APRÈS commit uniquement — jamais dedans
await queue.add('receipt.render-pdf', { receiptId });
await queue.add('notification.payment-confirmed', { paymentId });
```

### Les cinq points non négociables

1. **Une seule transaction** pour l'ensemble des écritures. Un reçu émis sans allocation, ou l'inverse, est une incohérence irrécupérable.
2. **Verrou `FOR UPDATE` sur les inscriptions** avant lecture du reste à payer. Sans lui, le père au guichet et la mère sur l'app lisent le même solde et produisent un résultat faux.
3. **Idempotence** : si le paiement est déjà `SUCCESS`, on ressort sans rien faire. Le webhook Mobile Money (Phase 11) rejouera cette méthode plusieurs fois.
4. **Aucun appel réseau dans la transaction** : ni PDF, ni SMS, ni S3. Ils viennent après commit, via BullMQ.
5. **Le calcul reste pur.** `computeAllocations` ne connaît ni base ni HTTP : elle prend un montant et des cibles, elle rend des allocations. C'est ce qui la rend testable exhaustivement.

---

## 6. Le moteur d'allocation

Algorithme détaillé en [doc 04 §4](../04-REGLES-METIER-FINANCIERES.md). Résumé de l'ordre de service :

```text
1. Cibles ouvertes = (SFA, tranche) avec reste > 0, frais ouvert (opens_at ≤ aujourd'hui)
2. Tri : fee_type.priority ↑, puis due_date ↑, puis nom
3. Imputation en cascade, en respectant :
     · allow_partial_payment = false  → tout ou rien sur cette cible
     · enforce_installment_order      → pas de saut de tranche
4. Reliquat → unallocated_amount (avance) si autorisé, sinon refus en amont
```

### Cas de test obligatoires du moteur

| Scénario | Attendu |
|---|---|
| Montant exact du reste total | Tout affecté, `unallocated = 0`, tous les SFA `PAID` |
| Montant inférieur | Cascade par priorité, dernière cible `PARTIALLY_PAID` |
| Montant supérieur | Tout soldé, reliquat en avance |
| Frais indivisible, montant insuffisant | Cible sautée, imputation sur la suivante |
| Ordre strict des tranches, T1 impayée | T2 non servie même si le montant suffit |
| Aucune cible ouverte | Totalité en avance, ou refus |
| Deux frais de priorité égale | Départage par échéance, puis par nom — **déterministe** |
| Frais non encore ouvert (`opens_at` futur) | Exclu des cibles |
| Allocation dirigée dépassant le reste d'une cible | Refus explicite |
| Allocation dirigée sur un élève non concerné | Refus |

---

## 7. Contrepassation (§58)

Procédure complète en [doc 04 §6](../04-REGLES-METIER-FINANCIERES.md). Points d'implantation :

```
POST /api/v1/payments/:id/reverse
  { reason: "Chèque impayé", partial_amount?: 25000, allocations?: [...] }
```

- Crée un **nouveau** paiement de montant négatif, lié par `reversal_of_payment_id`
- Allocations miroir négatives sur les mêmes cibles
- Paiement d'origine → `REVERSED` (montant inchangé)
- Reçu d'origine annulé, avoir émis avec son propre numéro
- Motif obligatoire, permission `payments.reverse`, approbation direction au-delà du seuil
- Notification au parent

**Ce qui n'arrive jamais** : un `UPDATE payments SET amount = …`, un `DELETE FROM payment_allocations`. Le privilège SQL est retiré, donc même un bug ne peut le faire.

---

## 8. Le reçu (§28)

### Émission
Dans la transaction de `markSuccess`, jamais avant, jamais pour un paiement non abouti.

### Numérotation
`CPL-RCT-{ANNEE}-{SEQ:6}` via `number_sequences`, séquentiel, sans trou, unique par établissement. Le rollback restitue la séquence — c'est pourquoi on n'utilise pas de `SEQUENCE` PostgreSQL.

### Snapshot
Le contenu complet est figé en JSONB à l'émission (structure en [doc 04 §8.3](../04-REGLES-METIER-FINANCIERES.md)). Le PDF n'en est qu'un rendu.

> **Le test qui compte** : émettre un reçu, puis changer l'élève de classe, modifier une remise, renommer l'établissement. Réimprimer le reçu doit produire **exactement** le document initial. Un reçu est une preuve, pas une vue.

### Rendu PDF
`pdfmake`, format A5 ou A4 selon le paramétrage. Contenu du §28 : en-tête établissement avec logo, titre, numéro, élève, matricule, classe, année, objet (issu des allocations), montant en chiffres **et en lettres**, mode, référence opérateur, date, puis total dû / cumul payé / solde. Pied de page : mention légale, signature ou cachet, QR de vérification (optionnel, pointant vers une page publique de contrôle d'authenticité).

Généré en asynchrone après commit, stocké dans `files`. Si la génération échoue, le reçu **existe** en base avec son numéro et son snapshot ; seul le PDF manque, et le job réessaie. La preuve n'est jamais bloquée par un problème de rendu.

### Cycle de vie
Pas de suppression. Contrepassation ⇒ `cancelled_at` + filigrane « ANNULÉ » à la réimpression. Réémission possible (même numéro, même snapshot, nouveau PDF), tracée.

---

## 9. Le solde

Deux vues SQL (définies en [doc 03 section J](../03-MODELE-DONNEES.md)) :
- `v_enrollment_balance` — via le cache `paid_amount`, pour l'affichage
- `v_enrollment_balance_audit` — recalcul intégral depuis les allocations, pour le contrôle

### Job de réconciliation nocturne

```text
Toutes les nuits, pour toutes les inscriptions actives :
  · comparer les deux vues
  · vérifier les 10 points de la checklist du doc 04 §11
  · tout écart → alerte immédiate + rapport
```

Un écart n'est **jamais** corrigé automatiquement. C'est un bug à diagnostiquer, pas une donnée à ajuster.

---

## 10. API

```
GET    /api/v1/payments?school_id&status&method&provider&from&to
                       &class_id&grade_level_id&student_id&min_amount&max_amount
                       &page&page_size&sort
GET    /api/v1/payments/:id                     # + allocations + reçu + historique de statut
POST   /api/v1/payments/:id/reverse
POST   /api/v1/payments/:id/allocate            # allocation dirigée
POST   /api/v1/payments/:id/reallocate          # réaffectation d'une avance

GET    /api/v1/students/:id/payments
GET    /api/v1/enrollments/:id/balance          # le §50
GET    /api/v1/enrollments/:id/statement        # relevé : frais, tranches, paiements, solde

GET    /api/v1/receipts/:id
GET    /api/v1/receipts/:id/pdf                 # URL pré-signée
POST   /api/v1/receipts/:id/reissue
GET    /api/v1/payments/:id/receipt

# Interne / opérations
POST   /api/v1/admin/reconciliation/run
GET    /api/v1/admin/reconciliation/report
```

---

## 11. Interfaces

### C04 — Liste des paiements (lecture seule à ce stade)

```text
Paiements                        [Exporter]  Total période : 3 450 000 FCFA

Période [Aujourd'hui ▾] Statut ▾ Moyen ▾ Classe ▾ Opérateur ▾  🔍 Réf, élève…

Référence          Élève          Classe  Montant  Moyen         Date   Statut
CPL-260819-004923  Nathan Fotso   6e A    50 000   Orange Money  19/08  ● Validé
CPL-260819-004924  Sarah Ngo      3e B    75 000   Banque        19/08  ⏳ À valider
CPL-260819-004925  Marc Belinga   4e A   −25 000   Espèces       19/08  ↩ Contrepassé
```

Filtres du §44. Montants négatifs (contrepassations) affichés distinctement. Chaque ligne ouvre un panneau latéral de détail.

### Détail d'un paiement

```text
CPL-260819-004923                                    ● Validé
50 000 FCFA · Orange Money · OM-39284023 · 19/08/2026 09:11

Payé par      Jean Fotso (+237 699 ••  •• 45)
Enregistré    Application Parent
Reçu          CPL-RCT-2026-000184        [Voir le PDF] [Réimprimer]

AFFECTATION
   Pension scolaire — 2e tranche        50 000
   ─────────────────────────────────────────
   Total affecté                        50 000
   Non affecté                               0

HISTORIQUE
   19/08 09:10  Créé            PENDING       Application Parent
   19/08 09:10  Envoyé          PROCESSING    Orange Money
   19/08 09:11  Confirmé        SUCCESS       Webhook

[Contrepasser]   ← permission payments.reverse
```

### S07 — onglet Paiements

Historique chronologique des paiements de l'élève, toutes années confondues, avec filtre par année. Chaque ligne : date, montant, moyen, statut, affectation résumée, accès au reçu.

L'onglet Finances (Phase 06) affiche désormais des `Payé` réels.

---

## 12. Critères d'acceptation

- [ ] Un paiement de 100 000 sur un élève devant 25 000 (inscription) + 175 000 (pension) crée deux allocations : 25 000 et 75 000
- [ ] Le solde passe de 200 000 à 100 000, calculé par les deux vues à l'identique
- [ ] Un paiement supérieur au reste dû laisse le reliquat en `unallocated_amount`
- [ ] L'avance est réaffectable ultérieurement sans créer de nouveau paiement
- [ ] Un frais indivisible n'est pas partiellement servi
- [ ] `enforce_installment_order` empêche de payer T2 avant T1
- [ ] Deux `markSuccess` concurrents sur le même élève produisent un solde exact (test avec 20 requêtes parallèles)
- [ ] Appeler `markSuccess` deux fois sur le même paiement n'a d'effet qu'une fois
- [ ] Une transition interdite (`FAILED → SUCCESS`) lève une erreur de domaine
- [ ] Une contrepassation ramène le solde à sa valeur antérieure, sans altérer la ligne d'origine
- [ ] Après contrepassation, le paiement d'origine reste visible avec son montant initial
- [ ] Le numéro de reçu est séquentiel, sans trou, même après des transactions annulées
- [ ] Un reçu réimprimé 3 ans plus tard est **identique** à l'original (test : modification de classe, remise et logo entre-temps)
- [ ] Le PDF est conforme au §28, montant en lettres inclus
- [ ] Un échec de génération PDF ne bloque pas le paiement ; le job réessaie
- [ ] Le job de réconciliation ne détecte aucun écart sur un jeu de 1 000 élèves / 5 000 paiements générés
- [ ] `DELETE FROM payments` échoue au niveau des privilèges PostgreSQL
- [ ] Couverture 100 % du moteur d'allocation, avec les 10 scénarios du §6

---

## 13. Risques

| Risque | Impact | Parade |
|---|---|---|
| Double crédit en concurrence | **Critique — argent faux** | Verrou `FOR UPDATE`, idempotence, test de concurrence à 20 requêtes parallèles en CI |
| Un canal court-circuite `markSuccess` | Logiques de solde divergentes | Un seul point d'entrée ; test d'architecture qui interdit d'écrire `status: 'SUCCESS'` hors du service |
| Reçu recalculé au lieu d'être figé | Preuve invalide | `snapshot` JSONB ; test de réimpression après modification du contexte |
| Trou dans la numérotation des reçus | Contestation comptable | `number_sequences` avec verrou de ligne, pas de `SEQUENCE` PostgreSQL |
| Génération PDF dans la transaction | Verrous longs, timeouts en pic de rentrée | Interdit par convention (doc 06 §4) ; revue de code |
| Erreurs d'arrondi dans la cascade | Solde faux d'un franc | Arithmétique entière, `distribute()` testée par propriété |
| Sous-estimation de la phase | Retard en cascade sur 6 phases | Ne rien y ajouter : aucune interface de saisie de paiement ici. Le périmètre est le moteur, point. |
