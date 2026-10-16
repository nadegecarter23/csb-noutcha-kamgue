# PHASE 04 — Responsables & associations

**Durée estimée** : 2 semaines · **Pré-requis** : P03 · **Réf. cahier** : §6, §8, §9, §10, §11, §12, §35, §38, §69, §70, §71, §73, §74

---

## 1. Objectif

Implanter la **dimension RELATION** (§87) : *qui est autorisé à agir pour cet élève ?* C'est la phase la plus sensible du projet en matière de sécurité. Un défaut ici expose les données financières d'une famille à un tiers.

Le principe fondateur du §6 : **l'établissement ne crée pas les comptes parents.** Il déclare des responsables (nom, téléphone). Le parent crée ensuite son propre compte, et le système propose l'association — que le parent doit **accepter** (§8, §9).

---

## 2. Périmètre

### Inclus
- `guardians`, `student_guardians`, `guardian_invites`, `guardian_invite_uses`, `guardian_link_requests`
- Saisie des responsables à l'inscription (section 3 de S06)
- Détection automatique par numéro de téléphone (§8) — **côté backend**
- Cycle de vie de l'association (§9) : proposer, accepter, rejeter, révoquer, expirer
- Codes d'association et QR codes (§11, §12), fiche imprimable
- Demandes d'association initiées par le parent, et contestations (§10, §73)
- Onglet Responsables de la fiche élève (S07 / §38)
- Écran de traitement des demandes en attente
- Révocation d'accès (§74)
- Cloisonnement entre responsables (§71) — sérialiseur dédié

### Exclu
- Les écrans mobiles P04 et P05 (Phase 09) — l'API est livrée ici, l'app la consomme là
- Notifications d'association (Phase 13) — l'événement est émis, le canal viendra

---

## 3. Modèle de données

Détail en [../03-MODELE-DONNEES.md](../03-MODELE-DONNEES.md) section E.

### Le point de conception central

```text
guardians                    ← la PERSONNE (existe sans compte)
    │
    │ user_id (nullable)     ← rempli quand le parent crée son compte CSB Noutcha KAMGUE
    ▼
users                        ← le COMPTE

guardians ──< student_guardians >── students     ← la RELATION, avec son propre statut
```

Trois entités, trois cycles de vie indépendants. Les confondre est l'erreur classique :
- Fusionner `guardians` et `users` ⇒ impossible de déclarer un responsable avant qu'il ait un compte (contredit le §6).
- Omettre le statut sur `student_guardians` ⇒ tout numéro recyclé donne un accès (contredit le §9).

### Contraintes

```sql
-- Un responsable = une personne unique par établissement, identifiée par son numéro
CREATE UNIQUE INDEX uq_guardians_school_phone ON guardians (school_id, phone);

-- Un seul lien par couple élève/responsable
CREATE UNIQUE INDEX uq_student_guardians ON student_guardians (student_id, guardian_id);

-- Un seul responsable principal par élève
CREATE UNIQUE INDEX uq_student_primary_guardian
  ON student_guardians (student_id) WHERE is_primary AND status = 'ACCEPTED';
```

Le premier index a une conséquence forte et voulue : **si Jean Fotso est le père de Nathan et de Sarah, il n'existe qu'un seul `guardian` Jean Fotso**, relié à deux élèves. C'est ce qui rend le §69 (un parent, plusieurs enfants) naturel plutôt que bricolé.

---

## 4. Cycle de vie de l'association (§9)

```text
                    création par l'établissement
                    ou détection automatique
                              │
                              ▼
                        ┌──────────┐
              ┌─────────│ PENDING  │─────────┐
              │         └────┬─────┘         │
       parent accepte        │          parent refuse
              │         expiration            │
              ▼          (TTL)                ▼
        ┌──────────┐        │           ┌──────────┐
        │ ACCEPTED │        ▼           │ REJECTED │
        └────┬─────┘   ┌─────────┐      └──────────┘
             │         │ EXPIRED │            │
   établissement       └─────────┘      signale un litige
   révoque (§74)                        à l'administration (§73)
             ▼
        ┌──────────┐
        │ REVOKED  │
        └──────────┘
```

**Règle absolue** : seul le statut `ACCEPTED` ouvre l'accès aux données de l'élève. Tous les autres statuts sont équivalents à « aucun accès ».

