# PHASE 01 — Identité, rôles & accès

**Durée estimée** : 2 semaines · **Pré-requis** : P00 · **Réf. cahier** : §7, §55, §56, §57, §60, §72, §85

---

## 1. Objectif

Poser la première dimension du §87 côté acteurs : **qui est connecté, pour quel établissement, avec quels droits**. Toutes les phases suivantes s'appuient là-dessus. C'est aussi la phase où l'isolation multi-établissement (§85) est mise en place — la rétro-ajouter serait une réécriture.

---

## 2. Périmètre

### Inclus
- Tables `schools`, `school_settings`, `users`, `staff_profiles`, `roles`, `permissions`, `role_permissions`, `user_roles`, `sessions`, `otp_codes`, `idempotency_keys`, `files`, `number_sequences`, `audit_logs`
- Authentification par mot de passe (personnel) et par téléphone + OTP (parents)
- JWT access + refresh rotatif, révocation de session
- Moteur RBAC (permissions granulaires), gardes serveur et client
- Isolation multi-établissement : contexte de requête, filtrage systématique, RLS PostgreSQL
- Socle du journal d'audit (l'intercepteur ; les actions métier s'y branchent au fil des phases)
- Service de stockage de fichiers (upload, URL pré-signée)
- Service d'envoi SMS (interface + implémentation simulée + un vrai provider)
- Écrans web : connexion, mot de passe oublié, gestion des utilisateurs, gestion des rôles
- Écrans mobile : P01, P02, P03 (création de compte + OTP), **sans** la détection d'enfants (P04, qui relève de la Phase 04/09)

### Exclu
- Détection automatique des enfants (Phase 04 pour le backend, Phase 09 pour l'app)
- Toute donnée scolaire

---

## 3. Modèle de données

Voir [../03-MODELE-DONNEES.md](../03-MODELE-DONNEES.md) sections A et B pour le détail des colonnes.

Points d'attention pour cette phase :

- **`users.phone` en E.164, NOT NULL, UNIQUE.** Un utilitaire `normalizePhone(raw, defaultCountry = 'CM')` dans `packages/domain` est appliqué **à toute entrée**, sans exception. `699123456`, `+237699123456`, `237 699 12 34 56`, `00237699123456` produisent tous `+237699123456`. C'est le pivot de la détection automatique des enfants en Phase 04 — un défaut ici casse la fonctionnalité phare du produit.
- **`users` n'a pas de `school_id`.** Le rattachement passe par `user_roles`.
- **`number_sequences`** est créée ici bien qu'exploitée en Phase 03 (matricules) et 07 (reçus) : elle appartient au socle.
- **`audit_logs`** : table `append-only`, privilèges `UPDATE`/`DELETE` retirés à `cplan_app`.

### Seed de référence (migration idempotente)
- 1 établissement de démonstration + ses `school_settings`
- Les 8 rôles natifs du §55
- Le catalogue complet des permissions du [doc 05](../05-RBAC-PERMISSIONS.md)
- Les associations rôle → permissions selon la matrice
- Un utilisateur par rôle pour les tests

---

## 4. Authentification

### 4.1 Deux parcours distincts

| | Personnel (web) | Parent (mobile) |
|---|---|---|
| Identifiant | E-mail **ou** téléphone | Téléphone |
| Preuve | Mot de passe | Mot de passe + OTP à l'inscription |
| Création du compte | Par un administrateur (invitation) | Auto-inscription |
| Durée du refresh | 12 h | 30 jours |
| MFA | Non en V1 | OTP à l'inscription et au changement de numéro |

### 4.2 Endpoints

```
POST /api/v1/auth/register            # parent : prénom, nom, téléphone, email?, mot de passe (P02)
POST /api/v1/auth/otp/send            # purpose: SIGNUP | LOGIN | PHONE_CHANGE | PASSWORD_RESET
POST /api/v1/auth/otp/verify          # (P03) → phone_verified_at + tokens
POST /api/v1/auth/login               # identifiant + mot de passe
POST /api/v1/auth/refresh             # rotation du refresh token
POST /api/v1/auth/logout              # révoque la session courante
POST /api/v1/auth/logout-all          # révoque toutes les sessions de l'utilisateur
GET  /api/v1/auth/me                  # profil + rôles + permissions + établissements
POST /api/v1/auth/password/forgot     # → OTP ou lien e-mail
POST /api/v1/auth/password/reset
PATCH /api/v1/auth/password           # changement, exige le mot de passe actuel
POST /api/v1/auth/phone-change/request  # (§72) OTP sur l'ancien numéro
POST /api/v1/auth/phone-change/confirm  #       puis OTP sur le nouveau
GET  /api/v1/auth/sessions            # liste des appareils connectés
DELETE /api/v1/auth/sessions/:id      # déconnexion à distance
```

### 4.3 Règles OTP (§7)

| Paramètre | Valeur |
|---|---|
| Longueur | 6 chiffres, tirage cryptographique |
| Durée de vie | 5 minutes |
| Stockage | **haché** (SHA-256 + sel) — jamais en clair, ni en base, ni dans les logs |
| Tentatives | 5 maximum, puis invalidation du code |
| Renvoi | cooldown 60 s, 3 envois maximum par heure et par numéro |
| Rate limit | par numéro **et** par IP (Redis) |
| Réponse | **identique** que le numéro existe ou non (anti-énumération) |

En développement, l'OTP est écrit dans les logs et renvoyé dans la réponse **uniquement si `NODE_ENV !== 'production'`** — protégé par un test qui échoue si ce comportement fuit en production.

### 4.4 Changement de numéro (§72)

```text
Demande (authentifié) → OTP sur l'ANCIEN numéro → vérification
   → saisie du nouveau numéro → contrôle d'unicité → OTP sur le NOUVEAU
   → confirmation → mise à jour de users.phone
   → révocation de toutes les sessions sauf la courante
   → audit : user.phone_change (ancien et nouveau, masqués)
   → notification à l'ancien numéro : « Votre numéro a été modifié »
```

Si l'ancien numéro est inaccessible (cas fréquent), l'établissement peut le modifier côté `guardians`, avec permission `guardians.update`, motif obligatoire et audit. Le lien `guardian → user` est alors rompu et une nouvelle invitation est émise.

---

## 5. RBAC

```ts
// Fastify preHandler
requirePermission('students.create')
requireAnyPermission(['payments.read', 'payments.read_own'])
requireSchoolContext()     // injecte school_id et vérifie l'appartenance
```

L'access token porte `sub`, `school_id`, `roles[]`, `permissions[]`, `jti`, `exp`. Charge utile plafonnée : si les permissions dépassent une taille raisonnable, seuls les rôles sont embarqués et les permissions sont résolues en cache Redis.

**Changement de rôle ⇒ révocation des sessions** de l'utilisateur concerné (sinon il conserve ses anciens droits jusqu'à 15 minutes).

