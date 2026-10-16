# PHASE 08 — Caisse & encaissement physique

**Durée estimée** : 1,5 semaine · **Pré-requis** : P07 · **Réf. cahier** : §47, §56, §67, §76

---

## 1. Objectif

Livrer le **premier canal de paiement réel** et, par là même, valider le noyau de la Phase 07 en conditions d'usage.

Le choix de commencer par la caisse est délibéré : c'est le canal le plus simple (aucune dépendance externe, aucun webhook, aucun asynchrone) et le plus utilisé en pratique dans un établissement camerounais. À la fin de cette phase, **CSB Noutcha KAMGUE encaisse réellement de l'argent et émet de vrais reçus** — même sans l'application parent, même sans Mobile Money.

C'est le premier jalon où le produit a une valeur autonome.

---

## 2. Périmètre

### Inclus
- Écran C06 — recherche d'élève et encaissement
- Impression immédiate du reçu
- `cash_sessions` et `cash_session_movements` : ouverture, fermeture, arrêté de caisse
- Journal de caisse du jour
- Mode d'affectation dirigée (le caissier choisit le frais)
- Écran d'accueil du caissier
- Recherche d'élève optimisée pour le guichet

### Exclu
- Mobile Money (Phase 11)
- Paiements externes déclarés par le parent (Phase 12) — mais l'enregistrement d'un virement **par le caissier** est inclus ici
- Tableaux de bord comptables (Phase 14)

---

## 3. Parcours (§67, §47)

```text
1. Le parent arrive à la caisse
2. Le caissier recherche l'élève (nom, matricule, téléphone parent)
3. CSB Noutcha KAMGUE affiche la situation : total dû, payé, reste
4. Le caissier saisit le montant
5. Il sélectionne le mode (espèces, banque, chèque, autre)
6. Il confirme
7. payment = SUCCESS  (via markSuccess de la Phase 07)
8. Allocations créées
9. Solde recalculé
10. Reçu généré
11. Reçu imprimé
12. Le parent connecté reçoit une notification   ← Phase 13
```

**L'exigence dominante de cet écran est la vitesse.** À la rentrée, une file de parents attend. L'ensemble du parcours doit tenir en moins de 30 secondes, entièrement au clavier, sans souris.

---

## 4. Écran C06 — Nouvel encaissement

### Étape 1 — Recherche

```text
┌──────────────────────────────────────────────────────────┐
│  Nouvel encaissement            Caisse ouverte · 09:12   │
├──────────────────────────────────────────────────────────┤
│  🔍  Nom, matricule ou téléphone du parent               │
│      [ fotso                                    ]        │
│                                                          │
│   Nathan Fotso    CPLAN-00342   6e A    Reste : 75 000  │
│   Sarah Fotso     CPLAN-00343   3e B    Soldé ✓         │
└──────────────────────────────────────────────────────────┘
```

Recherche instantanée dès 2 caractères, debounce 250 ms, navigation aux flèches, sélection par `Entrée`. Le reste à payer est affiché **dans les résultats** : le caissier voit immédiatement qui doit quoi. Un scanner de code-barres qui saisit un matricule fonctionne sans configuration (c'est une simple frappe clavier suivie d'`Entrée`).

### Étape 2 — Situation et saisie

```text
┌────────────────────────────────────────────────────────────┐
│  Nathan Fotso · CPLAN-00342 · 6e A · 2026/2027             │
├────────────────────────────────────────────────────────────┤
│  Total dû   200 000     Payé   125 000     Reste  75 000   │
│                                                            │
│  MONTANT                                                   │
│   [                75 000 ] FCFA                           │
│   Suggestions :  [25 000] [50 000] [75 000 · tout solder]  │
│                                                            │
│  MOYEN                                                     │
│   ● Espèces   ○ Banque   ○ Chèque   ○ Autre                │
│   Référence [                    ]  (si banque / chèque)   │
│                                                            │
│  AFFECTATION                                               │
│   ● Automatique (par ordre de priorité et d'échéance)      │
│   ○ Choisir les frais                                      │
│                                                            │
│   Aperçu :                                                 │
│     Pension — 2e tranche         35 000                    │
│     Pension — 3e tranche         40 000                    │
│                                                            │
│  Payé par  [Jean Fotso            ]  [+237 699…      ]     │
│  Note      [                                        ]      │
│                                                            │
│           [Annuler]            [ Encaisser 75 000 ]        │
└────────────────────────────────────────────────────────────┘
```

