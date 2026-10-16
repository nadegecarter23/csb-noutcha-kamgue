import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildTestApp, type TestApp } from './helpers/test-app.js';

/**
 * TEST D'ARCHITECTURE — le garde-fou le plus important de la Phase 01.
 *
 * Il parcourt la table de routage de Fastify et échoue si une route mutative
 * (POST / PATCH / PUT / DELETE) n'est protégée ni par une garde
 * d'authentification, ni par le marqueur explicite `config.public = true`.
 *
 * Sa raison d'être : les 16 phases suivantes vont ajouter des centaines de
 * routes. Compter sur la vigilance de chacun pour ne jamais oublier une garde
 * est une stratégie perdante. Ce test transforme l'oubli en échec de CI.
 *
 * Référence : docs/phases/PHASE-01-identite-roles-acces.md §5.
 */

interface RouteInfo {
  method: string;
  url: string;
  hasAuth: boolean;
  isPublic: boolean;
}

const MUTATING_METHODS = new Set(['POST', 'PATCH', 'PUT', 'DELETE']);

/**
 * Routes publiques par nature, avec la raison qui le justifie.
 *
 * Toute nouvelle entrée ici doit être un choix conscient et argumenté :
 * c'est la seule porte de sortie du test.
 */
const PUBLIC_ROUTES: Record<string, string> = {
  'POST /api/v1/auth/register': "création de compte : l'utilisateur n'existe pas encore",
  'POST /api/v1/auth/otp/send': 'envoi de code : précède toute authentification',
  'POST /api/v1/auth/otp/verify': "vérification de code : établit l'authentification",
  'POST /api/v1/auth/login': 'connexion',
  'POST /api/v1/auth/refresh': 'le jeton d’accès est expiré par construction',
  'POST /api/v1/auth/logout': 'doit fonctionner même avec un jeton d’accès expiré',
  'POST /api/v1/auth/password/forgot': "l'utilisateur ne peut pas se connecter",
  'POST /api/v1/auth/password/reset': "l'utilisateur ne peut pas se connecter",
  'POST /api/v1/webhooks/mtn-momo': 'callback MTN signé et vérifié avant tout crédit',
  'POST /api/v1/webhooks/orange-money': 'callback Orange signé et vérifié avant tout crédit',
};

describe('couverture des gardes sur les routes', () => {
  let app: TestApp;
  let routes: RouteInfo[];

  beforeAll(async () => {
    app = await buildTestApp();
    await app.ready();
    routes = app.routeRegistry;
  });

  afterAll(async () => {
    await app.close();
  });

  it('découvre bien des routes (garde-fou du test lui-même)', () => {
    expect(routes.length).toBeGreaterThan(5);
  });

  it('toute route mutative est authentifiée ou explicitement publique', () => {
    const unguarded = routes
      .filter((route) => MUTATING_METHODS.has(route.method))
      .filter((route) => !route.hasAuth && !route.isPublic);

    expect(
      unguarded,
      `Routes mutatives sans garde ni marqueur public :\n` +
        unguarded.map((r) => `  ${r.method} ${r.url}`).join('\n') +
        `\n\nAjoutez « preHandler: [app.authenticate, app.requirePermission(...)] » ` +
        `ou « config: { public: true } » si la route doit rester ouverte.`,
    ).toEqual([]);
  });

  it('chaque route publique figure dans la liste documentée', () => {
    const undocumented = routes
      .filter((route) => route.isPublic && MUTATING_METHODS.has(route.method))
      .map((route) => `${route.method} ${route.url}`)
      .filter((key) => !(key in PUBLIC_ROUTES));

    expect(
      undocumented,
      `Routes marquées publiques mais non documentées dans PUBLIC_ROUTES :\n` +
        undocumented.map((r) => `  ${r}`).join('\n') +
        `\n\nUne route publique est une décision de sécurité : justifiez-la.`,
    ).toEqual([]);
  });

  it('aucune route documentée comme publique n’a disparu', () => {
    const actual = new Set(routes.map((route) => `${route.method} ${route.url}`));
    const stale = Object.keys(PUBLIC_ROUTES).filter((key) => !actual.has(key));

    expect(
      stale,
      `Entrées obsolètes dans PUBLIC_ROUTES (routes supprimées ou renommées) :\n` +
        stale.map((r) => `  ${r}`).join('\n'),
    ).toEqual([]);
  });
});
