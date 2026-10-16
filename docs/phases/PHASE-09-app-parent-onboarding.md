# PHASE 09 — App Parent : onboarding & associations

**Durée estimée** : 2,5 semaines · **Pré-requis** : P04 (API) · **Réf. cahier** : §3.1, §7, §8, §9, §10, §11, §12, §69, §72, §73

Peut démarrer en parallèle du flux établissement dès que la Phase 04 est livrée côté API.

---

## 1. Objectif

Livrer la première moitié de l'application mobile : **amener un parent d'un téléphone vierge jusqu'à la liste vérifiée de ses enfants**.

Cette phase ne montre encore aucune donnée financière. Elle établit la confiance et l'identité. C'est aussi le point de contact le plus large du produit : la majorité des utilisateurs de CSB Noutcha KAMGUE seront des parents, souvent peu familiers des applications, sur des terminaux modestes et un réseau instable.

**Critère de réussite** : un parent qui n'a jamais utilisé l'application, sans aide, atteint la liste de ses enfants en moins de 3 minutes.

---

## 2. Périmètre

### Inclus
- Écrans P01 (bienvenue), P02 (création de compte), P03 (OTP)
- Connexion, mot de passe oublié
- Écran P04 — enfants détectés, acceptation ou refus individuel
- Écran P05 — ajouter un enfant : QR, code court, matricule + code, demande manuelle
- Scanner de QR code
- Accueil P06 en version « liste des enfants » (sans les montants — Phase 10)
- Profil, changement de numéro (§72), déconnexion
- Gestion de session, rafraîchissement de token, expulsion propre
- États hors ligne, erreurs réseau, écrans de chargement

### Exclu
- Situation financière et paiements (Phase 10 et 11)
- Notifications push (Phase 13) — le jeton d'appareil est enregistré ici, l'exploitation vient après

---

## 3. Parcours complet

```text
P01 Bienvenue
  ├── Se connecter ────────────► téléphone + mot de passe ──┐
  └── Créer un compte                                       │
         ▼                                                  │
P02 Informations                                            │
   prénom, nom, téléphone, e-mail?, mot de passe, CGU       │
         ▼                                                  │
P03 Vérification OTP  (6 chiffres, 5 min)                   │
         ▼                                                  │
   Détection automatique (§8)                               │
         ├── enfants trouvés ──► P04 Enfants détectés ◄──────┘
         │                          accepter / refuser
         └── aucun enfant ──────► P05 Ajouter un enfant
                                     ▼
                              P06 Accueil — mes enfants
```

---

## 4. Écrans

### P01 — Bienvenue

Logo CSB Noutcha KAMGUE, message d'accueil bref, deux boutons pleine largeur : `Créer un compte` (principal) et `Se connecter` (secondaire). Éventuellement 2 ou 3 illustrations en carrousel expliquant l'usage. Sobriété : c'est un outil, pas une vitrine.

### P02 — Création du compte

Champs du §7 : prénom, nom, numéro de téléphone, e-mail (facultatif, clairement marqué), mot de passe, confirmation.

Points d'attention :
- **Le champ téléphone est le plus important de l'application.** Indicatif `+237` pré-rempli et visible, masque de saisie `6 99 12 34 56`, clavier numérique, normalisation en direct avec confirmation affichée sous le champ.
- Validation en direct, pas seulement à la soumission.
- Mot de passe : 8 caractères minimum, indicateur de robustesse, bouton afficher/masquer. Aucune exigence de caractères spéciaux — sur un clavier de téléphone, cela génère plus d'oublis que de sécurité.
- Case CGU obligatoire, avec lien lisible.
- Un numéro déjà inscrit propose de se connecter plutôt que d'afficher une erreur sèche.

### P03 — Vérification du numéro

```text
        Vérification

  Nous avons envoyé un code à
      +237 6 99 12 34 56          [Modifier]

     ┌───┬───┬───┬───┬───┬───┐
     │   │   │   │   │   │   │
     └───┴───┴───┴───┴───┴───┘

        [    Vérifier    ]

     Renvoyer le code dans 42 s
```

