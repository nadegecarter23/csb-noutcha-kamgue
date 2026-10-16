# PHASE 12 — Paiements externes & validation comptable

**Durée estimée** : 2 semaines · **Pré-requis** : P07, P10 · **Réf. cahier** : §25, §26, §45, §46, §49, §66

---

## 1. Objectif

Traiter les paiements effectués **hors de la plateforme** : virement bancaire, dépôt en banque, chèque, ou tout autre canal accepté par l'établissement.

C'est le seul parcours du produit qui repose sur **un jugement humain**. Un parent déclare avoir payé et fournit un justificatif ; un comptable vérifie et décide. Toute la conception de la phase découle de cette asymétrie : la déclaration ne vaut pas paiement, et le système doit rendre cet écart visible sans ambiguïté pour les deux parties.

---

## 2. Périmètre

### Inclus
- Écran P14 — déclaration d'un paiement, avec justificatif
- Suivi du statut côté parent (§26)
- Écran C05 — file de validation comptable
- Validation, rejet motivé, demande de correction
- Validation avec **montant corrigé** (le comptable constate 45 000 là où 50 000 étaient déclarés)
- Photographie et import de justificatif, stockage sécurisé
- Alerte sur les déclarations en attente au-delà du délai (§49)
- Notifications de résultat

### Exclu
- Rapprochement bancaire automatisé (V2)
- Lecture automatique des reçus (OCR) — évoqué comme piste, pas en V1

---

## 3. Parcours (§66)

```text
  PARENT                          CSB Noutcha KAMGUE                     COMPTABLE
    │                               │                            │
 1. Ouvre l'enfant                  │                            │
 2. Payer → Paiement externe        │                            │
 3. Saisit montant, banque,         │                            │
    date, référence                 │                            │
 4. Photographie le justificatif    │                            │
    ├──── POST /parent/payments/external ──►                     │
    │                          5. payment = AWAITING_VALIDATION  │
    │                             external_payment_proof créé    │
    │◄──── « En attente de vérification » ──┤                    │
 6. Statut visible (§26)            │                            │
    │                               ├──── apparaît dans C05 ────►│
    │                               │                       7. Ouvre le
    │                               │                          justificatif
    │                               │                       8. Compare
    │                               │◄─── valide / rejette ──────┤
    │                          9A. VALIDER :                     │
    │                              markSuccess() ← Phase 07      │
    │                              allocations, solde, reçu      │
    │                          9B. REJETER :                     │
    │                              status = REJECTED             │
    │                              motif OBLIGATOIRE             │
    │◄──── notification ────────────┤                            │
10. Voit le résultat                │                            │
```

**Point structurant** : la validation appelle `markSuccess` de la Phase 07 — exactement la même méthode que la caisse et le Mobile Money. Aucune logique de solde n'est réécrite ici.

---

## 4. Côté parent

### P14 — Déclarer un paiement (§25)

```text
  ←  Déclarer un paiement

  Élève
  ┌────────────────────────────────┐
  │  Nathan Fotso · 6e A           │
  └────────────────────────────────┘

  Montant payé
  [           50 000  ] FCFA

  Mode de paiement
  [  Virement bancaire        ▾ ]
     Virement bancaire
     Dépôt bancaire
     Chèque
     Autre

  Banque
  [  Afriland First Bank      ▾ ]

  Date du paiement
  [  18 / 08 / 2026            ]

  Référence de l'opération
  [  TX349482                  ]

  Observations (facultatif)
  [                            ]

  JUSTIFICATIF  (obligatoire)
  ┌────────────────────────────────┐
  │  📷  Photographier le reçu     │
  │  📎  Importer un document      │
  └────────────────────────────────┘

  ℹ  Votre déclaration sera vérifiée
     par la comptabilité. Le montant
     ne sera crédité qu'après
     validation.

     [  Envoyer pour validation  ]
```

Points d'attention :
- Le justificatif est **obligatoire**. Sans preuve, la validation est impossible et la file se remplit de dossiers ingérables.
- Photo : compression avant envoi (viser moins de 1 Mo), aperçu, possibilité de reprendre, plusieurs pages autorisées (bordereau recto/verso).
- La date ne peut être postérieure à aujourd'hui, ni antérieure au début de l'année scolaire.
- Le message d'avertissement est affiché **avant** l'envoi, pas seulement après : le parent doit comprendre dès le départ que déclarer n'est pas payer.
- Détection de doublon : une déclaration de même montant, même référence et même élève dans les 7 jours déclenche un avertissement.

### Suivi (§26)

