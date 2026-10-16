# PHASE 11 — Paiement Mobile Money

**Durée estimée** : 3 semaines · **Pré-requis** : P07, P10 · **Réf. cahier** : §20, §21, §22, §23, §24, §65

---

## 1. Objectif

Permettre au parent de payer depuis son téléphone via **MTN Mobile Money** et **Orange Money**.

C'est la fonctionnalité la plus visible du produit et la plus risquée techniquement : elle fait intervenir un tiers, de l'asynchrone, de l'argent réel, et des modes d'échec nombreux. La règle qui gouverne toute la phase :

> **En cas de doute sur l'issue d'une transaction, on ne crédite pas.** Un paiement manquant se rattrape ; un double crédit se découvre trois mois plus tard, dans un désaccord avec le parent.

---

## 2. Périmètre

### Inclus
- Interface `PaymentProvider` et deux implémentations (MTN MoMo, Orange Money)
- Écrans P09 (montant), P10 (moyen de paiement), P11 (attente), P12 (succès), P13 (échec)
- Initiation de paiement, suivi de statut, webhooks
- Réconciliation automatique des transactions en suspens
- Idempotence de bout en bout
- Écran comptable de suivi des transactions opérateur
- Provider simulé pour le développement et les tests

### Exclu
- Autres opérateurs (Express Union, agrégateurs) — l'architecture les accueille sans modification du moteur
- Remboursement automatisé
- Paiement multi-enfants (§52) — le modèle le supporte, l'interface reste mono-enfant en V1

---

## 3. Décision préalable — intégration directe ou agrégateur

**À trancher avec le client avant le début de la phase.** Elle change l'estimation de 3 semaines à 5.

| | Intégration directe MTN + Orange | Agrégateur régional |
|---|---|---|
| Délai de mise en place | 4 à 10 semaines (contractuel, pas technique) | 1 à 2 semaines |
| Commission | Plus faible | Plus élevée (+0,5 à 1,5 pt) |
| Développement | 2 intégrations distinctes, 2 sandboxes | 1 intégration |
| Fiabilité | Dépend de chaque opérateur | Point de défaillance unique, mais qualité de service contractuelle |
| Réconciliation | 2 tableaux de bord opérateur | 1 seul |
| Ajout d'un opérateur | Nouveau développement | Configuration |

**Recommandation** : intégration directe pour la V1 (coût par transaction plus faible sur des montants scolaires élevés, relation directe avec l'opérateur en cas de litige), **mais lancer les démarches contractuelles dès la Phase 00**. Les délais d'obtention d'un compte marchand et d'un accès production sont la contrainte réelle, pas le code.

Quel que soit le choix, l'interface `PaymentProvider` isole complètement le reste du système : basculer vers un agrégateur reste un changement local.

---

## 4. Architecture d'intégration

```ts
interface PaymentProvider {
  readonly code: 'MTN_MOMO' | 'ORANGE_MONEY';

  initiate(input: {
    amount: number;              // FCFA entiers
    payerPhone: string;          // E.164
    externalId: string;          // notre payment.id — clé d'idempotence côté opérateur
    description: string;         // « Scolarité Nathan Fotso — CSB Noutcha KAMGUE »
    callbackUrl: string;
  }): Promise<{ providerReference: string; status: ProviderStatus; deepLink?: string }>;

  getStatus(providerReference: string): Promise<{
    status: ProviderStatus;      // PENDING | SUCCESS | FAILED
    amount?: number;
    financialTransactionId?: string;
    reason?: string;
  }>;

  verifyWebhook(headers, rawBody): { valid: boolean; reason?: string };
  parseWebhook(payload): ProviderEvent;
}
```

Trois implémentations : `MtnMomoProvider`, `OrangeMoneyProvider`, `FakeProvider` (développement et tests — simule succès, échec, délai, timeout, webhook en double, webhook hors séquence).

Chaque provider gère son propre schéma d'authentification (jetons OAuth avec rafraîchissement, clés d'abonnement), son propre format de webhook, ses propres codes d'erreur — traduits vers un vocabulaire commun.

---

## 5. Parcours (§65)

