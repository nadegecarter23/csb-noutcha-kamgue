# Charte graphique numérique — CSB Noutcha KAMGUE

> Charte de référence pour l'application web, l'application mobile, les documents
> générés et les futures interfaces du Complexe Scolaire Bilingue Noutcha KAMGUE.

## 1. Sources analysées

Cette charte a été établie le 10 octobre 2026 à partir de :

- l'écusson officiel transmis pour le projet ;
- l'identité visuelle du [site public du CSB](https://csbnoutchakamgue.netlify.app/) ;
- la feuille de style publique du site ;
- les contraintes d'accessibilité et d'usage d'une application de gestion scolaire.

Le site public utilise déjà une identité cohérente : bleu nuit institutionnel,
orange énergique, blanc, photographies avec voile bleu, cartes claires et titres
forts. L'application reprend cette identité sans reproduire les effets promotionnels
qui gêneraient la lecture de tableaux, formulaires et dossiers administratifs.

---

## 2. Identité de marque

### Nom officiel

**Complexe Scolaire Bilingue Noutcha KAMGUE**

Formes d'usage :

- forme complète : `Complexe Scolaire Bilingue Noutcha KAMGUE` ;
- forme courte : `CSB Noutcha KAMGUE` ;
- sigle compact, lorsque l'espace est très limité : `CSB NK`.

La casse `Noutcha KAMGUE` doit rester cohérente dans un même support. Dans les
titres officiels, préférer la forme complète. Dans la navigation et les petits
écrans, employer la forme courte.

### Devises présentes sur l'écusson

- **Apprendre — Persévérer — Réussir**
- **L'école des génies**

La première devise exprime le parcours éducatif. La seconde est la signature de
l'établissement. Elles ne doivent pas être utilisées comme simples textes de
remplissage ou être modifiées sans validation de l'établissement.

### Symbolique du logo

| Élément | Sens visuel retenu |
|---|---|
| Écusson | Protection, institution, appartenance |
| Livre ouvert | Connaissance et transmission |
| Trois étoiles | Ambition, excellence et progression |
| Formes centrales orange | Élan, coopération et réussite |
| Couronne végétale | Accomplissement et mérite |
| Bleu | Confiance, rigueur et stabilité |
| Orange | Énergie, jeunesse et engagement |

---

## 3. Palette officielle

### 3.1 Couleurs principales

| Jeton | Valeur | Origine | Usage principal |
|---|---:|---|---|
| `brand.navy` | `#0B1B3D` | Site public | Navigation, boutons principaux, en-têtes et fonds institutionnels |
| `brand.royal` | `#1F3D80` | Couleur dominante du logo | Liens secondaires, graphiques, sélection et éléments identitaires |
| `brand.orange` | `#F08524` | Couleur dominante du logo | Accents, indicateurs actifs, illustrations et appels visuels |
| `brand.orangeDeep` | `#E67E22` | Site public | Variante orange plus sombre, bordures actives et graphiques |
| `brand.gold` | `#F1C40F` | Site public | Distinctions, réussite et accent exceptionnel sur fond sombre |
| `brand.white` | `#FFFFFF` | Logo et site | Cartes, espaces négatifs et texte sur bleu |

Le bleu nuit est la couleur fonctionnelle principale de l'application. Le bleu
royal assure la continuité avec l'écusson. L'orange est un accent et ne doit pas
devenir la couleur dominante d'un écran administratif.

### 3.2 Couleurs neutres

| Jeton | Valeur | Usage |
|---|---:|---|
| `surface.canvas` | `#F8F9FA` | Fond général des écrans |
| `surface.card` | `#FFFFFF` | Cartes, formulaires et tableaux |
| `surface.softBlue` | `#F2F5FB` | Sélection légère et regroupements |
| `text.primary` | `#2C3E50` | Texte principal |
| `text.strong` | `#0B1B3D` | Titres et données importantes |
| `text.muted` | `#667085` | Aides et métadonnées accessibles |
| `border.default` | `#D9E0EA` | Bordures de champs et séparateurs |
| `border.strong` | `#A9B7CC` | Éléments nécessitant plus de contraste |

Le gris `#7F8C8D` présent sur le site public est trop clair pour certains petits
textes sur fond blanc. L'application utilise `#667085` comme gris secondaire
afin d'améliorer la lisibilité.

### 3.3 Couleurs complémentaires du logo

| Valeur | Élément | Règle |
|---:|---|---|
| `#F4DBC6` | Pages du livre | Illustration uniquement |
| `#EFC5A7` | Ombres du livre | Illustration uniquement |
| `#E6372B` | Marque-page rouge | Réservé au logo ; ne définit pas à lui seul l'état « erreur » |

### 3.4 Couleurs d'état

Les états métier doivent rester indépendants des couleurs de marque :