```text
  ┌────────────────────────────────┐
  │  ⏳  En attente de vérification│
  │                                │
  │      50 000 FCFA               │
  │      Nathan Fotso              │
  │      Virement · Afriland       │
  │      Déclaré le 18 août        │
  │                                │
  │  Ce montant n'est pas encore   │
  │  déduit de votre solde.        │
  │                                │
  │  [ Voir le justificatif ]      │
  │  [ Annuler la déclaration ]    │
  └────────────────────────────────┘
```

Le solde affiché sur P08 **n'inclut pas** les déclarations en attente. Une mention distincte apparaît sous le solde : « 50 000 FCFA en cours de vérification ». Les mélanger induirait le parent en erreur.

Le parent peut annuler sa déclaration tant qu'elle n'est pas traitée.

### En cas de rejet

```text
  ┌────────────────────────────────┐
  │  ✕  Déclaration rejetée        │
  │                                │
  │  Motif :                       │
  │  Le montant du reçu (45 000)   │
  │  diffère du montant déclaré    │
  │  (50 000).                     │
  │                                │
  │  [ Corriger et renvoyer ]      │
  └────────────────────────────────┘
```

`Corriger et renvoyer` pré-remplit une nouvelle déclaration avec les données précédentes — le parent ne ressaisit pas tout.

---

## 5. Côté comptable

### C05 — File de validation (§45)

```text
  Paiements à valider                              17 en attente

  [Tous ▾]  [Trier : plus anciens ▾]     ⚠ 3 en attente depuis plus de 48 h

  ┌───────────────────────────────────────────────────────────┐
  │  ⚠  Nathan Fotso · 6e A · CPLAN-00342         il y a 3 j  │
  │                                                           │
  │  Montant déclaré       50 000 FCFA                        │
  │  Mode                  Virement bancaire                  │
  │  Banque                Afriland First Bank                │
  │  Référence             TX349482                           │
  │  Date déclarée         18/08/2026                         │
  │  Déclaré par           Jean Fotso (Père)                  │
  │                                                           │
  │  Situation de l'élève  Dû 200 000 · Payé 125 000          │
  │                        Reste 75 000                       │
  │                                                           │
  │  ┌─────────────────┐                                      │
  │  │  [justificatif] │  [ Agrandir ]  [ Télécharger ]       │
  │  └─────────────────┘                                      │
  │                                                           │
  │  [ Valider ]  [ Rejeter ]  [ Demander une correction ]    │
  └───────────────────────────────────────────────────────────┘
```

Ergonomie du traitement en série : visionneuse d'image intégrée (zoom, rotation, plein écran), navigation au clavier entre les dossiers, traitement enchaîné sans retour à la liste. Un comptable peut avoir 30 déclarations à traiter un lundi matin.

Le contexte financier de l'élève est affiché à côté du justificatif : c'est ce qui permet de repérer une incohérence (un virement de 200 000 sur un élève qui doit 75 000).

### Validation

```text
  ┌──────────────────────────────────────┐
  │  Valider le paiement                 │
  │                                      │
  │  Montant déclaré      50 000 FCFA    │
  │  Montant à créditer                  │
  │  [        50 000  ] FCFA             │← modifiable
  │                                      │
  │  Date de valeur   [ 18/08/2026 ]     │
  │                                      │
  │  Affectation                         │
  │  ● Automatique                       │
  │  ○ Choisir les frais                 │
  │     Pension — 2e tranche   50 000    │
  │                                      │
  │  Note interne                        │
  │  [                              ]    │
  │                                      │
  │        [ Annuler ]  [ Valider ]      │
  └──────────────────────────────────────┘
```

**Le montant à créditer est modifiable.** C'est indispensable : le justificatif fait foi, pas la déclaration. Si le comptable crédite un montant différent de celui déclaré, la déclaration est marquée comme corrigée, le parent est notifié du montant retenu, et l'écart est tracé (`declared_amount` vs `payments.amount`).

La `paid_at` retenue est la **date figurant sur le justificatif**, pas la date de validation. Le paiement doit s'imputer sur le bon exercice.

### Rejet (§46)

Motif **obligatoire**, avec des motifs courants pré-proposés :
- Montant du reçu différent du montant déclaré
- Justificatif illisible
- Justificatif ne correspondant pas à l'établissement
- Référence introuvable au relevé bancaire
- Doublon d'une déclaration déjà validée
- Autre (texte libre)

Le motif est **envoyé tel quel au parent** — il doit donc être rédigé de façon compréhensible et courtoise. L'interface le rappelle.

### Demande de correction

Statut intermédiaire `CORRECTION_REQUESTED` : la déclaration n'est ni validée ni rejetée, le parent est invité à fournir un meilleur justificatif ou une précision. Utile quand le doute est levable, et cela évite un rejet suivi d'une nouvelle déclaration.

### Alerte de délai (§49)

