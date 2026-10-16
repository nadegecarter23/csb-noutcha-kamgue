# PHASE 16 — Audit, sécurité & confidentialité

**Durée estimée** : 2 semaines · **Pré-requis** : P12 (transversale, à finaliser avant la mise en production) · **Réf. cahier** : §9, §12, §55, §56, §57, §58, §71, §74, §81 (règles 9, 10)

---

## 1. Objectif

Cette phase ne développe presque aucune fonctionnalité nouvelle. Elle **vérifie, complète et durcit** ce que les quinze phases précédentes ont construit.

Le journal d'audit et le contrôle d'accès ont été mis en place au fil de l'eau (Phase 01 pour le socle, chaque phase pour ses propres actions). Cette phase s'assure qu'il n'existe **aucun trou** : aucune action sensible non tracée, aucune route sans permission, aucune fuite entre responsables, aucun secret exposé.

C'est la phase qui permet de répondre « oui » à la dernière clause du §88 : *« chaque opération effectuée est traçable »*.

---

## 2. Périmètre

### Inclus
- Écran de consultation du journal d'audit
- Revue exhaustive : toute action sensible du doc 05 §8 écrit-elle un log ?
- Revue exhaustive : toute route mutative a-t-elle une permission ?
- Tests de cloisonnement parent (§71) sur l'intégralité des routes
- Durcissement : en-têtes, rate limiting, validation des entrées, gestion des secrets
- Immuabilité des données financières, vérifiée au niveau des privilèges PostgreSQL
- Politique de rétention et de purge des données
- Test d'intrusion interne (checklist OWASP)
- Documentation de sécurité et procédures d'incident

### Exclu
- Certification externe (hors périmètre V1, à envisager si CSB Noutcha KAMGUE devient SaaS)
- Chiffrement applicatif au niveau colonne (le chiffrement du provider suffit à cette échelle)

---

## 3. Journal d'audit — consultation

### Écran

```text
  Journal d'audit

  Période [7 derniers jours ▾]  Utilisateur ▾  Action ▾  Entité ▾
  🔍 Rechercher…

  ┌──────────────────────────────────────────────────────────────┐
  │ 19/08 10:15   Marie Ngo (Comptable)                          │
  │ Validation d'un paiement externe                             │
  │ Paiement PAY-000248 · 75 000 FCFA · Nathan Fotso             │
  │ Montant déclaré 80 000 → crédité 75 000                      │
  │ 192.168.1.42 · Chrome / Windows                    [Détail]  │
  ├──────────────────────────────────────────────────────────────┤
  │ 19/08 09:48   Paul Mbarga (Scolarité)                        │
  │ Changement de classe                                         │
  │ Nathan Fotso · 6e A → 6e B                                   │
  │ Motif : « Rééquilibrage des effectifs »            [Détail]  │
  └──────────────────────────────────────────────────────────────┘
```

Filtres : période, utilisateur, action, type d'entité, identifiant d'entité, adresse IP. Le détail affiche le diff complet `old_values` / `new_values` sous forme lisible, pas du JSON brut.

Deux entrées supplémentaires vers ce journal, plus utiles que l'écran global :
- **Onglet Historique de la fiche élève** — filtré sur cet élève, rédigé en langage métier
- **Historique d'un paiement** — sa chronologie complète de statuts

Accès : `audit.read`. Le comptable accède au périmètre financier ; l'administrateur et le directeur, à tout.

Le journal est **append-only**. Personne, y compris `SUPER_ADMIN`, ne peut le modifier ni le purger depuis l'application.

---

## 4. Revue de couverture de l'audit

Exercice systématique : pour chacune des actions listées au [doc 05 §8](../05-RBAC-PERMISSIONS.md), vérifier qu'un log est écrit, qu'il contient l'auteur, l'entité, le diff, le motif quand il est requis, et qu'il est écrit dans la transaction métier.

Un test automatisé le garantit durablement :