| État | Fond léger | Texte/icône | Exemple |
|---|---:|---:|---|
| Succès | `#ECFDF3` | `#067647` | Paiement validé |
| Information | `#EFF8FF` | `#175CD3` | Information de dossier |
| Attention | `#FFFAEB` | `#B54708` | Échéance proche |
| Erreur | `#FEF3F2` | `#B42318` | Échec ou donnée invalide |
| Neutre | `#F2F4F7` | `#475467` | Brouillon ou archivé |

Chaque état doit toujours comporter un libellé ou une icône. La couleur seule ne
doit jamais porter l'information.

---

## 4. Accessibilité des couleurs

Contrastes mesurés selon WCAG :

| Combinaison | Contraste | Décision |
|---|---:|---|
| Bleu nuit `#0B1B3D` / blanc | `16.96:1` | Excellent pour tout texte |
| Bleu royal `#1F3D80` / blanc | `10.31:1` | Excellent pour tout texte |
| Texte `#2C3E50` / blanc | `10.98:1` | Excellent pour le contenu |
| Or `#F1C40F` / bleu nuit | `10.21:1` | Excellent pour accents sur fond sombre |
| Orange profond `#E67E22` / bleu nuit | `5.95:1` | Acceptable pour texte et boutons |
| Orange profond `#E67E22` / blanc | `2.85:1` | Insuffisant pour du petit texte blanc |
| Orange logo `#F08524` / blanc | `2.60:1` | Insuffisant pour du petit texte blanc |

Conséquences obligatoires :

- les boutons principaux utilisent un fond bleu nuit avec texte blanc ;
- un bouton orange utilise du texte bleu nuit, pas du texte blanc de petite taille ;
- l'orange sur fond blanc sert aux icônes épaisses, traits, bordures et grands éléments ;
- les tableaux, formulaires et graphiques ne dépendent jamais uniquement d'une couleur ;
- les états de focus doivent être visibles au clavier avec un anneau bleu royal ou orange accompagné d'un contraste suffisant.

---

## 5. Typographie

### Police de l'application

L'application conserve **Inter**, déjà embarquée localement dans le projet, avec
les replis suivants :

```css
font-family: Inter, "Segoe UI", Tahoma, Arial, sans-serif;
```

Ce choix assure :

- la continuité avec `Segoe UI`, utilisée sur le site public ;
- une excellente lisibilité des tableaux et données chiffrées ;
- un fonctionnement hors ligne sur le web et le mobile ;
- une identité homogène entre les systèmes d'exploitation.

### Hiérarchie recommandée

| Élément | Taille indicative | Graisse | Usage |
|---|---:|---:|---|
| Titre d'écran | 28–32 px | 700–800 | Une seule fois par écran |
| Titre de section | 20–24 px | 700 | Regroupement principal |
| Titre de carte | 16–18 px | 600–700 | Cartes et panneaux |
| Corps | 14–16 px | 400–500 | Lecture courante |
| Libellé | 13–14 px | 600 | Champs et contrôles |
| Métadonnée | 12–13 px | 500 | Date, référence, aide |
| Montant important | 24–36 px | 700–800 | Soldes et indicateurs financiers |

Les textes entièrement en capitales sont réservés aux petits repères, codes et
en-têtes courts. Les phrases, boutons et titres ne doivent pas être écrits
systématiquement en capitales.

---

## 6. Logo et signatures

### Variantes nécessaires

La source transmise est l'écusson complet. Avant le rebranding final, préparer :

1. écusson complet sur fond clair ;
2. écusson complet sur fond sombre ;
3. version compacte sans texte circulaire pour la navigation ;
4. pictogramme carré pour favicon et application mobile ;
5. version monochrome bleu nuit pour les documents économiques à imprimer ;
6. fichier vectoriel SVG maître, validé par l'établissement.

### Règles d'usage

- Ne jamais étirer, incliner ou recolorer arbitrairement le logo.
- Conserver ses proportions et son espace de respiration.
- L'écusson complet est réservé aux connexions, documents officiels et écrans institutionnels.
- Ne pas réduire l'écusson complet au point de rendre les devises illisibles.
- Dans une barre latérale compacte, employer la future variante simplifiée plutôt que l'écusson complet écrasé.
- Éviter de placer le logo sur une photographie chargée sans fond ou protection visuelle.

### Taille et dégagement

- taille numérique minimale recommandée de l'écusson complet : `96 px` de large ;
- sous `96 px`, utiliser la variante compacte ;
- espace libre minimal autour du logo : environ 10 % de sa largeur ;
- sur les documents A4, utiliser une largeur comprise entre 24 et 36 mm selon le document.

---

## 7. Formes et composants

### Principes

L'interface doit être institutionnelle, chaleureuse et très lisible :

- surfaces majoritairement blanches ou gris très clair ;
- bleu nuit pour la structure et la navigation ;
- orange pour attirer l'attention avec parcimonie ;
- densité adaptée aux outils administratifs ;
- mouvements courts et discrets ;
- iconographie simple, cohérente et accompagnée de texte lorsque l'action n'est pas évidente.