- Saisie automatique du SMS sur Android (`autoComplete="sms-otp"`), coller depuis le presse-papier sur iOS.
- Passage automatique d'une case à l'autre, retour arrière géré, validation automatique à la 6e saisie.
- Compte à rebours de 60 s avant renvoi ; après 3 renvois, message d'aide (« Vérifiez votre réseau, ou contactez l'établissement »).
- Messages d'erreur distincts : code incorrect (avec le nombre de tentatives restantes), code expiré (proposer un renvoi), trop de tentatives.
- `Modifier` renvoie à P02 avec le numéro pré-rempli — une faute de frappe ne doit pas obliger à tout recommencer.

### P04 — Enfants détectés (§8)

```text
   Nous avons trouvé des élèves
   associés à votre numéro

┌──────────────────────────────────┐
│  Nathan Fotso                    │
│  6e A · CPLAN-003••              │
│  CSB Noutcha KAMGUE                   │
│                                  │
│  Vous êtes enregistré comme      │
│  Père                            │
│                                  │
│  [ Accepter ]                    │
│  [ Ce n'est pas mon enfant ]     │
└──────────────────────────────────┘

┌──────────────────────────────────┐
│  Sarah Fotso                     │
│  3e B · CPLAN-003••              │
│  …                               │
└──────────────────────────────────┘

           [ Continuer ]
```

- Décision **indépendante** par enfant (§69) : refuser l'un n'affecte pas les autres.
- Matricule partiellement masqué avant acceptation : on ne divulgue rien de plus que nécessaire pour reconnaître son enfant.
- Aucune donnée financière avant acceptation.
- Le refus ouvre une confirmation expliquant la conséquence : « L'établissement sera informé afin de corriger ses informations. » (crée un `DISPUTE`, §73).
- Si le parent refuse tout, il arrive sur P05 avec un message d'aide.

### P05 — Ajouter un enfant (§10)

```text
     Ajouter un enfant

┌──────────────────────────────────┐
│  📷  Scanner un QR Code          │
│      Fiche remise par l'école    │
├──────────────────────────────────┤
│  🔢  Entrer un code              │
│      Exemple : 8F7K-PQ4M         │
├──────────────────────────────────┤
│  🎓  Matricule + code sécurisé   │
├──────────────────────────────────┤
│  ✉️   Demander une association    │
│      L'école validera la demande │
└──────────────────────────────────┘
```

**Scanner** : plein écran, cadre de visée, torche, message d'aide si aucun code détecté après 10 s, repli explicite vers la saisie manuelle. Permission caméra demandée **au moment de l'usage**, avec explication, jamais au lancement de l'app. Refus de permission : bascule automatique sur la saisie manuelle, sans impasse.

**Code court** : champ segmenté `XXXX-XXXX`, majuscules automatiques, tirets insérés seuls, alphabet non ambigu.

**Demande manuelle** : matricule ou nom de l'élève, lien de parenté, message. Écran de confirmation : « Votre demande a été transmise sur CSB Noutcha KAMGUE. Vous serez notifié dès qu'elle sera traitée. » Suivi de l'état de la demande consultable.

Chaque succès affiche l'enfant associé et propose d'en ajouter un autre — un parent de trois enfants enchaîne trois scans.

### P06 — Accueil (version de cette phase)

Liste des enfants avec nom, classe, matricule, établissement. Emplacements financiers présents mais neutres (« Situation financière disponible prochainement ») — remplis en Phase 10.

État vide soigné : « Aucun enfant associé » + explication + bouton `Ajouter un enfant`. Un état vide sans issue est un abandon garanti.

### Profil

