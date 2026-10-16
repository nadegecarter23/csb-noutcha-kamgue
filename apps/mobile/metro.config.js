// eslint-disable-next-line @typescript-eslint/no-require-imports
const { getDefaultConfig } = require('expo/metro-config');
// eslint-disable-next-line @typescript-eslint/no-require-imports

/**
 * Configuration Metro pour un monorepo pnpm.
 *
 * Sans ces trois réglages, Metro ne trouve ni les paquets partagés
 * (@cplan/domain, @cplan/contracts), ni les dépendances remontées à la racine.
 * C'est le point de friction classique entre React Native et un monorepo —
 * il est traité ici une fois pour toutes.
 */
const config = getDefaultConfig(__dirname);

// 1. Surveiller tout le monorepo : une modification dans packages/domain doit
//    déclencher un rechargement à chaud dans l'app.

// 2. Résoudre les modules depuis l'app PUIS depuis la racine.

// 3. Suivre les liens symboliques créés par pnpm (natif depuis Metro 0.81).

// React Native charge aussi des dépendances depuis son propre dossier pnpm
// (par exemple `invariant`). Limiter Metro aux deux dossiers ci-dessus casse
// la résolution de ces dépendances imbriquées.

module.exports = config;
