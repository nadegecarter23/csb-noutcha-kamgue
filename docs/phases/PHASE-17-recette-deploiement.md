# PHASE 17 — Recette, reprise de données & mise en production

**Durée estimée** : 2,5 semaines (démarrage en continu dès la Phase 08) · **Pré-requis** : P16 · **Réf. cahier** : §82, §88

---

## 1. Objectif

Amener CSB Noutcha KAMGUE d'un logiciel qui fonctionne à un logiciel **en service dans un établissement réel**.

C'est la phase la plus sous-estimée d'un projet de ce type. La reprise des données existantes, la formation des utilisateurs et le choix du moment de bascule décident de l'adoption bien plus que la qualité du code. Un outil techniquement irréprochable mis en production trois jours avant la rentrée, sans données reprises et sans formation, sera abandonné en une semaine.

---

## 2. Périmètre

### Inclus
- Recette fonctionnelle complète avec le client
- Reprise des données existantes (élèves, responsables, frais, historique de paiements)
- Tests de bout en bout automatisés sur les parcours critiques
- Tests de charge (scénario rentrée)
- Infrastructure de production, sauvegardes, supervision
- Publication de l'application mobile sur les stores
- Documentation et formation des utilisateurs
- Plan de bascule et de repli
- Accompagnement des premières semaines

---

## 3. Recette fonctionnelle

### Les 12 scénarios de bout en bout

Chacun est joué **par le client**, sur l'environnement de recette, avec des données réalistes, et validé par écrit.

| # | Scénario | Phases couvertes |
|---|---|---|
| 1 | Créer une année, des niveaux, des classes | 02 |
| 2 | Créer un élève avec deux responsables, imprimer sa fiche d'association | 03, 04 |
| 3 | Importer 200 élèves depuis Excel, corriger les erreurs, valider | 05 |
| 4 | Configurer les frais d'un niveau, avec trois tranches | 06 |
| 5 | Un parent crée son compte, valide son OTP, retrouve ses enfants, en accepte deux | 09 |
| 6 | Le parent consulte la situation financière et l'historique | 10 |
| 7 | Encaisser 50 000 FCFA à la caisse, imprimer le reçu, arrêter la caisse | 08 |
| 8 | Le parent paie 25 000 FCFA par Orange Money et télécharge son reçu | 11 |
| 9 | Le parent déclare un virement ; le comptable le valide avec un montant corrigé | 12 |
| 10 | Contrepasser un paiement erroné ; vérifier le solde et l'avoir | 07 |
| 11 | Consulter les dashboards, exporter l'état des impayés d'une classe | 14, 15 |
| 12 | Réinscrire une classe entière pour l'année suivante | 05 |

### Le test du §88

Le scénario de validation final, celui qui décide si la V1 est livrée :

> Prendre un élève au hasard dans la base réelle. Le système doit produire, sans intervention manuelle : son identité, sa classe, son année, sa scolarité nette, le montant réglé, le nombre de transactions, son solde, la liste de ses responsables vérifiés, et l'historique complet de chaque opération.

Si une seule de ces informations manque ou est fausse, la V1 n'est pas prête.

### Tests automatisés

| Type | Outil | Parcours |
|---|---|---|
| E2E web | Playwright | Scénarios 1, 2, 4, 7, 9, 10, 11, 12 |
| E2E mobile | Maestro | Scénarios 5, 6, 8 |
| Charge | k6 | Rentrée : 200 paiements/h, 50 utilisateurs simultanés, 30 min |
| Réconciliation | Vitest | 1 000 élèves, 5 000 paiements générés : solde exact pour chacun |

---

## 4. Reprise des données

**C'est le chantier le plus lourd de la phase.** À démarrer dès la Phase 05, pas ici.

### Démarche

```text
1. INVENTAIRE       Quelles données existent ? Sous quelle forme ?
                    (Excel, cahiers papier, autre logiciel, mémoire du secrétaire)
2. QUALIFICATION    Volume, qualité, doublons, champs manquants
3. PÉRIMÈTRE        Que reprend-on vraiment ?
4. NETTOYAGE        Avec le client — c'est SON travail, pas celui de l'équipe technique
5. REPRISE À BLANC  Sur l'environnement de recette
6. CONTRÔLE         Rapprochement chiffre à chiffre avec le client
7. CORRECTION       Itérations
8. REPRISE FINALE   Le jour de la bascule
9. VALIDATION       Écrite, par le client
```

### Décision de périmètre — recommandation