```text
  PARENT                    CSB Noutcha KAMGUE                     OPÉRATEUR
    │                         │                            │
 1. Choisit le montant (P09)  │                            │
 2. Choisit l'opérateur (P10) │                            │
    ├────── POST /payments ──►│                            │
    │       + Idempotency-Key │                            │
    │                    3. Contrôles :                    │
    │                       montant, reste dû,             │
    │                       frais ouvert, can_pay          │
    │                    4. payment = PENDING              │
    │                       référence générée              │
    │                         ├──── initiate() ───────────►│
    │                         │                       5. Demande
    │                         │◄─── providerReference ─────┤   de paiement
    │                    6. payment = PROCESSING           │
    │◄─── payment_id ─────────┤                            │
 7. Écran d'attente (P11)     │                            │
    │                         │                       8. Notification
    │◄──────────────────────────────── push USSD ──────────┤   sur le téléphone
 9. Saisit son code secret ───────────────────────────────►│
    │                         │                      10. Débit
    │                         │◄──── webhook ──────────────┤
    │                    11. Vérifier :                    │
    │                        signature, montant,           │
    │                        référence, doublon            │
    │                    12. markSuccess()  ← Phase 07     │
    │                        allocations, solde, reçu      │
    │◄─── polling / push ─────┤                            │
13. Écran de succès (P12)     │                            │
    │                    14. Notification, audit           │
```

**Points de contrôle avant même de créer le paiement** (étape 3) : montant > 0, ≤ reste dû (sauf surpaiement autorisé), le frais visé est ouvert, l'année est active, le responsable a `can_pay = true`, aucun paiement `PROCESSING` en cours pour ce parent et cet élève.

---

## 6. Écrans

### P09 — Choisir un montant (§20)

```text
  ←   Payer

      Nathan Fotso
      6e A

      Reste à payer
      75 000 FCFA

  MONTANT

      [        75 000        ] FCFA

  Suggestions
  [ 25 000 ]  [ 50 000 ]  [ 75 000 · tout solder ]

  Ce paiement couvrira
     Pension — 2e tranche      35 000
     Pension — 3e tranche      40 000

              [  Continuer  ]
```

L'aperçu d'affectation est calculé par l'API (`GET /parent/simulate-allocation`) — jamais côté client, sinon il divergerait du calcul serveur.

Les suggestions s'adaptent : montant de la prochaine tranche, moitié du reste, solde total. Si le frais interdit le montant libre, seuls les montants valides sont proposés et la saisie est verrouillée.

### P10 — Moyen de paiement (§20)

```text
  Comment souhaitez-vous payer ?

  ┌────────────────────────────────┐
  │  ⬤  MTN Mobile Money           │
  │     +237 6 99 12 34 56         │
  └────────────────────────────────┘
  ┌────────────────────────────────┐
  │  ○  Orange Money               │
  │     Utiliser un autre numéro   │
  └────────────────────────────────┘
  ┌────────────────────────────────┐
  │  ○  Virement / dépôt bancaire  │  ← Phase 12
  └────────────────────────────────┘

  Frais de transaction : 0 FCFA
  Total à débiter : 75 000 FCFA

              [  Payer  ]
```

Le numéro du compte est pré-rempli mais **modifiable** : le père paie souvent depuis un autre numéro que celui déclaré. Détection automatique de l'opérateur d'après le préfixe (65/67/68 = MTN, 69/655-659 = Orange — à vérifier et paramétrer, les plages évoluent).

Les frais de transaction, s'ils sont à la charge du payeur, doivent être affichés **avant** validation. Aucune surprise sur le montant débité.

### P11 — Attente (§22)

```text
            ⟳

      Paiement en cours

         50 000 FCFA

  Une demande de confirmation a été
  envoyée au

      +237 6 99 12 34 56

  Veuillez valider la transaction
  sur votre téléphone en saisissant
  votre code secret.

      ⏱  Expire dans 4:32

  [  Vérifier le paiement  ]
  [       Annuler          ]
```

Comportement :
- Interrogation du statut toutes les 3 s pendant 30 s, puis toutes les 10 s jusqu'à 5 min.
- Bouton `Vérifier` pour une vérification immédiate à la demande.
- **Résistance au redémarrage** : le `payment_id` est persisté localement ; rouvrir l'app pendant un paiement en cours ramène sur cet écran.
- `Annuler` ne fait qu'abandonner le suivi côté app — il n'annule pas la transaction opérateur. Le libellé doit le dire : « Arrêter le suivi. Si vous avez déjà validé sur votre téléphone, le paiement sera pris en compte. »
- Au-delà de 5 min : passage à un écran « Vérification en cours », avec promesse de notification. **Jamais** de déclaration d'échec sur simple timeout côté client.