### Test d'architecture obligatoire
Un test parcourt la table de routage Fastify et **échoue** si une route `POST`/`PATCH`/`PUT`/`DELETE` n'a ni `requirePermission` ni le marqueur explicite `config.public = true`. C'est ce test qui garantit qu'aucune route ne sera oubliée dans les 16 phases suivantes.

---

## 6. Isolation multi-établissement (§85)

### Barrière 1 — applicative
`AsyncLocalStorage` porte le contexte de requête (`request_id`, `user_id`, `school_id`, `permissions`). Chaque méthode de repository touchant une table à `school_id` **exige** ce paramètre — typé, non optionnel. Un test d'architecture (analyse statique) échoue si une requête Prisma sur une table concernée est écrite sans clause `school_id`.

### Barrière 2 — PostgreSQL RLS
```sql
ALTER TABLE students ENABLE ROW LEVEL SECURITY;
CREATE POLICY school_isolation ON students
  USING (school_id = current_setting('app.school_id', true)::uuid);
```
`SET LOCAL app.school_id = '…'` est positionné en début de chaque transaction applicative. Le rôle `cplan_migrator` (BYPASSRLS) n'est pas soumis à la politique.

*Pourquoi les deux ?* La barrière applicative est celle qui donne des messages d'erreur utiles ; la RLS est le filet qui empêche qu'un oubli devienne une fuite de données. Sur un produit destiné à devenir SaaS, ce doublon est peu coûteux et décisif.

### Utilisateur multi-établissement
Un parent ayant des enfants dans deux écoles reçoit un token sans `school_id` figé ; le périmètre est résolu par élève. Un membre du personnel affecté à plusieurs écoles bascule via `POST /auth/switch-school`, qui réémet un token.

---

## 7. Journal d'audit — socle

```ts
await audit.log({
  action: 'user.assign_roles',
  entityType: 'user', entityId: userId,
  oldValues: { roles: ['CASHIER'] },
  newValues: { roles: ['CASHIER', 'ACCOUNTANT'] },
  metadata: { reason: 'promotion' },
});
```

