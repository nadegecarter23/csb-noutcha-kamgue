# PHASE 10 — App Parent : consultation & situation financière

**Durée estimée** : 2 semaines · **Pré-requis** : P07, P09 · **Réf. cahier** : §13, §14, §15, §27, §28, §71, §80

---

## 1. Objectif

Répondre, dans l'application, à **la question du parent** (§2) :

> Combien dois-je encore payer pour chacun de mes enfants, qu'ai-je déjà payé et quelles sont mes prochaines échéances ?

Aucun paiement n'est encore possible depuis l'app — c'est la Phase 11. Mais dès la fin de cette phase, un parent voit sa situation exacte, en temps réel, et peut télécharger ses reçus. Combinée à la Phase 08 (caisse), cette phase suffit déjà à changer le quotidien d'une famille : plus besoin de se déplacer pour savoir ce qu'on doit.

---

## 2. Périmètre

### Inclus
- Écran P06 — accueil avec la situation de chaque enfant
- Écran P07 — dossier de l'enfant, avec onglets
- Écran P08 — situation financière détaillée, tranches, échéances
- Écran P15 — historique des paiements, filtres
- Consultation, téléchargement et partage des reçus
- Historique multi-années (§80)
- Consultation hors ligne des données déjà chargées
- Centre de notifications (liste in-app ; l'envoi arrive en Phase 13)

### Exclu
- Bouton `Payer maintenant` (Phase 11) — présent mais désactivé, avec le message « Bientôt disponible »
- Déclaration de paiement externe (Phase 12)
- Documents autres que les reçus (V2)

---

## 3. Écrans

### P06 — Accueil (§13)

```text
  Bonjour Jean                        🔔 3

  MES ENFANTS

┌──────────────────────────────────────┐
│  NF   Nathan Fotso                   │
│       6e A · CSB Noutcha KAMGUE           │
│                                      │
│       ████████████░░░░░░░  62 %      │
│                                      │
│       Payé      125 000 FCFA         │
│       Reste      75 000 FCFA         │
│                                      │
│       ⏰ 2e tranche · 15 janvier     │
│                                      │
│       [ Voir la situation ]          │
└──────────────────────────────────────┘

┌──────────────────────────────────────┐
│  SF   Sarah Fotso                    │
│       3e B · CSB Noutcha KAMGUE           │
│                                      │
│       ✓ Scolarité réglée             │
│                                      │
│       [ Voir la situation ]          │
└──────────────────────────────────────┘

  ACTIONS REQUISES
  ⚠  1 association en attente de votre confirmation

  PAIEMENTS RÉCENTS
  18 août   50 000 FCFA   Nathan   Orange Money  ✓
  02 août   25 000 FCFA   Sarah    Espèces       ✓

  [ + Ajouter un enfant ]
```

La progression et le reste à payer sont visibles **sans aucun clic**. C'est l'écran le plus consulté de l'application : il doit répondre à la question du parent instantanément.

Un enfant soldé affiche un état positif net (« Scolarité réglée ✓ »), pas une barre à 100 % — la différence de traitement visuel compte.

La section « Actions requises » ne s'affiche que si elle contient quelque chose : associations en attente, paiement rejeté à corriger (Phase 12), échéance dépassée.

### P07 — Dossier de l'enfant (§14)

```text
┌──────────────────────────────────────┐
│  ←        Nathan Fotso               │
│                                      │
│         [photo ou initiales]         │
│                                      │
│         CPLAN-00342                  │
│         6e A · 2026/2027             │
│         CSB Noutcha KAMGUE                │
│         ● Inscrit                    │
├──────────────────────────────────────┤
│ Aperçu │ Scolarité │ Paiements │ …   │
└──────────────────────────────────────┘
```

Onglets du §14 :

| Onglet | Contenu |
|---|---|
| **Aperçu** | Résumé financier, prochaine échéance, 3 derniers paiements, informations de l'élève |
| **Scolarité** | Écran P08, la situation financière complète |
| **Paiements** | Historique filtré sur cet enfant |
| **Documents** | Reçus téléchargeables |
| **Historique** | Frise des années scolaires (§80) |

Les onglets Notes, Absences, Bulletins, Emploi du temps (V2) ne sont **pas affichés** — pas même grisés. Montrer des fonctionnalités absentes crée de la frustration et des questions au support.

### P08 — Situation financière (§15)

```text
  Année scolaire  [2026/2027 ▾]

┌──────────────────────────────────────┐
│  Montant total          200 000 FCFA │
│  Remises              −  20 000 FCFA │
│  ──────────────────────────────────  │
│  TOTAL DÛ               180 000 FCFA │
│  Payé                   125 000 FCFA │
│  RESTE À PAYER           55 000 FCFA │
│                                      │
│  ███████████████░░░░░░░░   69 %      │
└──────────────────────────────────────┘

  DÉTAIL

  ✓  Inscription
     25 000 / 25 000                Payé

  ◐  Pension scolaire
     100 000 / 155 000

     ✓  1ère tranche   30 sept
        66 429 / 66 429             Payé
     ◐  2e tranche     15 janv
        33 571 / 53 143     Partiellement payée
     ○  3e tranche     31 mars
        0 / 35 428                  À venir

  ○  Cotisation APE
     0 / 10 000                  Non payé
     ⚠ Échéance dépassée depuis 12 jours

  [  Payer maintenant  ]        ← désactivé, Phase 11
  [  Voir tous les paiements  ]
```

Reproduit exactement la structure du §15, enrichie du détail des tranches. Code visuel : `✓` payé (vert), `◐` partiel (orange), `○` à venir (gris), `⚠` en retard (rouge).

Le sélecteur d'année permet de consulter les années passées (§80). Une année clôturée l'indique et masque le bouton de paiement.

### P15 — Historique des paiements (§27)

```text
  Paiements

  [Tous les enfants ▾] [2026/2027 ▾] [Tous statuts ▾]

  AOÛT 2026
  ┌────────────────────────────────────┐
  │ 18   50 000 FCFA          Validé ✓ │
  │ août Orange Money · Nathan         │
  │      Pension — 2e tranche      [🧾]│
  └────────────────────────────────────┘
  ┌────────────────────────────────────┐
  │ 02   25 000 FCFA          Validé ✓ │
  │ août Espèces · Sarah               │
  │      Inscription               [🧾]│
  └────────────────────────────────────┘

  JUILLET 2026
  ┌────────────────────────────────────┐
  │ 14   50 000 FCFA          Validé ✓ │
  │ juil Virement · Nathan             │
  └────────────────────────────────────┘
```

Filtres du §27 : enfant, année scolaire, type de paiement, statut. Groupement par mois, défilement infini. Chaque ligne donne accès au reçu.

**Cloisonnement (§71)** : un paiement effectué par un autre responsable apparaît avec son montant, sa date et son moyen, mais **sans le nom ni le numéro du payeur** — libellé neutre « Paiement enregistré ». Ce filtrage est fait par le serveur (Phase 04), l'app ne fait que l'afficher.

### Détail d'un paiement et reçu

Vue du reçu conforme au §28, avec actions : télécharger le PDF, partager (feuille de partage du système : WhatsApp, e-mail, impression), envoyer par e-mail.

Un paiement contrepassé s'affiche clairement comme tel, avec le motif et un lien vers l'opération de correction.

### Historique multi-années (§80)

```text
  Nathan Fotso — Historique

  2026/2027 · 6e A                     ● En cours
     180 000 dû · 125 000 payé · 55 000 restant

  2025/2026 · CM2 B                    ✓ Soldé
     150 000 dû · 150 000 payé

  2024/2025 · CM1 A                    ✓ Soldé
     140 000 dû · 140 000 payé
```

Chaque année est dépliable pour retrouver ses frais, paiements et reçus. C'est la matérialisation de la 8e dimension du §87 : rien ne disparaît.

### Centre de notifications

Liste chronologique, non lues mises en avant, marquage comme lu, appui menant à l'écran concerné. Alimenté en Phase 13 ; à ce stade, il affiche les notifications générées par les événements des Phases 07 et 08.

---

## 4. Points techniques

### Fraîcheur et hors ligne

Les données financières sont **cachées localement** et affichées immédiatement au lancement, avec une indication de fraîcheur :

```text
   Mis à jour il y a 3 min          ⟳
```

Puis rafraîchissement en arrière-plan. Hors ligne, le cache reste affiché avec un bandeau : « Hors ligne — données du 18 août à 14h32 ». Un parent doit pouvoir consulter sa situation dans une zone sans réseau.

`staleTime` de 30 s, `refetchOnMount`, tirer pour rafraîchir sur chaque écran.

### Formatage

Un seul helper partagé pour les montants : `125 000 FCFA`, espace insécable comme séparateur de milliers, jamais de décimale. Dates en français, format long (« 18 août 2026 »). Les valeurs relatives (« il y a 3 min ») ne servent que pour la fraîcheur, jamais pour une date de paiement — un parent veut la date exacte.

### Performance

L'accueil affiche ses données en moins de 1 s à partir du cache. Un seul appel API agrégé (`GET /parent/dashboard`) plutôt qu'un appel par enfant : sur un réseau lent, la différence est décisive.

---

## 5. API consommée

```
GET /api/v1/parent/dashboard                    # tout l'accueil en un appel
GET /api/v1/parent/children/:id
GET /api/v1/parent/children/:id/enrollments     # historique multi-années
GET /api/v1/parent/enrollments/:id/statement    # P08 : frais, tranches, paiements, solde
GET /api/v1/parent/payments?student_id=&academic_year_id=&status=&page=
GET /api/v1/parent/payments/:id
GET /api/v1/parent/receipts/:id/pdf             # URL pré-signée, 5 min
GET /api/v1/parent/notifications
POST /api/v1/parent/notifications/:id/read
```

Toutes ces routes passent par la garde `parentScope` et le sérialiseur cloisonné (Phase 04).

---

## 6. Critères d'acceptation

- [ ] L'accueil affiche la situation de chaque enfant sans aucun clic
- [ ] Les montants correspondent **exactement** à ceux du dashboard comptable pour le même élève
- [ ] Un enfant soldé affiche « Scolarité réglée ✓ », pas une barre de progression
- [ ] P08 reproduit la structure du §15, tranches comprises
- [ ] Le pourcentage de progression correspond à la formule du doc 04 §5.3
- [ ] Une échéance dépassée est signalée visuellement et textuellement
- [ ] L'historique filtre correctement par enfant, année, statut
- [ ] Un paiement effectué par un autre responsable n'expose ni son nom ni son numéro (vérifié sur le JSON brut de la réponse)
- [ ] Le reçu se télécharge et se partage (WhatsApp testé)
- [ ] L'historique multi-années affiche 3 années de données
- [ ] En mode avion, les données en cache s'affichent avec la date de fraîcheur
- [ ] L'accueil se peint en moins de 1 s depuis le cache
- [ ] Un paiement encaissé à la caisse apparaît dans l'app en moins de 30 s après rafraîchissement
- [ ] Une contrepassation est affichée clairement, avec son motif
- [ ] Aucune fonctionnalité V2 n'est visible dans l'interface

---

## 7. Risques

| Risque | Impact | Parade |
|---|---|---|
| Écart entre le montant affiché au parent et celui du dashboard | **Perte de confiance immédiate, appels au secrétariat** | Une source unique (`v_enrollment_balance`), un seul calcul, test de cohérence entre les deux interfaces |
| Cache périmé montrant un solde faux | Le parent croit avoir payé | Fraîcheur toujours affichée, rafraîchissement à l'ouverture, cache invalidé après tout paiement |
| Incompréhension de la notion de tranche | Appels au support | Libellés explicites, dates visibles, statut en toutes lettres plutôt qu'en icône seule |
| Fuite d'information entre responsables | Conflit familial, atteinte à la vie privée | Sérialiseur serveur (Phase 04), test sur le JSON brut |
| Réseau trop lent pour l'accueil | Abandon | Appel agrégé unique, affichage immédiat depuis le cache, chargement progressif |
| Parent qui ne comprend pas pourquoi il ne peut pas encore payer | Frustration | Message explicite sur le bouton désactivé, avec la date prévue si elle est connue |
