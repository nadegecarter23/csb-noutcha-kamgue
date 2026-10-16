# 01 — Vision & périmètre

## 1. Ce que CSB Noutcha KAMGUE doit être

CSB Noutcha KAMGUE V1 n'est **pas une application Mobile Money**. C'est la **source de vérité financière et administrative** d'un établissement scolaire.

Le test de réussite de la V1 est unique et vient du §88 du cahier. À tout instant, le système doit pouvoir produire cette phrase, sans intervention humaine, sans Excel, sans recoupement manuel :

> *Nathan Fotso, matricule CPLAN-00342, est inscrit en 6e A pour l'année 2026/2027. Sa scolarité nette est de 180 000 FCFA. 125 000 FCFA ont été réglés à travers trois transactions différentes. Son solde est de 55 000 FCFA. Deux responsables disposent d'un accès vérifié à son dossier, et chaque opération effectuée est traçable.*

Tant que cette phrase n'est pas générable automatiquement et exacte, la V1 n'est pas livrée.

---

## 2. Les deux questions à satisfaire

| Acteur | Question | Écrans qui y répondent |
|---|---|---|
| **Parent** | Combien dois-je encore payer pour chacun de mes enfants, qu'ai-je déjà payé, quelles sont mes prochaines échéances ? | P06, P07, P08, P15 |
| **Établissement** | Qui doit combien, qui a payé quoi, quand, comment, pour quel élève, dans quelle classe, pour quelle année ? | C01, C04, C07, D01 |

---

## 3. Les 8 dimensions à ne jamais confondre (§87)

C'est **la contrainte d'architecture la plus importante du projet**. Chaque dimension a ses propres tables, son propre cycle de vie, ses propres statuts. Les mélanger, c'est condamner le produit à une réécriture au moment d'ajouter les modules V2.

| # | Dimension | Question | Entités | Erreur classique à éviter |
|---|---|---|---|---|
| 1 | **IDENTITÉ** | Qui est l'élève ? | `students` | Recréer l'élève chaque année scolaire |
| 2 | **RELATION** | Qui est autorisé à agir pour lui ? | `guardians`, `student_guardians` | Faire du parent le propriétaire de l'élève |
| 3 | **SCOLARITÉ** | Où est-il inscrit cette année ? | `enrollments`, `classes` | Stocker la classe sur l'élève |
| 4 | **OBLIGATION** | Que doit-il payer ? | `fee_structures`, `student_fee_assignments` | Recalculer la dette depuis le tarif courant |
| 5 | **TRANSACTION** | Qu'a-t-il effectivement payé ? | `payments` | Confondre le mouvement d'argent et son imputation |
| 6 | **AFFECTATION** | À quelle dette ce paiement correspond-il ? | `payment_allocations` | Créer un paiement « pour la pension » sans ligne d'affectation |
| 7 | **PREUVE** | Quel reçu le démontre ? | `receipts` | Générer le reçu à la volée à l'affichage |
| 8 | **HISTORIQUE** | Que s'est-il passé au fil des années ? | `audit_logs` + immuabilité | Modifier une transaction validée |

### Corollaires directs

- **L'élève est permanent, l'inscription est annuelle.** Une promotion = une nouvelle ligne `enrollments`, jamais une modification de l'existante.
- **Un paiement ≠ une affectation.** Le parent paie 100 000 FCFA (1 `payment`) ; ces 100 000 se répartissent en 25 000 sur l'inscription et 75 000 sur la pension (2 `payment_allocations`). Cette séparation est **obligatoire**, pas recommandée : sans elle, ni le paiement multi-frais (§51) ni le paiement multi-enfants (§52) ne sont possibles.
- **La dette est figée au moment de l'affectation.** `student_fee_assignments.final_amount` est une photo. Si l'établissement change le tarif de la 6e en cours d'année, les élèves déjà affectés ne bougent pas, sauf action explicite et auditée.
- **Le solde est un calcul, jamais une saisie.** Il se reconstruit intégralement à partir de : affectations de frais − remises − allocations de paiements réussis. Aucun champ « solde » modifiable à la main.

---

## 4. Périmètre V1 (le MVP du §82)

### Inclus

**Administration scolaire** — utilisateurs, rôles, années scolaires, niveaux, classes, élèves, responsables, inscriptions, import Excel, réinscription, QR / codes d'association.

**Application Parent (React Native)** — création de compte, OTP, associations proposées, accepter/refuser, ajouter un enfant, tableau de bord des enfants, situation financière, historique, paiement Mobile Money, déclaration de paiement externe, reçus, notifications.

**Comptabilité** — types de frais, structures tarifaires, tranches, remises, paiements, Mobile Money, paiements externes, validation, encaissement physique, reçus, situation par classe, exports.

**Direction** — tableau de bord financier, statistiques, taux de recouvrement, impayés.

**Sécurité** — permissions granulaires, journal d'audit, historique, révocation d'accès.

### Explicitement exclu de la V1 (§83 — V2)

Préinscriptions en ligne · gestion documentaire · messagerie établissement–parents · avis et annonces · notes · bulletins · absences · retards · devoirs · emplois du temps · examens · transport · cantine · bibliothèque · discipline · suivi pédagogique · signatures numériques.

> Ces modules ne sont pas développés, mais le modèle de données doit pouvoir les accueillir **sans migration destructive**. Concrètement : `enrollments` est le point d'ancrage naturel des notes, absences et bulletins ; `students` celui du dossier permanent.

### Zone grise — décisions prises

