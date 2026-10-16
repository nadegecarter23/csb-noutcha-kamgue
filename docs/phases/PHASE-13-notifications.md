# PHASE 13 — Notifications & relances

**Durée estimée** : 2 semaines · **Pré-requis** : P11, P12 · **Réf. cahier** : §29, §63, §79

---

## 1. Objectif

Transformer CSB Noutcha KAMGUE d'un outil **consulté** en un outil qui **informe**. Un parent ne doit pas avoir à ouvrir l'application pour savoir que son paiement est validé ou qu'une échéance approche.

L'enjeu opérationnel est direct : les relances automatiques d'échéance sont le levier le plus efficace sur le taux de recouvrement, qui est l'indicateur central du dashboard Direction (§53).

**Contrainte dominante** : le SMS coûte de l'argent (~15 à 25 FCFA l'unité). Avec 1 500 parents, une campagne de relance coûte 25 000 FCFA. La stratégie de canal doit donc être explicite, paramétrable et mesurée.

---

## 2. Périmètre

### Inclus
- `notifications`, `notification_deliveries`, `device_tokens`, `notification_preferences`
- Canaux : IN_APP, PUSH (FCM via Expo), SMS, EMAIL
- Moteur de modèles de messages, en français
- Notifications événementielles (§29)
- Relances programmées d'échéance (§79)
- Préférences parent et configuration établissement
- Centre de notifications dans l'app (branchement de l'écran de la Phase 10)
- Suivi de livraison, coûts, statistiques

### Exclu
- WhatsApp Business (modèle prêt, intégration V2)
- Messagerie bidirectionnelle établissement–parents (§83, V2)
- Notifications aux membres du personnel autres que les alertes opérationnelles

---

## 3. Architecture

```text
Événement métier                    Fabrique de notification
(payment.succeeded,      ─────►     · à qui ? (responsables concernés)
 installment.due_soon,              · quel modèle ?
 link.proposed, …)                  · quels canaux ?
                                            │
                                            ▼
                                  notifications (1 ligne)
                                            │
                          ┌─────────────────┼─────────────────┐
                          ▼                 ▼                 ▼
                notification_deliveries (1 par canal)
                          │                 │                 │
                       IN_APP             PUSH               SMS
                    (immédiat)          (Expo/FCM)        (provider)
                          │                 │                 │
                          └─────────► statut, coût, erreur ◄──┘
```

Un événement métier ne connaît **jamais** les canaux. Il émet un fait ; la fabrique décide du reste, selon les préférences du destinataire et la configuration de l'établissement. C'est ce qui permet d'ajouter WhatsApp plus tard sans toucher au code des paiements.

Émission via BullMQ, avec réessais (3 tentatives, recul exponentiel) et file d'échecs à traiter.

---

## 4. Catalogue des notifications

### Événementielles (§29)

| Type | Déclencheur | Destinataires | Canaux par défaut |
|---|---|---|---|
| `PAYMENT_CONFIRMED` | `payment → SUCCESS` | Payeur + responsables financiers | PUSH + IN_APP |
| `PAYMENT_FAILED` | `payment → FAILED` | Payeur | PUSH + IN_APP |
| `EXTERNAL_PAYMENT_VALIDATED` | Validation comptable | Déclarant + resp. financiers | PUSH + IN_APP + SMS |
| `EXTERNAL_PAYMENT_REJECTED` | Rejet comptable | Déclarant | PUSH + IN_APP + SMS |
| `EXTERNAL_PAYMENT_CORRECTION` | Demande de correction | Déclarant | PUSH + IN_APP |
| `PAYMENT_REVERSED` | Contrepassation | Responsables financiers | PUSH + IN_APP + SMS |
| `GUARDIAN_LINK_PROPOSED` | Association créée | Parent concerné | SMS (il n'a peut-être pas encore l'app) |
| `GUARDIAN_LINK_APPROVED` | Demande approuvée | Demandeur | PUSH + IN_APP |
| `GUARDIAN_LINK_REVOKED` | Accès révoqué | Responsable concerné | PUSH + SMS |
| `RECEIPT_AVAILABLE` | Reçu généré | Payeur | IN_APP |
| `ENROLLMENT_CREATED` | Réinscription | Responsables | PUSH + IN_APP |

### Programmées (§79)

| Type | Déclencheur | Canaux |
|---|---|---|
| `INSTALLMENT_DUE_SOON` | J−7 puis J−1 avant l'échéance (paramétrable) | PUSH + IN_APP |
| `INSTALLMENT_DUE_TODAY` | Jour de l'échéance | PUSH + IN_APP |
| `INSTALLMENT_OVERDUE` | J+7, J+15, J+30 après l'échéance | PUSH + IN_APP + SMS |
| `BALANCE_REMINDER` | Mensuel, si solde débiteur (activable) | PUSH |