Écrit **dans la transaction métier** : si l'action est annulée, le log l'est aussi. Diff automatique des champs modifiés uniquement. Champs sensibles (`password_hash`, `code_hash`, `token_hash`) exclus par une liste noire centralisée.

---

## 8. Interfaces

### Web
| Écran | Contenu |
|---|---|
| Connexion | Identifiant + mot de passe, gestion du verrouillage, lien mot de passe oublié |
| Mot de passe oublié / réinitialisation | Parcours complet |
| Liste des utilisateurs | Table : nom, e-mail, téléphone, rôles, statut, dernière connexion. Filtres rôle/statut |
| Création / édition d'utilisateur | Coordonnées, poste, rôles (cases à cocher), envoi d'invitation |
| Détail d'un rôle | Permissions groupées par domaine, cases à cocher. Rôles système en lecture seule |
| Mon profil | Coordonnées, changement de mot de passe, sessions actives avec déconnexion à distance |

Le layout applicatif construit son menu à partir des permissions du token.

### Mobile
| Écran | Réf. | Contenu |
|---|---|---|
| Bienvenue | **P01** | Logo, message, `Créer un compte`, `Se connecter` |
| Création de compte | **P02** | Prénom, nom, téléphone (indicatif +237 pré-rempli), e-mail facultatif, mot de passe + confirmation, acceptation des CGU, `Continuer` |
| Vérification du numéro | **P03** | 6 cases OTP, saisie automatique depuis le SMS (Android), compte à rebours de renvoi, `Vérifier` |
| Connexion | — | Téléphone + mot de passe, mot de passe oublié |
| Accueil | — | Placeholder « Aucun enfant associé » (complété en Phase 09) |

Validation du mot de passe : 8 caractères minimum, indicateur de robustesse. Pas d'exigence de caractères spéciaux (contre-productive sur mobile).

---

## 9. Critères d'acceptation

- [ ] Un parent crée son compte (P02), reçoit un SMS, valide l'OTP (P03) et obtient `phone_verified_at`
- [ ] Un OTP expiré, déjà consommé ou saisi 6 fois est refusé avec le bon code d'erreur
- [ ] Trois demandes d'OTP en une heure sur le même numéro : la quatrième est refusée en 429
- [ ] `+237699123456`, `699123456`, `00237 699 12 34 56` créent **le même** utilisateur ; le doublon est refusé
- [ ] Un membre du personnel se connecte, son menu correspond exactement à ses permissions
- [ ] Un caissier appelant `POST /fee-structures` reçoit un 403
- [ ] La rotation du refresh token fonctionne ; rejouer un refresh consommé révoque toute la famille de sessions
- [ ] Retirer un rôle déconnecte l'utilisateur dans la seconde
- [ ] Un utilisateur de l'école A ne voit aucune donnée de l'école B, **même en forçant le `school_id` dans l'URL**
- [ ] La RLS bloque une requête émise sans `app.school_id`
- [ ] Le test d'architecture « toute route mutative a une permission » passe
- [ ] Les actions de sécurité apparaissent dans `audit_logs` avec l'auteur, l'IP et le diff
- [ ] Aucun OTP ni mot de passe dans les logs (test de rédaction)
- [ ] Le parcours de changement de numéro (§72) fonctionne de bout en bout

---

## 10. Risques

| Risque | Impact | Parade |
|---|---|---|
| Normalisation de téléphone incorrecte | **Critique** — la détection automatique des enfants (§8) ne marche plus | Bibliothèque `libphonenumber-js`, table de tests avec 30 formats réels camerounais |
| Coût / fiabilité du SMS | OTP non reçus, inscription bloquée | Interface `SmsProvider` + 2 implémentations (provider principal + repli), monitoring du taux de livraison, saisie manuelle possible par le support |
| Recyclage des numéros par les opérateurs | Un nouveau titulaire accède à l'ancien compte | Précisément le rôle du statut d'association (§9, Phase 04). Ne jamais accorder d'accès sur la seule correspondance de numéro. |
| RLS mal configurée bloquant les migrations | Déploiement en échec | Rôle `cplan_migrator` avec BYPASSRLS, testé en CI |
| Sur-conception du RBAC | Retard | S'en tenir au catalogue du doc 05 ; pas de permissions par enregistrement en V1 |