| Sujet | Cahier | Décision V1 |
|---|---|---|
| Multi-établissement | §85 : « prévoir `school_id` » | `school_id` présent dans toutes les tables métier + isolation applicative systématique dès la V1. L'UI d'administration multi-écoles (§3.5) est réduite au strict minimum (création d'établissement en base + un écran de bascule). |
| Paiement multi-enfants | §52 : « version ultérieure » | **Modèle prêt dès la V1** (`payment_allocations` porte `student_id`), **UI non livrée en V1**. Aucun surcoût, gain énorme plus tard. |
| Canaux de notification | §63 : PUSH, SMS, EMAIL, WHATSAPP, IN_APP | V1 = IN_APP + PUSH + SMS. EMAIL en option. WHATSAPP hors périmètre (modèle prêt). |
| Rôle TEACHER | §55 | Le rôle existe en base, sans permission ni écran en V1 (il n'a rien à faire tant que le module pédagogique n'existe pas). |
| Surpaiement / avance | Non traité | Autorisé et modélisé : le reliquat non affecté d'un paiement reste disponible en avance, réaffectable. Voir [04-REGLES-METIER-FINANCIERES.md](04-REGLES-METIER-FINANCIERES.md). |
| Remboursement (`REFUNDED`) | §59 | Statut présent en base, workflow de remboursement **non livré en V1** (rare, sensible, traité par contrepassation + opération hors plateforme). |

---

## 5. Les 10 règles métier non négociables (§81)

Elles doivent être vérifiées par des **tests automatisés**, pas par de la discipline humaine.

| # | Règle | Garantie technique |
|---|---|---|
| 1 | Un élève appartient à l'établissement, pas au compte parent | `students.school_id` NOT NULL ; aucune FK vers `users` |
| 2 | Un élève peut avoir plusieurs responsables | `student_guardians` = table de liaison N-N |
| 3 | Un responsable peut avoir plusieurs élèves | idem |
| 4 | Une association doit être vérifiée | `student_guardians.status` ∈ {PENDING, ACCEPTED, …} ; aucun accès en lecture sans `ACCEPTED` |
| 5 | Une classe est liée à une année scolaire | `classes.academic_year_id` NOT NULL |
| 6 | La promotion crée une nouvelle inscription | contrainte `UNIQUE (student_id, academic_year_id)` sur `enrollments` |
| 7 | Un paiement appartient à une transaction identifiable | `payments.reference` UNIQUE NOT NULL |
| 8 | Le solde est reconstructible | test de réconciliation : solde stocké/affiché == recalcul intégral, exécuté en CI et en job nocturne |
| 9 | Une transaction validée n'est pas supprimée | pas de `DELETE` sur `payments` (droit SQL retiré) ; contrepassation obligatoire |
| 10 | Toute action financière sensible est auditée | intercepteur d'audit + test qui échoue si une route sensible n'écrit pas de log |

---

## 6. Volumétrie de référence (dimensionnement V1)

Issue des exemples du cahier (§30, §41, §53) :

| Grandeur | Ordre |
|---|---|
| Établissements | 1 (architecture prête pour N) |
| Élèves actifs | ~1 250 |
| Classes | ~30 |
| Comptes parents | ~1 500 |
| Utilisateurs internes | ~15 |
| Paiements / an | ~5 000 |
| Pic de charge | Rentrée : ~200 paiements/jour, ~50 utilisateurs simultanés |

**Conséquence** : la volumétrie est faible. On privilégie **la justesse et la traçabilité** sur l'optimisation. Pas de dénormalisation prématurée, pas de vues matérialisées en V1 — les agrégats se calculent à la volée avec les bons index. Voir [04-REGLES-METIER-FINANCIERES.md](04-REGLES-METIER-FINANCIERES.md) § « Calcul du solde ».

---

## 7. Contraintes de contexte (Cameroun / Afrique centrale)

Elles ne sont pas explicites dans le cahier mais conditionnent des choix techniques ; à valider avec le client.

| Contrainte | Impact |
|---|---|
| Devise FCFA (XAF), **sans décimale** | Tous les montants sont des entiers. Aucun `float`, aucun arrondi. |
| Connexion mobile instable | App Parent : cache local, mode consultation hors ligne, reprise de paiement idempotente |
| Terminaux Android bas de gamme majoritaires | RN : viser Android 8+, bundle léger, éviter les animations coûteuses |
| Numéros au format `+237 6XX XX XX XX` | Normalisation E.164 **systématique** en base — c'est la clé de la détection automatique des enfants (§8) |
| Habitudes administratives papier (§78) | L'impression n'est pas un « nice to have » : reçu, fiche élève, liste de classe, état des impayés doivent être imprimables proprement |
| Fuseau `Africa/Douala` (UTC+1, sans DST) | Stockage en UTC (`timestamptz`), affichage et **clôtures de journée de caisse** en heure locale |

---

## 8. Ce qui fera échouer le projet (à surveiller)

1. **Confondre paiement et affectation.** Symptôme : une colonne `fee_type_id` sur la table `payments`. Blocage immédiat sur le paiement partiel multi-frais.
2. **Stocker la classe sur l'élève.** Symptôme : `students.class_id`. Perte de tout l'historique dès la première réinscription.
3. **Donner l'accès au dossier sur simple correspondance de numéro.** Symptôme : pas de statut sur l'association. Fuite de données dès qu'un numéro est recyclé (§9).
4. **Un solde stocké et mis à jour « à la main ».** Symptôme : dérive silencieuse impossible à auditer.
5. **Traiter le webhook Mobile Money sans idempotence.** Symptôme : double crédit sur re-livraison du webhook.
6. **Un compte « administrateur » partagé** (§55). Symptôme : journal d'audit inexploitable.
