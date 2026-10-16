# 05 — Rôles, permissions & matrice d'accès

Référence cahier : §55, §56, §70, §71, §74.

Principe directeur du §55 : **chaque employé possède un compte individuel**. Aucun compte partagé. Sans cela, le journal d'audit (§57) ne vaut rien.

---

## 1. Modèle

```text
user ──< user_roles >── role ──< role_permissions >── permission
              │
         school_id        (un utilisateur peut avoir des rôles différents selon l'établissement)
```

Le rôle est un **regroupement de permissions**, pas une valeur testée dans le code. On n'écrit jamais `if (user.role === 'ACCOUNTANT')` ; on écrit `requirePermission('payments.validate_external')`.

*Pourquoi* : le §56 décrit des droits fins qui ne se superposent pas proprement aux rôles (« le comptable peut appliquer *certaines* corrections », « la direction approuve *certaines* opérations sensibles »). Un directeur d'établissement voudra tôt ou tard un caissier autorisé à imprimer les états, ou un secrétaire habilité aux remises. Avec des permissions, c'est une case à cocher ; avec des rôles en dur, c'est un déploiement.

---

## 2. Les rôles natifs (§55)

| Code | Nom | Portée | Description |
|---|---|---|---|
| `SUPER_ADMIN` | Super administrateur CSB Noutcha KAMGUE | Plateforme | Éditeur de la plateforme. Multi-établissement. |
| `SCHOOL_ADMIN` | Administrateur établissement | École | Tous les droits sur son école, sauf plateforme. |
| `DIRECTOR` | Direction | École | Consultation globale + approbations sensibles. |
| `ACCOUNTANT` | Comptable | École | Configuration des frais, validation, contrepassation, exports. |
| `CASHIER` | Caissier | École | Encaissement au guichet, impression de reçus. |
| `REGISTRAR` | Scolarité / Secrétariat | École | Élèves, inscriptions, responsables, classes, imports. |
| `TEACHER` | Enseignant | École | **Aucune permission en V1** (réservé au module pédagogique V2). |
| `PARENT` | Parent / Responsable | Hors école | Accès à ses enfants associés en `ACCEPTED` uniquement. |

`roles.is_system = true` pour ces huit rôles : non supprimables, non renommables. Un établissement peut créer des rôles supplémentaires (`is_system = false`) en combinant des permissions existantes.

---

## 3. Catalogue des permissions

Nommage : `<domaine>.<action>`. Les permissions sont créées par une migration de seed et **ne se créent pas dynamiquement**.

### Référentiel scolaire
```
academic_years.read | create | update | close | archive
grade_levels.read   | create | update | deactivate
classes.read        | create | update | deactivate
```

### Élèves & inscriptions
```
students.read | create | update | change_status | archive
students.export | students.print
enrollments.read | create | update | transfer_class | cancel
enrollments.bulk_reenroll
imports.students.run
```

### Responsables & associations
```
guardians.read | create | update
guardian_links.read | create | revoke
guardian_invites.create | revoke | print
guardian_requests.read | approve | reject
```

### Structure financière
```
fee_types.read | create | update | deactivate
fee_structures.read | create | update | activate | duplicate_year
fee_installments.manage
student_fees.read | assign | recalculate | waive
discounts.read | create | approve | cancel
```

### Paiements
```
payments.read                    ← lecture globale (établissement)
payments.read_own                ← lecture limitée à ses enfants (parent)
payments.create_cash             ← encaissement guichet
payments.create_online           ← initiation Mobile Money (parent)
payments.declare_external        ← déclaration de paiement externe (parent)
payments.validate_external       ← valider / rejeter une déclaration
payments.allocate_manual         ← affectation dirigée par un comptable
payments.reverse                 ← contrepassation
payments.approve_reversal        ← approbation au-delà du seuil (direction)
payments.export
```

### Caisse
```
cash_sessions.open | close | read | reconcile
```

### Reçus
```
receipts.read | read_own | print | reissue | email
```

### Reporting
```
reports.financial.read           ← C01, C07
reports.director.read            ← D01
reports.export
search.global
```

### Administration & sécurité
```
users.read | create | update | deactivate | assign_roles
roles.read | create | update
audit.read
settings.read | update
schools.read | create | update        ← SUPER_ADMIN
```

---

## 4. Matrice rôles × permissions

`✔` accordée · `—` refusée · `◐` accordée sous condition (détaillée en note)