`REJECTED` et `REVOKED` ne suppriment jamais la ligne : c'est une trace, et elle empêche de reproposer indéfiniment la même association. Une association `REJECTED` peut être relancée par l'établissement (retour à `PENDING`) après correction du numéro, avec audit.

---

## 5. Détection automatique des enfants (§8)

Déclenchée juste après la vérification OTP du numéro (Phase 01), et rejouable à la demande.

```text
1. Prendre users.phone (E.164 normalisé, garanti par la Phase 01)
2. Chercher les guardians dont phone = ce numéro, tous établissements confondus
3. Pour chaque guardian trouvé :
     a. si guardian.user_id est NULL → le rattacher à ce compte
     b. si guardian.user_id est un AUTRE utilisateur → NE RIEN FAIRE, créer une alerte
        administrateur (deux comptes revendiquent le même numéro : anomalie)
4. Pour chaque student_guardians de ces guardians :
     · statut PENDING  → présenter au parent pour décision (écran P04)
     · statut ACCEPTED → déjà accessible
     · statut REJECTED / REVOKED → ne pas représenter
5. Retourner la liste des propositions
6. Auditer : guardian.auto_detected
```

**Ce que la détection ne fait jamais** : accorder un accès. Elle ne fait que **proposer**. C'est la différence entre une commodité et une faille.

Endpoint : `GET /api/v1/parent/pending-links` → pour chaque proposition : prénom, nom, matricule **partiellement masqué** (`CPLAN-003••`), classe, établissement, lien de parenté déclaré. Aucune donnée financière avant acceptation.

---

## 6. Codes d'association et QR (§11, §12)

### Ce que contient le QR

**Jamais de données personnelles.** Uniquement un token opaque :

```
cplan://link/{token}
ou https://app.cplan.cm/link/{token}   ← utilisable par n'importe quel appareil photo
```

Le `token` est une valeur aléatoire de 256 bits, encodée en base64url. En base, seul son **hachage** est stocké (`token_hash`) : une fuite de la base ne permet pas de fabriquer un lien valide.

Le `short_code` (`8F7K-PQ4M`) est la version saisissable à la main, dans un alphabet sans ambiguïté (pas de `0`/`O`, `1`/`I`/`L`).

### Contraintes du §12

| Exigence | Implémentation |
|---|---|
| Expirer | `expires_at`, par défaut fin de l'année scolaire ou `invite_token_ttl_days` |
| Être révoqué | `status = REVOKED`, action de l'établissement |
| Usage unique ou limité | `max_uses` (défaut 1), `used_count` |
| Être renouvelé | Nouvelle invitation, révocation implicite de la précédente |
| Être lié à un élève précis | `student_id` NOT NULL |
| Être journalisé | `guardian_invite_uses` : qui, quand, IP, résultat |

Rate limiting sur la consommation de code : 5 tentatives par utilisateur et par heure, pour empêcher le balayage de codes courts.

### Fiche imprimable (§11)

```text
        CSB Noutcha KAMGUE

        Nathan Fotso
        Matricule : CPLAN-00342
        Classe : 6e A

  Associer cet élève à votre application CSB Noutcha KAMGUE

  1. Téléchargez CSB Noutcha KAMGUE sur votre téléphone
  2. Créez votre compte
  3. Scannez ce code

            ┌─────────────┐
            │  [QR CODE]  │
            └─────────────┘

        Ou saisissez le code :
             8F7K-PQ4M

        Valable jusqu'au 30/09/2026
```

Impression unitaire ou en lot (toute une classe), en A4 ou en format demi-page pour découpe.

---

## 7. Demandes et litiges (§10, §73)

### Le parent demande une association (§10)

Quatre voies, une seule table de destination :

| Voie | Traitement |
|---|---|
| Scanner un QR | Automatique — association `ACCEPTED` immédiate si le token est valide |
| Saisir le code court | Automatique — idem |
| Matricule + code sécurisé | Automatique — idem |
| Demander une association | **Manuel** — crée un `guardian_link_requests` en `PENDING` |

La demande manuelle contient : matricule ou nom revendiqué, lien de parenté, message. Elle apparaît dans l'écran de traitement de la scolarité, alimente l'indicateur S01, et **ne donne aucun accès** avant approbation.