Les déclarations en attente depuis plus de `external_payment_sla_hours` (48 h par défaut) sont signalées dans C05, remontées dans l'indicateur « Paiements en validation » de C01, et déclenchent une notification quotidienne au comptable.

---

## 6. API

```
# Parent
POST   /api/v1/parent/payments/external      # multipart : données + fichier(s)
GET    /api/v1/parent/payments/external      # ses déclarations et leur statut
POST   /api/v1/parent/payments/:id/cancel-declaration
GET    /api/v1/parent/payments/:id/proof     # URL pré-signée

# Comptabilité
GET    /api/v1/external-payments?status=&overdue=&from=&to=&class_id=
GET    /api/v1/external-payments/:id
GET    /api/v1/external-payments/:id/proof
POST   /api/v1/external-payments/:id/validate
       { credited_amount, value_date, allocations?, internal_note? }
POST   /api/v1/external-payments/:id/reject           { reason }
POST   /api/v1/external-payments/:id/request-correction { message }
GET    /api/v1/external-payments/stats                # pour C01
```

`POST /parent/payments/external` crée en une transaction : le `file`, le `payment` en `AWAITING_VALIDATION`, et l'`external_payment_proof`. Le fichier est envoyé dans un stockage privé ; aucune URL publique n'est jamais générée.

---

## 7. Règles métier

1. Une déclaration crée un `payment` en `AWAITING_VALIDATION` — **jamais** en `SUCCESS`.
2. Un paiement `AWAITING_VALIDATION` n'a **aucune** allocation et n'affecte pas le solde (§26).
3. Le justificatif est obligatoire.
4. La validation exige la permission `payments.validate_external` (comptable ou administrateur — pas le caissier).
5. Le rejet exige un motif non vide.
6. Le montant crédité peut différer du montant déclaré ; l'écart est tracé et notifié.
7. La date de valeur retenue est celle du justificatif.
8. Une déclaration validée devient un paiement ordinaire : reçu, allocations, historique.
9. Une déclaration rejetée peut être renvoyée corrigée ; l'ancienne reste en trace.
10. Le parent peut annuler sa déclaration tant qu'elle est en attente.
11. Une erreur de validation se corrige par contrepassation (Phase 07), pas par modification.
12. Le justificatif est conservé et lié au paiement de façon permanente — c'est une pièce comptable.

---

## 8. Critères d'acceptation

- [ ] Un parent déclare un paiement avec photo en moins de 90 s
- [ ] La déclaration apparaît dans C05 en moins de 5 s
- [ ] Le solde du parent **n'est pas** modifié par la déclaration
- [ ] La mention « en cours de vérification » est visible et distincte du solde
- [ ] Le comptable ouvre le justificatif, zoome, et valide
- [ ] La validation crée les allocations, met à jour le solde et émet le reçu
- [ ] Une validation avec montant corrigé crédite le bon montant, trace l'écart, notifie le parent
- [ ] La date de valeur retenue est celle du justificatif, pas celle de la validation
- [ ] Un rejet sans motif est refusé par l'API
- [ ] Le motif de rejet est visible par le parent, dans les mêmes termes
- [ ] `Corriger et renvoyer` pré-remplit la nouvelle déclaration
- [ ] La demande de correction laisse la déclaration en attente
- [ ] Une déclaration de plus de 48 h est signalée dans C05 et dans C01
- [ ] Un caissier ne peut pas valider (403)
- [ ] Le justificatif n'est accessible que par URL pré-signée à durée courte
- [ ] Une déclaration en doublon déclenche un avertissement
- [ ] Toutes les décisions sont auditées avec leur auteur et leur motif

---

## 9. Risques

| Risque | Impact | Parade |
|---|---|---|
| Parent qui croit avoir payé dès la déclaration | Litige, incompréhension | Message explicite avant **et** après envoi, statut visible, solde non modifié, mention séparée |
| Faux justificatif | Perte financière | Contrôle humain, montant modifiable, rapprochement bancaire manuel, journal d'audit |
| File de validation qui s'accumule | Parents mécontents, appels | Alerte à 48 h, indicateur en page d'accueil comptable, notification quotidienne |
| Justificatifs illisibles | Aller-retours interminables | Compression maîtrisée côté app, aperçu avant envoi, statut « demande de correction » plutôt que rejet |
| Fuite d'un justificatif (RIB, données bancaires) | Atteinte à la vie privée | Stockage privé, URL pré-signée 5 min, permission contrôlée, accès audité |
| Double comptabilisation (déclaré puis encaissé aussi à la caisse) | Solde faux | Détection de doublon, contexte financier affiché dans C05, réconciliation bancaire |
| Validation par erreur | Solde faux | Contrepassation disponible, action auditée, confirmation explicite avec récapitulatif |