| Permission (groupe) | SUPER_ADMIN | SCHOOL_ADMIN | DIRECTOR | ACCOUNTANT | CASHIER | REGISTRAR | PARENT |
|---|:--:|:--:|:--:|:--:|:--:|:--:|:--:|
| **Référentiel scolaire** — lecture | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | — |
| Référentiel — écriture | ✔ | ✔ | — | — | — | ✔ | — |
| Clôture/archivage d'année | ✔ | ✔ | ✔ | — | — | — | — |
| **Élèves** — lecture | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ◐¹ |
| Élèves — création / modification | ✔ | ✔ | — | — | — | ✔ | — |
| Élèves — changement de statut / archivage | ✔ | ✔ | ✔ | — | — | ◐² | — |
| Inscriptions — création / transfert de classe | ✔ | ✔ | — | — | — | ✔ | — |
| Réinscription en masse | ✔ | ✔ | — | — | — | ✔ | — |
| Import Excel | ✔ | ✔ | — | — | — | ✔ | — |
| **Responsables** — lecture / écriture | ✔ | ✔ | ✔(L) | ✔(L) | ✔(L) | ✔ | ◐³ |
| Invitations & QR | ✔ | ✔ | — | — | — | ✔ | — |
| Révocation d'accès parent | ✔ | ✔ | ✔ | — | — | ✔ | — |
| Traitement des demandes / litiges | ✔ | ✔ | — | — | — | ✔ | — |
| **Frais** — lecture | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ◐¹ |
| Frais / structures — écriture | ✔ | ✔ | — | ✔ | — | — | — |
| Duplication année suivante | ✔ | ✔ | — | ✔ | — | — | — |
| Affectation des frais à un élève | ✔ | ✔ | — | ✔ | — | ◐⁴ | — |
| Remise — création | ✔ | ✔ | ✔ | ✔ | — | — | — |
| Remise — approbation | ✔ | ✔ | ✔ | ◐⁵ | — | — | — |
| **Paiements** — lecture globale | ✔ | ✔ | ✔ | ✔ | ✔ | ✔(L) | — |
| Paiements — lecture de ses enfants | — | — | — | — | — | — | ✔ |
| Encaissement guichet | ✔ | ✔ | — | ✔ | ✔ | — | — |
| Initiation Mobile Money | — | — | — | — | — | — | ✔ |
| Déclaration de paiement externe | — | — | — | — | — | — | ✔ |
| Validation d'un paiement externe | ✔ | ✔ | — | ✔ | — | — | — |
| Affectation manuelle | ✔ | ✔ | — | ✔ | — | — | — |
| Contrepassation | ✔ | ✔ | — | ✔ | — | — | — |
| Approbation de contrepassation (> seuil) | ✔ | ✔ | ✔ | — | — | — | — |
| **Caisse** — ouvrir / fermer sa session | ✔ | ✔ | — | ✔ | ✔ | — | — |
| Caisse — rapprochement | ✔ | ✔ | ✔ | ✔ | — | — | — |
| **Reçus** — impression / réémission | ✔ | ✔ | ✔ | ✔ | ✔ | — | ◐¹ |
| **Rapports financiers** (C01, C07) | ✔ | ✔ | ✔ | ✔ | — | — | — |
| Dashboard Direction (D01) | ✔ | ✔ | ✔ | ✔ | — | — | — |
| Exports | ✔ | ✔ | ✔ | ✔ | — | ✔(élèves) | — |
| Recherche globale | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | — |
| **Utilisateurs** — gestion, rôles | ✔ | ✔ | — | — | — | — | — |
| Journal d'audit | ✔ | ✔ | ✔ | ◐⁶ | — | — | — |
| Paramètres de l'établissement | ✔ | ✔ | — | ◐⁷ | — | — | — |
| Gestion des établissements | ✔ | — | — | — | — | — | — |

*(L) = lecture seule*