```ts
// __tests__/audit-coverage.spec.ts
// Pour chaque action de la liste AUDITED_ACTIONS :
//   1. exécuter l'action via l'API
//   2. vérifier qu'exactement une ligne audit_logs est créée
//   3. vérifier user_id, entity_type, entity_id, et le diff
// Une action ajoutée à AUDITED_ACTIONS sans implémentation fait échouer la CI.
```

Champs exclus par liste noire centralisée : `password_hash`, `code_hash`, `token_hash`, `refresh_token_hash`, tout secret de provider.

---

## 5. Revue du contrôle d'accès

### Tests automatisés obligatoires

```ts
// 1. Couverture des permissions
//    Toute route POST/PATCH/PUT/DELETE a requirePermission ou config.public = true
//    (déjà en place depuis la Phase 01 — vérifié à nouveau ici, exhaustivement)

// 2. Matrice rôles × routes
//    Pour chaque rôle du doc 05 × chaque route :
//    la réponse (2xx ou 403) correspond exactement à la matrice
//    → détecte toute permission accordée par erreur

// 3. Cloisonnement parent
//    Pour chaque route /parent/* :
//    · parent non associé          → 403 ou 404
//    · association PENDING         → 403
//    · association REVOKED         → 403
//    · can_view_finances = false   → 403 sur les routes financières
//    · can_pay = false             → 403 sur les routes de paiement

// 4. Isolation multi-établissement
//    Pour chaque route portant un identifiant :
//    un utilisateur de l'école A accédant à une ressource de l'école B → 404
//    (404, pas 403 : ne pas révéler l'existence de la ressource)

// 5. Confidentialité entre responsables (§71)
//    Sur le JSON BRUT des réponses parent, aucune occurrence :
//    · du téléphone d'un autre responsable
//    · du nom d'un autre payeur
//    · d'une donnée d'un élève non associé
```

Le test 5 est le plus important de la phase, et il doit porter sur la charge utile brute, pas sur ce qu'affiche l'interface.

---

## 6. Immuabilité financière (§58, règle 9)

Vérifications, au niveau base de données et non applicatif :

```sql
-- Ces privilèges ne doivent pas exister pour cplan_app
REVOKE DELETE ON payments, payment_allocations, receipts, audit_logs FROM cplan_app;
REVOKE UPDATE ON audit_logs FROM cplan_app;

-- Colonnes immuables après SUCCESS : trigger de garde
CREATE TRIGGER trg_payments_immutable
  BEFORE UPDATE ON payments FOR EACH ROW
  WHEN (OLD.status = 'SUCCESS')
  EXECUTE FUNCTION prevent_financial_mutation();
  -- seules status → REVERSED et les colonnes de métadonnées non financières
  -- sont autorisées
```

Tests : toute tentative de `DELETE FROM payments`, de modification du montant d'un paiement `SUCCESS`, ou d'écriture dans `audit_logs` échoue **au niveau PostgreSQL**. Le code applicatif n'est pas la seule barrière : un bug ou une console SQL mal utilisée ne doit pas pouvoir effacer une trace financière.

---

## 7. Durcissement

