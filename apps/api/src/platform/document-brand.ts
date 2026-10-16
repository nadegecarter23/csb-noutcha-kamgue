import { readFile } from 'node:fs/promises';

/**
 * Identité visuelle imprimée sur les documents officiels (bulletins, etc.).
 *
 * Le nom et les coordonnées viennent de l'établissement en base ; l'écusson et
 * les devises sont ceux validés dans la charte (docs/07-CHARTE-GRAPHIQUE.md).
 * Le logo est une version allégée (560 px) de l'écusson officiel, embarquée
 * avec l'API pour que la génération ne dépende pas du stockage objet.
 */
export interface DocumentBrand {
  name: string;
  address: string | null;
  phone: string | null;
  email: string | null;
  mottos: { primary: string; signature: string };
  logo: Uint8Array | null;
}

export const DEFAULT_MOTTOS = {
  primary: 'Apprendre — Persévérer — Réussir',
  signature: "L'école des génies",
};

// `src/platform/*.ts` en développement, `dist/server.js` une fois bundlé.
const LOGO_CANDIDATES = [
  new URL('../../assets/brand/csb-nk-logo.png', import.meta.url),
  new URL('../assets/brand/csb-nk-logo.png', import.meta.url),
];

let logoCache: Promise<Uint8Array | null> | undefined;

export function loadBrandLogo(): Promise<Uint8Array | null> {
  logoCache ??= (async () => {
    for (const candidate of LOGO_CANDIDATES) {
      try {
        return new Uint8Array(await readFile(candidate));
      } catch {
        // Essaie l'emplacement suivant ; un document sans logo reste valide.
      }
    }
    return null;
  })();
  return logoCache;
}

export async function buildDocumentBrand(school: {
  name: string;
  address?: string | null;
  phone?: string | null;
  email?: string | null;
}): Promise<DocumentBrand> {
  return {
    name: school.name,
    address: school.address ?? null,
    phone: school.phone ?? null,
    email: school.email ?? null,
    mottos: DEFAULT_MOTTOS,
    logo: await loadBrandLogo(),
  };
}