### Jetons de composants

| Élément | Valeur recommandée |
|---|---|
| Rayon des champs et boutons | 8 px |
| Rayon des cartes | 12 px |
| Rayon des grandes fenêtres | 14–16 px |
| Bordure | 1 px `#D9E0EA` |
| Ombre légère | `0 4px 14px rgba(11, 27, 61, 0.07)` |
| Ombre modale | `0 20px 48px rgba(11, 27, 61, 0.18)` |
| Hauteur bouton web | 44–48 px |
| Hauteur contrôle tactile | au moins 48 px |
| Animation standard | 150–220 ms |

Le site vitrine emploie des mouvements pouvant atteindre 400 ms et des élévations
marquées au survol. L'application réduit ces effets pour conserver une sensation
rapide et éviter les déplacements visuels dans les écrans de travail.

### Boutons

- **Principal** : fond bleu nuit, texte blanc.
- **Secondaire** : fond blanc, bordure bleu royal, texte bleu nuit.
- **Accent** : fond orange, texte bleu nuit.
- **Destructif** : fond rouge ou bordure rouge, jamais orange.
- **Fantôme** : fond transparent, texte bleu royal, pour les actions de faible priorité.

---

## 8. Mise en page de l'application

### Navigation

- barre latérale bleu nuit sur ordinateur ;
- logo compact et nom court en haut ;
- élément actif signalé par fond plus clair, liseré orange, icône et libellé ;
- sélecteur de cycle toujours visible pour un utilisateur multi-cycle ;
- périmètre actif affiché textuellement, jamais seulement par une couleur.

### Contenu

- fond général `#F8F9FA` ;
- cartes blanches avec bordure discrète ;
- tableaux à en-têtes légèrement bleutés ;
- titres bleu nuit ;
- données importantes en texte fort, sans multiplier les aplats colorés ;
- orange réservé aux indicateurs actifs et points d'attention non critiques.

### Cycles et sections

Tous les cycles utilisent la même marque. Ils sont distingués d'abord par leur
nom, leur icône et leur fil d'Ariane. Il ne faut pas attribuer une couleur de
marque différente à chaque cycle tant qu'une palette secondaire n'a pas été
validée. Cela évite que la couleur seule devienne une barrière de compréhension.

### Photographies

Pour les écrans institutionnels ou la connexion :

- utiliser des photographies authentiques du CSB lorsqu'elles sont disponibles ;
- appliquer si nécessaire un voile bleu nuit de 60 à 85 % derrière un texte blanc ;
- éviter les images génériques dans les écrans de gestion quotidiens ;
- obtenir les autorisations nécessaires avant l'usage de photos d'élèves.

---

## 9. Documents et impressions

- Fond blanc pour limiter la consommation d'encre.
- Logo officiel en en-tête, avec variante monochrome disponible.
- Bleu nuit pour les titres et filets principaux.
- Orange limité aux repères importants ; aucun grand aplat orange.
- Numéro, cycle, année scolaire et statut visibles sur chaque document officiel.
- Reçus clairement identifiés par cycle et séquence.
- Tableaux lisibles en niveaux de gris.
- Typographie minimale de 9 pt sur les documents administratifs.

---

## 10. Ton rédactionnel

Le ton de l'application est :

- clair et respectueux ;
- institutionnel sans être froid ;
- direct dans les actions ;
- rassurant lors des opérations financières ;
- précis dans les erreurs et validations.

Exemples :

- préférer « Paiement enregistré avec succès » à « Opération OK » ;
- préférer « Sélectionnez le cycle concerné » à « Cycle manquant » ;
- préciser les conséquences avant une action sensible ;
- éviter les slogans promotionnels dans les écrans de saisie.

---

## 11. Variables cibles indicatives

Ces variables constituent la cible du futur rebranding. Elles ne sont pas encore
appliquées au code :

```css
:root {
  --brand-navy: #0b1b3d;
  --brand-royal: #1f3d80;
  --brand-orange: #f08524;
  --brand-orange-deep: #e67e22;
  --brand-gold: #f1c40f;

  --canvas: #f8f9fa;
  --surface: #ffffff;
  --surface-soft-blue: #f2f5fb;
  --ink: #2c3e50;
  --ink-strong: #0b1b3d;
  --ink-muted: #667085;
  --line: #d9e0ea;
  --line-strong: #a9b7cc;

  --focus-ring: #1f3d80;
  --font-sans: Inter, "Segoe UI", Tahoma, Arial, sans-serif;
}
```

---

## 12. Éléments encore requis avant application définitive

- logo maître SVG ou fichier vectoriel équivalent ;
- confirmation de l'orthographe et de la casse officielles du nom ;
- validation formelle des deux devises ;
- coordonnées officielles de l'établissement ;
- photographies autorisées pour les écrans institutionnels ;
- validation des variantes compactes du logo ;
- validation sur des prototypes web, mobile, reçus et bulletins.