| Donnée | Reprendre ? |
|---|---|
| Élèves actifs de l'année en cours | **Oui**, indispensable |
| Responsables et téléphones | **Oui**, indispensable — c'est la clé de l'app parent |
| Classes et effectifs | **Oui** |
| Structures tarifaires de l'année | **Oui** |
| Soldes de départ par élève | **Oui**, sous forme d'un paiement d'ouverture unique par élève, daté et libellé « Report de situation au JJ/MM/AAAA » |
| Historique détaillé des paiements de l'année en cours | **À discuter** — utile mais coûteux |
| Historique des années antérieures | **Non** — conserver l'ancien système en lecture seule pour consultation |
| Élèves sortis, diplômés | **Non** en V1 |

> Le point clé est le **solde d'ouverture**. Plutôt que de reconstituer chaque transaction passée, on crée un paiement technique par élève, du montant déjà réglé, avec un moyen `OTHER` et une référence explicite. Le solde devient immédiatement exact, l'historique antérieur reste dans l'ancien système, et la reprise passe de plusieurs semaines à quelques jours. Cette approche doit être **validée explicitement** par le client : les reçus antérieurs ne seront pas dans CSB Noutcha KAMGUE.

### Contrôles obligatoires après reprise

- [ ] Nombre d'élèves repris = nombre attendu, à l'unité près
- [ ] Effectif par classe conforme
- [ ] Somme des montants dus = somme attendue, au franc près
- [ ] Somme des montants payés = somme attendue, au franc près
- [ ] Aucun doublon d'élève ni de responsable
- [ ] Tous les téléphones normalisés en E.164
- [ ] Contrôle par sondage de 20 élèves, fiche par fiche, avec le secrétariat

---

## 5. Infrastructure de production

| Élément | Exigence |
|---|---|
| PostgreSQL | Instance managée, sauvegardes automatiques, **PITR activé** |
| API et workers | Deux services distincts, même image, au moins 2 instances d'API |
| Redis | Managé ou conteneurisé, persistance activée |
| Stockage objet | S3-compatible, versionnement activé, accès privé strict |
| Domaines | `api.cplan.cm`, `app.cplan.cm`, certificats automatiques |
| Sauvegardes | Quotidiennes, rétention 30 jours, chiffrées, **restauration testée** |
| Supervision | Sentry, `/metrics`, tableau de bord d'exploitation, alertes |
| Journalisation | Centralisée, rétention 90 jours |

### Alertes minimales

| Alerte | Seuil | Destinataire |
|---|---|---|
| API indisponible | 2 échecs consécutifs de sondage | Technique |
| Taux d'erreur 5xx | > 1 % sur 5 min | Technique |
| Paiement bloqué en `PROCESSING` | > 30 min | Technique + comptabilité |
| Écart de réconciliation | tout écart | Technique + comptabilité |
| Webhook en échec | > 3 en 10 min | Technique |
| File de jobs saturée | > 100 en attente | Technique |
| Espace disque base | > 80 % | Technique |
| Échec de sauvegarde | tout échec | Technique |

### Déploiement

CI/CD par GitHub Actions : `main` → staging automatique ; production sur étiquette de version, avec approbation manuelle. Migrations exécutées avant le déploiement applicatif, toujours rétrocompatibles. Retour arrière documenté et testé.

---

## 6. Publication mobile

À anticiper : **compter 2 à 4 semaines** entre la soumission et la disponibilité, refus possibles inclus.