| Domaine | Mesures |
|---|---|
| **En-têtes HTTP** | Helmet, HSTS (1 an, `preload`), CSP, `X-Content-Type-Options`, `Referrer-Policy: strict-origin` |
| **CORS** | Liste blanche stricte, aucun joker |
| **Rate limiting** | Global par IP ; renforcé sur `/auth/*` (10/min), `/otp/*` (3/h par numéro), `/links/redeem` (5/h) ; par utilisateur sur les endpoints coûteux (exports, rapports) |
| **Validation** | Zod sur 100 % des entrées, y compris les paramètres d'URL et de requête. Corps limité à 1 Mo (10 Mo sur les téléversements) |
| **Téléversements** | Type MIME et **magic bytes** vérifiés (pas seulement l'extension), taille limitée, nom de fichier assaini, stockage hors racine web, pas d'exécution possible |
| **Injection SQL** | Requêtes paramétrées uniquement ; les `$queryRaw` de reporting passent en revue de code obligatoire |
| **XSS** | Échappement par React ; `dangerouslySetInnerHTML` interdit par règle ESLint |
| **Secrets** | Aucun dans le dépôt ; gestionnaire de secrets en production ; rotation documentée ; `gitleaks` en CI |
| **Dépendances** | `pnpm audit` en CI, Dependabot, blocage sur vulnérabilité critique |
| **Mots de passe** | Argon2id ; comparaison à temps constant ; verrouillage progressif après échecs |
| **Sessions** | Rotation des refresh tokens, détection de réutilisation, révocation en cascade |
| **Journalisation** | Rédaction systématique ; test qui échoue si un mot de passe, un OTP ou un token apparaît dans les logs |

---

## 8. Confidentialité & données personnelles

CSB Noutcha KAMGUE traite des données de **mineurs** et des données **financières familiales**. Même sans obligation réglementaire locale contraignante, les principes suivants s'appliquent :

| Principe | Application |
|---|---|
| Minimisation | Ne collecter que ce dont l'établissement a besoin. La photo de l'élève est facultative. |
| Finalité | Les données servent à la scolarité et au recouvrement, à rien d'autre. |
| Accès restreint | Le caissier n'a pas besoin de la date de naissance ; masquer ce qui n'est pas utile à la tâche. |
| Traçabilité des accès | Les consultations de masse (exports, listes complètes) sont auditées. |
| Rétention | Politique explicite (§9 ci-dessous). |
| Droit d'accès | Un parent peut exporter les données de son enfant. |
| Sécurité en transit et au repos | HTTPS obligatoire ; chiffrement au repos par le provider ; sauvegardes chiffrées. |

### Cloisonnement entre responsables (§71) — récapitulatif

Déjà implémenté en Phase 04, revérifié ici de façon exhaustive : les données financières appartiennent au **dossier de l'élève**, pas au responsable qui a payé. Chaque responsable voit l'intégralité de la situation financière de l'enfant, mais rien des données personnelles des autres responsables.

---

## 9. Rétention et purge

| Donnée | Rétention | Motif |
|---|---|---|
| Codes OTP consommés ou expirés | 7 jours | Aucune utilité au-delà |
| Sessions expirées | 90 jours | Investigation de sécurité |
| `idempotency_keys` | 24 h | Durée de la protection |
| Événements de webhook | 1 an | Litiges opérateur |
| Journal d'audit | **10 ans** | Obligation comptable |
| Paiements, reçus, allocations | **10 ans** | Obligation comptable |
| Élèves et inscriptions | Illimité (archivage) | Historique scolaire, attestations |
| Justificatifs de paiement | 10 ans | Pièces comptables |
| Exports générés | 30 jours | Fichiers temporaires |
| Notifications | 1 an | Confort utilisateur |

Job de purge quotidien, journalisé. Une purge est une opération auditée, jamais silencieuse.

---

## 10. Checklist de sécurité avant mise en production

### Authentification et sessions
- [ ] Argon2id, paramètres conformes
- [ ] Rotation des refresh tokens et détection de réutilisation
- [ ] Verrouillage progressif après échecs de connexion
- [ ] Révocation de session sur changement de rôle ou de mot de passe
- [ ] OTP haché, limité en tentatives et en fréquence
- [ ] Réponses anti-énumération sur `/auth/*` et `/otp/*`

### Autorisation
- [ ] Aucune route mutative sans permission
- [ ] Matrice rôles × routes conforme au doc 05
- [ ] Cloisonnement parent vérifié sur toutes les routes `/parent/*`
- [ ] Isolation multi-établissement vérifiée (applicative **et** RLS)
- [ ] Aucune fuite de données d'un autre responsable dans les charges utiles brutes

### Données financières
- [ ] `DELETE` impossible sur `payments`, `payment_allocations`, `receipts`, `audit_logs`
- [ ] Modification d'un paiement `SUCCESS` bloquée par trigger
- [ ] Toute correction passe par contrepassation
- [ ] Job de réconciliation actif, avec alerte

### Audit
- [ ] Toutes les actions du doc 05 §8 sont tracées
- [ ] Diff, auteur, IP, motif présents
- [ ] `audit_logs` en append-only au niveau des privilèges
- [ ] Test de couverture d'audit vert

### Infrastructure
- [ ] HTTPS obligatoire, HSTS actif
- [ ] En-têtes de sécurité vérifiés (score A sur un scanner d'en-têtes)
- [ ] Rate limiting actif et testé
- [ ] Aucun secret dans le dépôt (`gitleaks` vert)
- [ ] Aucune vulnérabilité critique en dépendance
- [ ] Sauvegardes chiffrées, **restauration testée**
- [ ] Journalisation sans données sensibles
- [ ] Alertes configurées (paiement bloqué, écart de réconciliation, webhook en échec, pic d'erreurs)

### Application mobile
- [ ] Tokens dans `expo-secure-store`, jamais dans `AsyncStorage`
- [ ] Aucune donnée sensible en clair dans le cache local
- [ ] Détection d'appareil compromis (avertissement, non bloquant)
- [ ] Aucun secret d'API embarqué dans le bundle

---

## 11. Procédure d'incident

Documentée et **testée en simulation** avant la mise en production :

```text
1. DÉTECTER   — alerte automatique, signalement utilisateur, anomalie de réconciliation
2. CONTENIR   — révoquer les sessions concernées, désactiver le compte,
                couper un canal de paiement si nécessaire
3. ÉVALUER    — exploiter le journal d'audit : quoi, qui, quand, quelle ampleur
4. CORRIGER   — contrepassation pour les erreurs financières, correction du code
5. NOTIFIER   — l'établissement dans tous les cas ; les parents si leurs données
                ou leur argent sont concernés
6. DOCUMENTER — analyse post-incident écrite, sans recherche de responsable individuel
7. PRÉVENIR   — test de non-régression ajouté systématiquement
```

Contacts d'escalade, accès d'urgence et procédure de restauration documentés et accessibles hors de la plateforme.

---

## 12. Critères d'acceptation

- [ ] L'écran de journal d'audit est fonctionnel, filtrable, avec diff lisible
- [ ] Le test de couverture d'audit passe pour toutes les actions du doc 05 §8
- [ ] Les 5 familles de tests d'accès du §5 passent intégralement
- [ ] Aucune fuite détectée dans les charges utiles brutes des routes parent
- [ ] `DELETE FROM payments` échoue au niveau PostgreSQL
- [ ] La modification d'un paiement `SUCCESS` échoue au niveau du trigger
- [ ] `gitleaks` ne détecte aucun secret dans l'historique du dépôt
- [ ] `pnpm audit` : aucune vulnérabilité critique ou haute
- [ ] Le scan d'en-têtes HTTP obtient un score A
- [ ] Aucun mot de passe, OTP ni token dans les logs (test automatisé)
- [ ] Le rate limiting est effectif sur `/auth`, `/otp`, `/links/redeem`
- [ ] La restauration d'une sauvegarde a été réalisée avec succès sur un environnement de test
- [ ] La politique de rétention est implémentée et le job de purge fonctionne
- [ ] La procédure d'incident est documentée et une simulation a été menée
- [ ] La checklist du §10 est intégralement cochée

---

## 13. Risques

| Risque | Impact | Parade |
|---|---|---|
| Faille découverte après la mise en production | Fuite de données de mineurs et de familles | Tests de sécurité automatisés en CI dès la Phase 01, pas seulement ici |
| Audit incomplet | Impossible d'expliquer une anomalie financière | Test de couverture qui échoue sur toute action non tracée |
| Journal d'audit inexploitable (trop de bruit) | Personne ne le consulte | N'auditer que les actions sensibles ; consultations de masse tracées séparément |
| Compte partagé malgré la règle | Traçabilité nulle | Un compte par personne, détection des connexions simultanées depuis des IP distinctes |
| Sauvegarde jamais restaurée | Perte de données définitive | Test de restauration mensuel, obligatoire et documenté |
| Sécurité perçue comme un frein | Contournements par les utilisateurs | Ergonomie soignée : la voie sûre doit être la plus simple |