### Internes (personnel)

| Type | Destinataires |
|---|---|
| `EXTERNAL_PAYMENT_PENDING_SLA` | Comptables — déclarations en attente > 48 h |
| `PAYMENT_STUCK` | Comptables + technique — paiement `PROCESSING` > 30 min |
| `RECONCILIATION_MISMATCH` | Comptables + technique — écart détecté |
| `GUARDIAN_REQUEST_PENDING` | Scolarité — demandes d'association en attente |
| `CASH_SESSION_VARIANCE` | Comptables — écart de caisse |

---

## 5. Modèles de messages

Stockés en base, modifiables par l'établissement sans déploiement. Variables interpolées, avec **variantes par canal** — un SMS n'est pas un push.

```yaml
PAYMENT_CONFIRMED:
  push:
    title: "Paiement confirmé ✓"
    body:  "{{amount}} FCFA pour {{student_name}}"
  in_app:
    title: "Paiement confirmé"
    message: "Votre paiement de {{amount}} FCFA pour {{student_name}} a été confirmé.
              Nouveau solde : {{balance}} FCFA."
  sms:
    body: "CSB Noutcha KAMGUE: Paiement de {{amount}} FCFA recu pour {{student_name}}.
           Solde: {{balance}} FCFA. Recu {{receipt_number}}."

INSTALLMENT_DUE_SOON:
  push:
    title: "Échéance dans {{days}} jours"
    body:  "{{installment_name}} de {{student_name}} — {{amount}} FCFA"
  sms:
    body: "CSB Noutcha KAMGUE: La {{installment_name}} de {{student_name}} ({{amount}} FCFA)
           arrive a echeance le {{due_date}}."
```

**Contraintes SMS** : 160 caractères en GSM-7. Les accents font basculer en UCS-2 (70 caractères, donc 2 à 3 SMS facturés). Les modèles SMS sont donc **sans accents**, volontairement — et un contrôle en refuse l'enregistrement s'ils en contiennent ou dépassent la longueur.

Chaque notification porte un `data` de navigation profonde :
```jsonc
{ "screen": "payment_detail", "payment_id": "…", "student_id": "…" }
```
Ouvrir une notification doit mener **exactement** à l'écran concerné, jamais à l'accueil.

---

## 6. Règles d'envoi

### Choix des destinataires

Pour un événement lié à un élève, les destinataires sont les responsables tels que :
```
student_guardians.status = 'ACCEPTED'
  AND can_receive_notifications = true
  AND guardian.user_id IS NOT NULL
  AND user.status = 'ACTIVE'
```
Pour un événement financier, on ajoute `can_view_finances = true`.
Pour la confirmation d'un paiement, le payeur est **toujours** notifié, plus les responsables financiers.

**Cloisonnement (§71)** : le message envoyé à Marie ne mentionne jamais que le paiement a été fait par Jean. « Un paiement de 50 000 FCFA a été enregistré pour Nathan » — pas de nom de payeur.

### Choix des canaux

```text
1. Canaux par défaut du type de notification
2. ∩ préférences de l'utilisateur
3. ∩ configuration de l'établissement (le SMS peut être désactivé globalement pour maîtriser le coût)
4. Si PUSH prévu mais aucun device_token valide → repli sur SMS pour les types critiques uniquement
5. IN_APP est toujours créé, sans exception : c'est la trace
```

### Anti-spam

- **Groupement** : plusieurs échéances le même jour pour la même famille = une seule notification (« 3 échéances arrivent à terme cette semaine »).
- **Plafond** : 5 notifications par utilisateur et par jour, hors événements de paiement (toujours prioritaires).
- **Heures ouvrables** : les relances programmées ne partent qu'entre 8 h et 19 h, heure de Douala. Un SMS de relance à 3 h du matin détruit la relation.
- **Déduplication** : une même relance n'est pas envoyée deux fois pour la même échéance.

---

## 7. Canaux

### PUSH — Expo Notifications / FCM
Jeton enregistré à la connexion (`POST /parent/devices`), rafraîchi au lancement, révoqué à la déconnexion. Un utilisateur peut avoir plusieurs appareils. Les jetons invalides retournés par FCM sont supprimés automatiquement.

### SMS
Interface `SmsProvider` avec deux implémentations (principal + repli) et une simulée. Suivi du coût par message dans `notification_deliveries.cost` : un écran de synthèse permet à l'établissement de voir combien lui coûtent ses relances. Sans cette visibilité, la fonctionnalité sera désactivée en panique au premier relevé.