### P12 — Succès (§23)

```text
            ✓

      Paiement réussi

         50 000 FCFA

      Nathan Fotso · 6e A
      Orange Money

      Référence
      CPL-260819-004923

      Nouveau solde
      25 000 FCFA

  [ Télécharger le reçu ]
  [ Retour à l'accueil  ]
```

### P13 — Échec (§24)

```text
            ✕

  Le paiement n'a pas abouti

  Aucun montant n'a été débité de
  votre compte, et rien n'a été
  crédité au compte de Nathan.

  Motif : solde insuffisant

  [ Réessayer ]
  [ Changer de moyen de paiement ]
```

Le motif doit être **traduit en langage clair** : « solde insuffisant », « transaction refusée », « délai dépassé », « numéro invalide » — jamais un code d'erreur opérateur brut.

La phrase « Aucun montant n'a été débité » n'est affichée que si l'opérateur l'a **confirmé**. En cas d'incertitude, l'écran est différent : « Nous vérifions cette transaction. Vous serez notifié sous quelques minutes. »

---

## 7. Webhooks

```
POST /api/v1/webhooks/mtn-momo
POST /api/v1/webhooks/orange-money
```

Traitement, dans cet ordre strict :

```text
1. Enregistrer l'événement brut dans payment_provider_events (raw_payload)
   → si (provider, event_id) existe déjà : répondre 200 et SORTIR
2. Vérifier la signature. Invalide → consigner, alerter, répondre 200, ne rien traiter
   (répondre 200 évite que l'opérateur rejoue indéfiniment ; l'alerte fait le reste)
3. Retrouver le paiement par provider_reference ou par notre externalId
   → introuvable : consigner, alerter (transaction orpheline), 200
4. Verrouiller le paiement (FOR UPDATE), relire son statut
   → déjà SUCCESS : 200, sortir (idempotence)
5. Vérifier que le MONTANT confirmé est égal au montant attendu
   → écart : NE PAS créditer, statut ANOMALIE, alerte immédiate
6. Appeler markSuccess() ou markFailed()
7. Marquer l'événement comme traité
8. Répondre 200 rapidement (moins de 3 s ; tout le reste est asynchrone)
```

Sécurité : liste blanche d'IP quand l'opérateur la fournit, vérification de signature obligatoire, corps brut conservé avant tout parsing (la signature porte sur les octets exacts), délai maximal accepté entre l'horodatage de l'événement et sa réception (anti-rejeu).

**Ne jamais faire confiance au webhook seul.** Pour les montants élevés, ou en cas de doute, un appel `getStatus()` de confirmation auprès de l'opérateur avant de créditer est justifié. Le webhook déclenche la vérification ; il ne la remplace pas.

---

## 8. Réconciliation

Trois mécanismes complémentaires, car aucun n'est suffisant seul :

| Mécanisme | Fréquence | Rôle |
|---|---|---|
| Webhook | Temps réel | Chemin nominal |
| Polling de secours | Toutes les minutes, sur les paiements `PROCESSING` de moins de 30 min | Rattrape les webhooks perdus |
| Réconciliation nocturne | Quotidienne | Compare le relevé opérateur aux paiements en base |

### Job de polling
```text
Pour chaque payment PROCESSING créé il y a plus de 60 s :
   getStatus(providerReference)
   SUCCESS  → markSuccess()
   FAILED   → markFailed(motif)
   PENDING  → laisser ; au-delà de 30 min → statut PENDING_INVESTIGATION + alerte
```

### Réconciliation nocturne
Import du relevé opérateur (API ou fichier), rapprochement par référence. Trois anomalies possibles, toutes signalées et **jamais corrigées automatiquement** :
- transaction chez l'opérateur, absente chez nous → argent reçu non crédité (le plus grave pour le parent)
- transaction chez nous, absente chez l'opérateur → crédit indu
- montants divergents

---

## 9. Modes d'échec à traiter explicitement