- Google Play : compte développeur, fiche, captures, politique de confidentialité, déclaration de collecte de données, piste interne puis fermée puis production.
- Apple App Store : compte développeur, TestFlight, revue plus stricte (justifier la collecte du numéro de téléphone et l'usage de la caméra).
- Mises à jour OTA (Expo) pour les correctifs sans passer par la revue — **précieux en cas de bug de paiement**.
- Version minimale imposée : l'API peut refuser une version d'app obsolète, avec un message de mise à jour.

---

## 7. Formation et documentation

| Public | Format | Durée | Contenu |
|---|---|---|---|
| Scolarité | Atelier pratique | 3 h | Élèves, inscriptions, responsables, import, réinscription |
| Comptabilité | Atelier pratique | 3 h | Frais, tranches, remises, validation, contrepassation, états |
| Caissiers | Atelier pratique | 1 h 30 | Encaissement, impression, arrêté de caisse |
| Direction | Démonstration | 1 h | Dashboards, indicateurs, exports |
| Administrateur | Atelier | 2 h | Utilisateurs, rôles, paramètres, audit |
| Parents | Notice illustrée + SMS | — | Télécharger, créer son compte, associer, payer |

Livrables : guides illustrés par rôle (PDF, français), courtes vidéos, aide en ligne contextuelle dans l'application, FAQ, et une **notice parent en une page** distribuée avec la fiche d'association.

**Former des référents internes** est plus efficace que de former tout le monde : deux ou trois personnes maîtrisant réellement l'outil et capables d'aider leurs collègues.

---

## 8. Stratégie de bascule

### Recommandation : déploiement progressif

```text
Semaine 1   Mise en production, données reprises
            Utilisation par la SEULE comptabilité, en double avec l'existant
Semaine 2   Ouverture de la caisse dans CSB Noutcha KAMGUE, reçus CSB Noutcha KAMGUE officiels
            L'ancien système passe en lecture seule
Semaine 3   Ouverture de l'app parent à UNE classe pilote (environ 50 familles)
Semaine 4   Correction des retours, ajustements
Semaine 5-6 Ouverture progressive par niveau
Semaine 7   Ouverture générale
```

### Ce qu'il faut éviter absolument

- **Basculer pendant la semaine de rentrée.** C'est le pic d'activité : la moindre difficulté devient une crise. Basculer 3 à 4 semaines avant, ou en milieu de trimestre.
- **Ouvrir l'app parent à 1 500 familles d'un coup** sans pilote. Un bug d'affichage de solde génère 200 appels au secrétariat en une matinée.
- **Couper l'ancien système avant validation de la reprise.**

### Plan de repli

Documenté avant la bascule : conditions de déclenchement, procédure de retour à l'ancien système, responsable de la décision, communication aux parents. Il ne servira probablement pas — mais son absence transforme un incident en panique.

---

## 9. Accompagnement post-bascule

**Quatre semaines de suivi rapproché**, à budgéter explicitement :

- Semaine 1 : présence sur site, ou disponibilité immédiate
- Point quotidien la première semaine, puis hebdomadaire
- Canal direct pour les utilisateurs clés
- Suivi des indicateurs d'adoption : comptes parents créés, associations acceptées, part des paiements passant par CSB Noutcha KAMGUE, volume d'appels au secrétariat
- Recueil structuré des retours, alimentant le périmètre de la V1.1

### Indicateurs de réussite à 3 mois

| Indicateur | Cible |
|---|---|
| Comptes parents créés | > 60 % des familles |
| Associations acceptées | > 80 % des propositions |
| Paiements enregistrés dans CSB Noutcha KAMGUE | 100 % (tous canaux confondus) |
| Part des paiements Mobile Money | > 25 % |
| Écarts de réconciliation | 0 |
| Délai moyen de validation d'un paiement externe | < 24 h |
| Utilisation d'Excel en parallèle | 0 |

Le dernier est le plus révélateur : tant que la comptabilité maintient un tableau parallèle, CSB Noutcha KAMGUE n'est pas devenu la source de vérité.

---

## 10. Critères d'acceptation

- [ ] Les 12 scénarios de recette sont validés par écrit par le client
- [ ] Le test du §88 réussit sur 10 élèves tirés au hasard dans les données réelles
- [ ] Les tests E2E automatisés passent en CI
- [ ] Le test de charge tient l'objectif : 200 paiements/h, 50 utilisateurs simultanés
- [ ] La reprise est validée : effectifs, montants dus et montants payés conformes au franc près
- [ ] Le contrôle par sondage sur 20 élèves est conforme
- [ ] L'infrastructure de production est en place, supervisée, alertée
- [ ] Une restauration de sauvegarde a été réalisée avec succès
- [ ] L'application mobile est publiée sur Google Play (et App Store si prévu)
- [ ] Tous les utilisateurs sont formés, les guides sont remis
- [ ] Le plan de bascule et le plan de repli sont écrits et validés
- [ ] La checklist de sécurité de la Phase 16 est intégralement cochée
- [ ] Un premier paiement réel a été effectué et vérifié de bout en bout
- [ ] Le job de réconciliation tourne quotidiennement, sans écart

---

## 11. Risques

| Risque | Impact | Parade |
|---|---|---|
| Données existantes de mauvaise qualité | Reprise impossible ou fausse | Inventaire dès la Phase 05, nettoyage par le client, reprise à blanc et itérations |
| Bascule pendant la rentrée | Crise opérationnelle | Planifier hors pic, décision prise tôt et tenue |
| Rejet par les utilisateurs | Retour au papier | Impliquer la scolarité et la comptabilité dès les Phases 03 et 06, pas à la recette |
| Faible adoption par les parents | Mobile Money inutilisé | Communication de l'établissement, notice papier, appui du secrétariat, classe pilote |
| Délais de publication sur les stores | Report de la mise en service | Soumettre dès la Phase 11, ne pas attendre la fin |
| Ancien système coupé trop tôt | Perte d'information | Le maintenir en lecture seule pendant au moins un trimestre |
| Sous-estimation de la reprise | Retard de plusieurs semaines | Démarrer dès la Phase 05 ; c'est un chantier parallèle, pas une tâche finale |
| Absence d'accompagnement après bascule | Abandon progressif | Quatre semaines de suivi budgétées dès le devis initial |