**L'aperçu d'affectation en direct** est essentiel : le caissier doit pouvoir dire au parent « vos 75 000 soldent la 2e tranche et la 3e » avant de valider. Il est recalculé à chaque changement de montant, par un appel de simulation qui n'écrit rien.

En mode affectation dirigée, la liste des frais ouverts s'affiche avec un champ montant par ligne et un total contrôlé.

### Étape 3 — Confirmation et impression

```text
┌────────────────────────────────────────────┐
│              ✓  Encaissement validé        │
│                                            │
│              75 000 FCFA                   │
│              Nathan Fotso · 6e A           │
│                                            │
│   Reçu   CPL-RCT-2026-000185               │
│   Nouveau solde   0 FCFA · Soldé ✓         │
│                                            │
│   [ Imprimer le reçu ]  [ Nouvel encaissement ]│
└────────────────────────────────────────────┘
```

L'impression se déclenche **automatiquement** (paramétrable) et reste relançable. Support de l'impression A5 et des imprimantes thermiques 80 mm — format de reçu compact prévu dès maintenant.

Raccourcis : `F2` nouvel encaissement, `F3` recherche, `Entrée` valider, `Échap` annuler, `Ctrl+P` réimprimer.

---

## 5. Session de caisse

### Pourquoi

Le cahier n'en parle pas, mais un encaissement d'espèces sans arrêté de caisse est incontrôlable. À la fin de la journée, personne ne peut dire si l'argent du tiroir correspond aux enregistrements. C'est le premier point que soulèvera un audit, et la première source de conflit interne.

### Cycle

```text
Ouverture (matin)
   Fond de caisse déclaré : 10 000 FCFA
   status = OPEN, cashier_user_id = utilisateur courant
        │
   Encaissements de la journée → payments.cash_session_id
        │
Fermeture (soir)
   Calculé par CSB Noutcha KAMGUE     Espèces  1 245 000
                         Chèques    350 000
                         Banque     220 000
   Déclaré par le caissier (espèces comptées) : 1 243 000
   ─────────────────────────────────────────
   Écart : − 2 000 FCFA   ⚠  motif obligatoire
   status = CLOSED
        │
Rapprochement (comptable)
   Vérification, validation → status = RECONCILED
```

Règles :
- Un caissier ne peut avoir qu'une session ouverte à la fois.
- Aucun encaissement possible sans session ouverte.
- Une session fermée ne peut plus recevoir d'encaissement.
- Un écart, quel qu'il soit, exige un motif.
- La fermeture est auditée ; le rapprochement aussi.
- La session est cloisonnée par utilisateur : un caissier ne voit que la sienne ; le comptable les voit toutes.

### Écran d'arrêté de caisse

Récapitulatif par moyen de paiement, liste des transactions de la session, champ de comptage des espèces avec calculatrice de billets (10 000 × n, 5 000 × n, …), écart calculé en direct, motif si non nul, bouton `Clôturer la caisse` puis impression du bordereau.

---

## 6. API

```
POST   /api/v1/cash-sessions/open           { opening_float }
GET    /api/v1/cash-sessions/current
POST   /api/v1/cash-sessions/:id/close      { declared_amounts, variance_reason? }
POST   /api/v1/cash-sessions/:id/reconcile
GET    /api/v1/cash-sessions?cashier_id=&from=&to=&status=
GET    /api/v1/cash-sessions/:id/report     # bordereau PDF

POST   /api/v1/payments/cash                # header Idempotency-Key obligatoire
GET    /api/v1/payments/simulate-allocation # aperçu, aucune écriture
GET    /api/v1/students/quick-search?q=     # recherche optimisée guichet
```

### `POST /payments/cash`

```jsonc
{
  "student_id": "…", "enrollment_id": "…",
  "amount": 75000,
  "payment_method": "CASH",             // CASH | BANK_TRANSFER | BANK_DEPOSIT | CHEQUE | OTHER
  "external_reference": "CHQ-882910",   // si chèque ou virement
  "paid_at": "2026-08-19T10:15:00Z",    // date d'effet, modifiable (dépôt bancaire de la veille)
  "payer_name": "Jean Fotso",
  "payer_phone": "+237699123456",
  "allocations": null,                  // null = automatique
  "note": "…"
}
```