### Le parent conteste (§73)

« Ce n'est pas mon enfant » sur l'écran P04 :
```text
1. student_guardians.status = REJECTED
2. Création d'un guardian_link_requests de type DISPUTE
3. Alerte à la scolarité
4. Actions possibles : corriger le numéro · retirer le responsable · renvoyer une invitation
5. Audit complet
```

C'est un signal précieux : il révèle une erreur de saisie ou un numéro obsolète dans la base de l'établissement.

---

## 8. API

```
# Administration
GET    /api/v1/guardians?q=&student_id=
POST   /api/v1/guardians
PATCH  /api/v1/guardians/:id
GET    /api/v1/students/:id/guardians
POST   /api/v1/students/:id/guardians          # rattacher (existant ou nouveau) → PENDING
PATCH  /api/v1/student-guardians/:id           # permissions du lien, is_primary…
POST   /api/v1/student-guardians/:id/revoke    # motif obligatoire (§74)
POST   /api/v1/student-guardians/:id/resend-invite

POST   /api/v1/students/:id/invites            # générer un code/QR
GET    /api/v1/students/:id/invites
POST   /api/v1/invites/:id/revoke
GET    /api/v1/students/:id/invites/print      # PDF fiche d'association
POST   /api/v1/classes/:id/invites/print       # PDF en lot pour une classe

GET    /api/v1/guardian-requests?status=&kind= # demandes et litiges
POST   /api/v1/guardian-requests/:id/approve
POST   /api/v1/guardian-requests/:id/reject

# Parent (garde parentScope)
GET    /api/v1/parent/pending-links            # propositions détectées (P04)
POST   /api/v1/parent/links/:id/accept
POST   /api/v1/parent/links/:id/reject         # crée un DISPUTE
POST   /api/v1/parent/links/redeem             # { token } ou { short_code } (P05)
POST   /api/v1/parent/link-requests            # demande manuelle
GET    /api/v1/parent/children                 # enfants en statut ACCEPTED
```

---

## 9. Interfaces

### S06 — section Responsables

Bloc répétable, avec les champs du §35 : nom, prénom, lien de parenté, téléphone (**obligatoire, normalisé en direct avec aperçu `+237 6 99 12 34 56`**), téléphone secondaire, e-mail, et trois interrupteurs : responsable principal, responsable financier, reçoit les notifications.

**Comportement clé** : la saisie du téléphone déclenche une recherche instantanée dans `guardians`. Si le numéro existe déjà :
```text
ℹ Ce numéro correspond à Jean Fotso, déjà responsable de Sarah Fotso (3e B).
  [Utiliser ce responsable]   [C'est une autre personne]
```
Sans cela, la base se remplit de doublons dès la première fratrie, et le §69 devient inexploitable.

### S07 — onglet Responsables (§38)

```text
┌──────────────────────────────────────────────────────┐
│ Jean Fotso                          Père   ● Principal│
│ +237 699 XX XX XX · jean.fotso@…                     │
│                                                      │
│ Compte CSB Noutcha KAMGUE     ✓ Activé                            │
│ Association      ✓ Acceptée le 12/09/2026            │
│ Resp. financier  Oui    Peut payer  Oui              │
│                                                      │
│ [Modifier] [Révoquer l'accès] [Renvoyer l'invitation]│
├──────────────────────────────────────────────────────┤
│ Marie Fotso                         Mère              │
│ +237 675 XX XX XX                                     │
│ Compte CSB Noutcha KAMGUE     ⏳ Non créé                          │
│ Association      ⏳ En attente                        │
│                                                      │
│ [Modifier] [Envoyer une invitation par SMS]          │
└──────────────────────────────────────────────────────┘

[+ Ajouter un responsable]   [Imprimer la fiche d'association]
```

Trois états d'avancement doivent être lisibles d'un coup d'œil, car ils ne sont pas la même chose : **le responsable est-il déclaré ? a-t-il un compte ? l'association est-elle acceptée ?**

### Révocation (§74)

Modale avec motif obligatoire et avertissement explicite :
> Jean Fotso perdra immédiatement l'accès au dossier de Nathan.
> **Les paiements qu'il a déjà effectués sont conservés** et restent visibles dans l'historique de l'élève.

### Écran — Demandes d'association en attente