**Notes conditionnelles**
1. **Parent** : uniquement les élèves liés par un `student_guardians` en statut `ACCEPTED`, et uniquement si `can_view_finances = true` pour les données financières.
2. **Registrar** : peut désactiver un élève sans historique financier ; l'archivage d'un élève avec paiements exige `SCHOOL_ADMIN` ou `DIRECTOR` (§75).
3. **Parent** : peut modifier ses propres coordonnées (changement de numéro §72, avec OTP), pas celles des autres responsables (§71).
4. **Registrar** : peut déclencher l'affectation automatique des frais lors d'une inscription, mais ne peut ni choisir les montants ni ajouter un frais hors barème.
5. **Comptable** : peut approuver une remise en dessous du seuil défini dans `school_settings` ; au-delà, l'approbation revient à la direction.
6. **Comptable** : accès au journal d'audit **financier** uniquement (actions du domaine `payments`, `discounts`, `fee_*`).
7. **Comptable** : accès aux paramètres financiers seulement (formats de numérotation, stratégie d'affectation, délais de relance).

---

## 5. Contrôle d'accès du parent — la garde la plus critique

Le §71 (confidentialité entre responsables) et le §9 (statut des associations) imposent une garde qui ne peut pas être laissée à l'appréciation de chaque endpoint.

### Middleware `parentScope`

Appliqué à **toutes** les routes `/parent/*` :

```ts
// 1. Extraire student_id (paramètre, corps ou via payment_id / enrollment_id)
// 2. Résoudre le guardian correspondant au user connecté
// 3. Vérifier :
//      student_guardians.status === 'ACCEPTED'
//      guardians.status === 'ACTIVE'
//      user.status === 'ACTIVE'
// 4. Selon la nature de la route :
//      lecture financière  → can_view_finances === true
//      initiation paiement → can_pay === true
// 5. Injecter la liste des student_id autorisés dans le contexte de requête
// 6. Tout repository appelé dans ce contexte filtre sur cette liste
```

**Interdiction absolue** : qu'une route parent accepte un `student_id` et interroge la base sans passer par cette liste. Un test d'intégration parcourt automatiquement toutes les routes `/parent/*` avec le compte d'un parent non associé et exige un `403` ou un `404` sur chacune.

### Cloisonnement entre responsables (§71)

Ce que le parent voit d'un paiement effectué par un autre responsable :

| Champ | Visible |
|---|---|
| Montant, date, moyen de paiement | ✔ |
| Statut, référence, reçu | ✔ |
| Impact sur le solde | ✔ |
| **Nom du payeur** | Uniquement s'il s'agit de lui-même ; sinon libellé neutre « Paiement enregistré » ou « Payé au guichet » |
| **Téléphone du payeur** | ✖ jamais |
| **Coordonnées des autres responsables** | ✖ jamais (seuls le prénom et le lien de parenté sont affichés) |

Implémenté par un **sérialiseur dédié** au contexte parent, pas par un filtrage dans le composant React : le champ ne doit jamais quitter le serveur.

---

## 6. Contrôle d'accès côté serveur

```ts
// Déclaratif, au niveau de la route
fastify.post('/payments/:id/validate', {
  preHandler: [authenticate, requirePermission('payments.validate_external')],
  schema: { ... }
}, handler);
```

- Les permissions sont embarquées dans l'access token (durée 15 min), donc pas de requête base à chaque appel.
- Un changement de rôle **révoque les sessions actives** de l'utilisateur (§56 : « changement de permissions » est une action auditée et sensible).
- Un test d'architecture échoue si une route mutative (`POST`/`PATCH`/`PUT`/`DELETE`) est déclarée sans `requirePermission` ni marquage explicite `public: true`.

---

## 7. Contrôle d'accès côté client

Le client **n'est pas une barrière de sécurité**, il ne fait qu'éviter d'afficher l'inutile.

```tsx
<Can permission="payments.reverse">
  <Button>Contrepasser</Button>
</Can>
```

Le menu latéral se construit à partir des permissions du token : un caissier ne voit ni le menu Frais, ni le menu Direction. Toute route web est doublée d'une garde côté serveur ; masquer un bouton ne protège rien.

---

## 8. Actions systématiquement auditées (§57)

| Domaine | Actions |
|---|---|
| Élèves | `student.create`, `student.update`, `student.change_status`, `student.archive` |
| Scolarité | `enrollment.create`, `enrollment.transfer_class`, `enrollment.cancel` |
| Responsables | `guardian.update`, `guardian_link.create`, `guardian_link.accept`, `guardian_link.reject`, `guardian_link.revoke`, `invite.create`, `invite.revoke` |
| Frais | `fee_structure.create`, `fee_structure.update`, `student_fee.assign`, `student_fee.recalculate`, `student_fee.waive` |
| Remises | `discount.create`, `discount.approve`, `discount.cancel` |
| Paiements | `payment.create`, `payment.validate`, `payment.reject`, `payment.reverse`, `payment.allocate_manual`, `payment.reallocate` |
| Reçus | `receipt.issue`, `receipt.reissue`, `receipt.cancel` |
| Caisse | `cash_session.open`, `cash_session.close`, `cash_session.reconcile` |
| Sécurité | `user.create`, `user.deactivate`, `user.assign_roles`, `role.update`, `settings.update`, `login.failed` (au-delà du seuil) |

Le journal d'audit est **append-only**. Voir [phases/PHASE-16-audit-securite.md](phases/PHASE-16-audit-securite.md).