Le service crée le paiement en `PENDING` puis appelle immédiatement `markSuccess` — **le même chemin que tous les autres canaux**. Aucune logique de solde n'est réécrite ici. C'est précisément ce que cette phase valide.

---

## 7. Accueil du caissier

```text
┌──────────────────────────────────────────────────────┐
│  Caisse                          ● Ouverte · 09:12   │
├──────────────────────────────────────────────────────┤
│  Encaissé aujourd'hui        Transactions            │
│  1 815 000 FCFA              27                      │
│                                                      │
│  Espèces  1 245 000 · Chèques 350 000 · Banque 220 000│
│                                                      │
│         [  +  NOUVEL ENCAISSEMENT  ]  (F2)           │
│                                                      │
│  Derniers encaissements                              │
│  10:42  Nathan Fotso   6e A   75 000  Espèces  [🖨]  │
│  10:38  Marc Belinga   4e A   50 000  Chèque   [🖨]  │
│                                                      │
│  [Journal de la caisse]      [Clôturer la caisse]    │
└──────────────────────────────────────────────────────┘
```

Interface volontairement dépouillée : un caissier a une seule tâche. Boutons larges, contrastes forts, lisibilité à distance.

---

## 8. Règles métier

1. Aucun encaissement sans session de caisse ouverte.
2. Le caissier ne peut ni contrepasser, ni valider un paiement externe déclaré, ni modifier une dette (permissions du doc 05).
3. Une erreur d'encaissement se corrige par contrepassation, faite par un comptable — jamais par le caissier lui-même.
4. `paid_at` peut être antérieur (dépôt bancaire de la veille), jamais postérieur à maintenant.
5. Le montant est plafonné au reste dû, sauf si le surpaiement est autorisé — avec confirmation explicite.
6. Un encaissement sur un élève dont la scolarité est soldée exige une confirmation (paiement d'avance).
7. Le reçu est imprimé sur place ; le parent repart avec.
8. Idempotence obligatoire : un double clic ne crée jamais deux encaissements.

---

## 9. Critères d'acceptation

- [ ] Le parcours complet (recherche → encaissement → impression) tient en moins de 30 secondes
- [ ] Le parcours est réalisable **entièrement au clavier**
- [ ] La recherche trouve un élève par nom, matricule ou téléphone parent en moins de 300 ms
- [ ] L'aperçu d'affectation est exact et se met à jour à chaque changement de montant
- [ ] L'affectation dirigée fonctionne et contrôle la somme
- [ ] Le reçu s'imprime automatiquement et est réimprimable
- [ ] Le format thermique 80 mm est lisible et complet
- [ ] Aucun encaissement n'est possible sans session ouverte
- [ ] L'arrêté de caisse calcule un écart exact, motif exigé s'il est non nul
- [ ] Un double clic sur `Encaisser` ne crée qu'un seul paiement (idempotence)
- [ ] Deux caissiers encaissant simultanément pour le même élève produisent un solde exact
- [ ] Le caissier ne peut accéder ni à la contrepassation ni à la configuration des frais (403)
- [ ] Le bordereau de caisse s'imprime
- [ ] Toutes les opérations sont auditées avec l'identité du caissier
- [ ] Le job de réconciliation ne détecte aucun écart après une journée de 100 encaissements simulés

---

## 10. Risques

| Risque | Impact | Parade |
|---|---|---|
| Écran trop lent en file d'attente | Rejet par les utilisateurs, retour au papier | Objectif chiffré de 30 s, tout au clavier, tests avec un vrai caissier |
| Imprimante non configurée le jour J | Pas de reçu, blocage total | Tester tôt les modèles réels ; repli sur PDF + impression navigateur ; le reçu existe en base même sans impression |
| Écart de caisse récurrent | Suspicion, conflit interne | Arrêté quotidien obligatoire, motif tracé, rapprochement comptable |
| Caissier qui corrige lui-même une erreur | Perte de contrôle | Aucune permission de contrepassation ; procédure documentée |
| Coupure d'électricité ou de réseau en pleine file | Encaissements impossibles | Documenter la procédure de repli papier et la saisie a posteriori (avec `paid_at` rétroactif). **Pas de mode hors ligne** : encaisser sans vérifier le solde réel créerait des incohérences pires que l'interruption. |
| Espèces encaissées et non enregistrées | Détournement | Session de caisse + arrêté + audit ; ce n'est pas un problème logiciel, mais l'outil doit le rendre détectable |