| Situation | Comportement attendu |
|---|---|
| Le parent ne valide jamais | Timeout opérateur → `FAILED`, aucune écriture |
| Le parent valide après l'expiration de l'écran | Le webhook arrive plus tard → `SUCCESS` + notification. **Le paiement est pris en compte.** |
| Webhook jamais livré | Rattrapé par le polling |
| Webhook livré 5 fois | Traité une seule fois (`event_id` unique) |
| Webhook livré avant la réponse d'`initiate()` | Le paiement existe déjà en `PENDING` (créé avant l'appel opérateur) : traitement correct |
| L'app est tuée pendant l'attente | Reprise sur `payment_id` persisté |
| Double clic sur `Payer` | `Idempotency-Key` : une seule transaction |
| Montant confirmé ≠ montant demandé | Aucun crédit, anomalie, alerte |
| Opérateur indisponible | Message clair, proposition d'un autre moyen, aucune transaction créée |
| Réseau coupé après `initiate()` | Le paiement existe en `PROCESSING` ; le webhook ou le polling conclut ; notification |

Chacune de ces lignes est un **test automatisé** avec le provider simulé. C'est le livrable de qualité le plus important de la phase.

---

## 10. API

```
POST /api/v1/parent/payments                 # Idempotency-Key obligatoire
     { student_id, enrollment_id, amount, provider, payer_phone, allocations? }
GET  /api/v1/parent/payments/:id/status      # polling
POST /api/v1/parent/payments/:id/cancel      # abandon du suivi
GET  /api/v1/parent/simulate-allocation?enrollment_id=&amount=

POST /api/v1/webhooks/mtn-momo
POST /api/v1/webhooks/orange-money

GET  /api/v1/payments/pending-investigation  # suivi comptable
POST /api/v1/payments/:id/force-check        # vérification manuelle auprès de l'opérateur
GET  /api/v1/admin/provider-events?provider=&status=
POST /api/v1/admin/reconciliation/mobile-money
```

---

## 11. Critères d'acceptation

- [ ] Un paiement MTN aboutit de bout en bout en sandbox
- [ ] Idem Orange Money
- [ ] Les 10 modes d'échec du §9 sont couverts par des tests avec le provider simulé
- [ ] Rejouer 10 fois le même webhook ne crédite qu'une fois
- [ ] Un webhook à signature invalide n'a aucun effet et déclenche une alerte
- [ ] Un webhook dont le montant diffère ne crédite pas
- [ ] Un webhook arrivé après l'abandon de l'écran crédite quand même et notifie
- [ ] Le polling rattrape un webhook non livré en moins de 2 minutes
- [ ] Un double clic sur `Payer` ne crée qu'une transaction
- [ ] Tuer l'app pendant l'attente puis la rouvrir ramène sur P11
- [ ] P13 n'affirme « aucun montant débité » que si l'opérateur l'a confirmé
- [ ] Le reçu est disponible en moins de 10 s après le succès
- [ ] Le paiement apparaît immédiatement côté établissement (§65, étape 19)
- [ ] La réconciliation nocturne détecte les trois types d'anomalie sur un jeu de test
- [ ] Un paiement bloqué plus de 30 min déclenche une alerte
- [ ] Ajouter un troisième opérateur ne demande aucune modification du moteur de paiement (démontré avec un provider factice)
- [ ] Aucun secret opérateur dans le code ni dans les logs

---

## 12. Risques

| Risque | Impact | Parade |
|---|---|---|
| Délais contractuels d'accès production | **Retard de plusieurs mois** | Lancer les démarches dès la Phase 00. Prévoir l'agrégateur en repli. |
| Double crédit | **Critique — argent faux** | `event_id` unique, `provider_reference` unique, verrou, idempotence, tests dédiés |
| Argent débité, élève non crédité | **Critique — confiance détruite** | Polling + réconciliation nocturne + alerte + procédure de traitement documentée |
| Sandbox opérateur instable ou peu représentative | Bugs découverts en production | Tests d'abord sur le provider simulé ; validation de bout en bout sur des transactions réelles de faible montant |
| Documentation opérateur incomplète ou obsolète | Perte de temps importante | Prévoir une marge ; établir un contact technique chez l'opérateur dès le début |
| Frais de transaction non anticipés | Litige sur le montant | Afficher les frais avant validation ; décider avec le client qui les supporte |
| Numéros hors opérateur sélectionné | Échecs incompréhensibles | Détection du préfixe, avertissement avant envoi |
| Panne d'un opérateur en période de rentrée | File d'attente à la caisse | Repli explicite vers l'autre opérateur, la caisse et le virement ; bandeau d'information dans l'app |