Deux onglets : *Demandes* (parents cherchant à s'associer) et *Litiges* (« ce n'est pas mon enfant »). Chaque ligne affiche le demandeur, l'élève revendiqué, la date, le message. Actions : approuver (choix de la parenté et des droits), rejeter (motif), ouvrir la fiche de l'élève.

Cet écran alimente l'indicateur S01 « Associations parents en attente : 34 ».

---

## 10. Sécurité — le point le plus critique du projet

### Garde `parentScope` (rappel du [doc 05](../05-RBAC-PERMISSIONS.md))

Toute route `/parent/*` résout la liste des `student_id` autorisés (`status = ACCEPTED`, `guardian.status = ACTIVE`, `user.status = ACTIVE`) et **injecte cette liste dans le contexte**. Aucun repository appelé dans ce contexte ne peut en sortir.

### Cloisonnement (§71)

Sérialiseur parent dédié, côté serveur :

| Donnée | Vu par le responsable |
|---|---|
| Montant, date, moyen, statut d'un paiement d'un autre responsable | ✔ |
| Nom du payeur | uniquement si c'est lui-même ; sinon « Paiement enregistré » |
| Téléphone du payeur | ✖ |
| Coordonnées des autres responsables | ✖ (prénom + parenté uniquement) |

Le champ **ne quitte pas le serveur**. Masquer côté React ne protège rien : la donnée serait dans la réponse réseau.

### Tests de sécurité obligatoires de la phase

- [ ] Parent A ne peut lire aucune donnée d'un élève auquel il n'est pas associé (toutes les routes `/parent/*`)
- [ ] Une association `PENDING` ne donne aucun accès
- [ ] Une association `REVOKED` coupe l'accès immédiatement (au plus tard à l'expiration du token, 15 min — et immédiatement si l'on révoque aussi la session)
- [ ] Un token d'invitation expiré, révoqué ou déjà consommé est refusé
- [ ] Le QR ne contient aucune donnée personnelle (inspection du contenu encodé)
- [ ] Deviner un `short_code` est impraticable : rate limit vérifié par test
- [ ] Le sérialiseur parent ne fuite jamais le téléphone d'un autre responsable (test sur le JSON brut de la réponse)

---

## 11. Critères d'acceptation

- [ ] La scolarité crée un élève avec deux responsables ; les deux liens sont en `PENDING`
- [ ] Le même numéro saisi pour un second enfant réutilise le `guardian` existant (pas de doublon)
- [ ] Un parent vérifie son OTP et `GET /parent/pending-links` retourne ses trois enfants (§69)
- [ ] Il en accepte deux, en refuse un : les deux acceptés sont accessibles, le refusé ne l'est pas, et un litige est créé
- [ ] Un scan de QR valide crée une association `ACCEPTED` immédiatement
- [ ] Le même QR scanné une seconde fois est refusé (`max_uses = 1`)
- [ ] Un code expiré renvoie un message clair et exploitable
- [ ] Trois responsables d'un même élève ont tous accès (§70), avec des droits distincts respectés
- [ ] La révocation coupe l'accès sans supprimer les paiements historiques
- [ ] La fiche d'association s'imprime, en unitaire et en lot pour une classe
- [ ] L'indicateur S01 « Associations en attente » est exact
- [ ] Toutes les actions sont auditées

---

## 12. Risques

| Risque | Impact | Parade |
|---|---|---|
| Accès accordé sur simple correspondance de numéro | **Critique — fuite de données** | Statut d'association obligatoire ; test de sécurité bloquant en CI |
| Numéro recyclé par l'opérateur | Accès au dossier d'un inconnu | Acceptation explicite + expiration des invitations + revue annuelle des associations |
| Doublons de `guardians` | §69 inexploitable, notifications en double | Index unique `(school_id, phone)` + détection à la saisie |
| Numéro partagé entre plusieurs parents (fréquent) | Un compte voit les enfants de deux familles | L'acceptation explicite reste la barrière. Une alerte administrateur est levée si un numéro couvre des élèves de familles différentes (noms distincts) |
| Parent sans smartphone | Exclusion | L'établissement peut tout faire à sa place ; la caisse reste accessible ; les SMS de notification restent envoyés |
| Fiche QR perdue ou photographiée | Association indue | Usage unique + expiration + journal des usages + révocation possible |