Coordonnées, changement de mot de passe, **changement de numéro** (§72, double OTP), langue, notifications (préparé pour la Phase 13), mes appareils connectés, déconnexion, suppression de compte (demande transmise à l'établissement).

---

## 5. Points techniques

### Session
Access token en mémoire, refresh token dans `expo-secure-store`. Rafraîchissement automatique et transparent, avec file d'attente des requêtes concurrentes pendant le renouvellement. Expiration du refresh ⇒ retour à P01 avec un message clair, **jamais** un écran blanc ou une boucle.

### Réseau
Chaque appel gère : succès, erreur métier (message serveur affiché tel quel, traduit), erreur réseau (« Pas de connexion — Réessayer »), erreur serveur (« Problème technique, réessayez dans un instant »). Aucun message technique brut à l'écran.

Détection hors ligne globale : bandeau discret en haut, actions d'écriture désactivées avec explication.

### Performance
Cible : démarrage à froid en moins de 3 s sur un Android d'entrée de gamme. Bundle optimisé, images en WebP, pas de bibliothèque d'animation lourde, listes virtualisées.

### Accessibilité
Taille de police respectant les préférences système, contrastes AA, cibles tactiles d'au moins 44 pt, libellés d'accessibilité sur chaque contrôle. Beaucoup de parents ont plus de 50 ans.

### Langue
Interface en français, structure i18n prête pour l'anglais (nécessaire dans les régions anglophones du Cameroun — à confirmer avec le client).

---

## 6. API consommée

Livrée en Phases 01 et 04 :
```
POST /auth/register · /auth/otp/send · /auth/otp/verify · /auth/login · /auth/refresh
GET  /auth/me
POST /auth/phone-change/request · /confirm
GET  /parent/pending-links
POST /parent/links/:id/accept · /reject
POST /parent/links/redeem
POST /parent/link-requests
GET  /parent/children
POST /parent/devices        # enregistrement du jeton push (exploité en Phase 13)
```

---

## 7. Critères d'acceptation

- [ ] Un parent crée son compte et reçoit l'OTP en moins de 60 s
- [ ] La saisie automatique du SMS fonctionne sur Android
- [ ] Les trois formats de numéro (`699123456`, `+237699123456`, `237 699 12 34 56`) sont acceptés et normalisés
- [ ] Un numéro déjà inscrit oriente vers la connexion
- [ ] Après vérification, les enfants détectés apparaissent automatiquement (P04)
- [ ] Accepter un enfant et en refuser un autre fonctionne indépendamment
- [ ] Le refus crée bien un litige côté établissement
- [ ] Le scan d'un QR valide associe l'enfant en moins de 5 s
- [ ] Le refus de la permission caméra bascule proprement sur la saisie manuelle
- [ ] Un code expiré ou déjà utilisé affiche un message compréhensible par un non-technicien
- [ ] La demande manuelle apparaît côté scolarité et son état est suivi côté parent
- [ ] Le changement de numéro fonctionne avec double OTP
- [ ] L'expiration de session renvoie proprement à P01
- [ ] En mode avion : bandeau affiché, aucune erreur brute, données en cache visibles
- [ ] Démarrage à froid en moins de 3 s sur Android 8, terminal d'entrée de gamme
- [ ] Test utilisateur : 5 parents réels atteignent la liste de leurs enfants sans aide en moins de 3 min
- [ ] Aucun accès à un enfant non associé (test de sécurité de la Phase 04 rejoué depuis l'app)

---

## 8. Risques

| Risque | Impact | Parade |
|---|---|---|
| SMS non reçu (réseau, coût, filtrage opérateur) | Inscription bloquée, abandon | Provider de repli, renvoi, message d'aide, recours au support établissement, suivi du taux de livraison |
| Parent qui ne comprend pas l'écran P04 | Refus par erreur d'un vrai enfant | Formulation très explicite, illustration, refus réversible côté établissement |
| Terminaux anciens, caméras médiocres | Scan impossible | Le code court est **toujours** proposé en alternative visible |
| Réseau instable pendant l'inscription | État incohérent | Chaque étape est idempotente et reprenable ; l'état d'inscription est persisté localement |
| Fragmentation Android | Bugs spécifiques | Tester sur 3 modèles réels bas de gamme, pas seulement en émulateur |
| Parent illettré ou peu à l'aise avec le numérique | Exclusion | La caisse (Phase 08) reste un canal complet ; les SMS de notification restent envoyés (Phase 13) |
| Délais de validation sur les stores | Retard de mise en production | Publier tôt une version de test (TestFlight / piste interne Play) dès cette phase, sans attendre la Phase 11 |