### EMAIL
Optionnel, pour les parents ayant renseigné une adresse. Utile pour l'envoi des reçus en pièce jointe.

### IN_APP
Toujours créé. Alimente le centre de notifications et la pastille de compteur.

---

## 8. Configuration

### Côté établissement
```text
Rappels avant échéance      [7]  [1]   jours
Rappels après échéance      [7] [15] [30] jours
Canal SMS                   ☑ activé
  Types autorisés en SMS    ☑ Paiement validé   ☑ Rejet
                            ☑ Retard             ☐ Rappel avant échéance
Plafond SMS mensuel         [50 000] FCFA   ← arrêt automatique au-delà, avec alerte
Heures d'envoi              08:00 → 19:00
Modèles de messages         [Modifier]
```

### Côté parent
```text
Notifications push                    ☑
Paiements                             ☑
Échéances et rappels                  ☑
Actualités de l'établissement         ☑
SMS                                   ☑
  (Les notifications essentielles restent envoyées)
```

Certaines notifications sont **non désactivables** : rejet de paiement, contrepassation, révocation d'accès. Ce sont des informations que le parent doit recevoir.

---

## 9. API

```
GET   /api/v1/parent/notifications?unread_only=&page=
POST  /api/v1/parent/notifications/:id/read
POST  /api/v1/parent/notifications/read-all
GET   /api/v1/parent/notification-preferences
PATCH /api/v1/parent/notification-preferences
POST  /api/v1/parent/devices          { token, platform, app_version }
DELETE /api/v1/parent/devices/:token

GET   /api/v1/notification-templates
PATCH /api/v1/notification-templates/:type
POST  /api/v1/notification-templates/:type/preview
GET   /api/v1/notifications/stats     # envoyés, livrés, échoués, coût par canal et par période
POST  /api/v1/notifications/broadcast # message ponctuel à une classe ou à tous (usage encadré)
```

---

## 10. Critères d'acceptation

- [ ] Un paiement validé déclenche une notification push reçue en moins de 10 s
- [ ] Appuyer sur la notification ouvre l'écran du paiement, pas l'accueil
- [ ] Une association créée par l'établissement envoie un SMS au parent
- [ ] Le rejet d'un paiement externe notifie par push **et** SMS, avec le motif
- [ ] La relance J−7 part le bon jour, à l'heure ouvrable, une seule fois
- [ ] Trois échéances le même jour pour la même famille donnent une seule notification
- [ ] Un SMS ne dépasse pas 160 caractères et ne contient aucun accent
- [ ] Aucune notification n'est envoyée entre 19 h et 8 h
- [ ] Un parent qui désactive les SMS ne reçoit plus que du push, sauf pour les types essentiels
- [ ] Le plafond SMS mensuel arrête les envois et alerte l'établissement
- [ ] Un jeton push invalide est supprimé automatiquement
- [ ] Le centre de notifications affiche l'historique, le compteur de non-lues est exact
- [ ] Les notifications ne révèlent jamais l'identité du payeur à un autre responsable (§71)
- [ ] L'échec d'un envoi est réessayé 3 fois puis consigné, sans bloquer le métier
- [ ] Le suivi des coûts est exact et consultable
- [ ] Une panne du fournisseur SMS n'empêche ni les paiements ni les autres canaux

---

## 11. Risques

| Risque | Impact | Parade |
|---|---|---|
| Coût des SMS non maîtrisé | Facture inattendue, désactivation en urgence | Plafond mensuel, suivi du coût par type, canaux configurables, push privilégié |
| Sur-sollicitation des parents | Désinstallation, notifications coupées | Groupement, plafond quotidien, heures ouvrables, préférences fines |
| Notifications envoyées avant que le fait soit acquis | Confusion (« paiement confirmé » puis rétractation) | Émission **après commit** uniquement, jamais dans la transaction |
| Fuite d'information entre responsables | Conflit familial | Modèles sans identité de payeur ; revue de chaque modèle sur ce point |
| Push non reçu (batterie, restrictions constructeur) | Le parent n'est pas informé | IN_APP toujours créé ; repli SMS sur les types critiques ; ne jamais dépendre du seul push |
| Erreur dans un modèle envoyée à 1 500 parents | Embarras, appels massifs | Prévisualisation obligatoire, envoi de test, validation à deux personnes sur la diffusion générale |
| Fuseau horaire mal géré | Envois nocturnes | Tous les calculs de fenêtre en `Africa/Douala`, testés |
