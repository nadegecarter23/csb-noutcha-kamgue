import { hash as argon2Hash, verify as argon2Verify } from '@node-rs/argon2';
import { createHash, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';

/**
 * Primitives cryptographiques.
 *
 * Tout ce qui touche aux mots de passe, jetons et codes OTP passe par ici.
 * Un seul endroit à auditer, un seul endroit à faire évoluer.
 *
 * Référence : docs/02-ARCHITECTURE-TECHNIQUE.md §6 (ADR-010).
 */

/* -------------------------------------------------------------------------- */
/* Mots de passe — Argon2id                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Paramètres conformes aux recommandations OWASP (profil « 19 Mio »).
 *
 * Compromis assumé : ~50 ms par vérification sur un serveur modeste. C'est
 * volontairement lent — c'est ce qui rend une attaque par dictionnaire coûteuse.
 */
/**
 * Identifiant d'Argon2id tel que fixé par la spécification argon2 (RFC 9106) :
 * Argon2d = 0, Argon2i = 1, Argon2id = 2.
 *
 * La valeur est écrite littéralement plutôt qu'importée de `Algorithm` :
 * @node-rs/argon2 l'expose comme `const enum` ambiant, inaccessible sous
 * `verbatimModuleSyntax`. Un test vérifie que le hachage produit porte bien
 * le préfixe `$argon2id$`.
 */
const ARGON2ID = 2;

const ARGON2_OPTIONS = {
  algorithm: ARGON2ID,
  memoryCost: 19_456, // 19 Mio
  timeCost: 2,
  parallelism: 1,
} as const;

export async function hashPassword(plain: string): Promise<string> {
  return argon2Hash(plain, ARGON2_OPTIONS);
}

/**
 * Vérifie un mot de passe. Ne lève jamais : un hachage corrompu ou d'un format
 * inconnu renvoie `false`, il ne fait pas planter la route de connexion.
 */
export async function verifyPassword(hash: string, plain: string): Promise<boolean> {
  try {
    return await argon2Verify(hash, plain);
  } catch {
    return false;
  }
}

/**
 * Consomme le même temps qu'une vérification réelle, sur un compte inexistant.
 *
 * Sans cela, la différence de temps de réponse entre « utilisateur inconnu » et
 * « mot de passe faux » permet d'énumérer les comptes existants.
 */
const DUMMY_HASH =
  '$argon2id$v=19$m=19456,t=2,p=1$c2FsdHNhbHRzYWx0c2FsdA$8Zj0Yy2hZ9EYQ0T6vD9v3zZ8YsY0hZQ8YsY0hZQ8Ys0';

export async function fakePasswordVerification(): Promise<void> {
  await verifyPassword(DUMMY_HASH, 'mot-de-passe-inexistant');
}

/* -------------------------------------------------------------------------- */
/* Jetons opaques — refresh tokens, tokens d'invitation                        */
/* -------------------------------------------------------------------------- */

/**
 * Jeton aléatoire de 256 bits, encodé en base64url.
 *
 * Utilisé pour les refresh tokens (ADR-010) et, en Phase 04, pour les tokens
 * d'association parent-élève (§12).
 */
export function generateOpaqueToken(bytes = 32): string {
  return randomBytes(bytes).toString('base64url');
}

/**
 * Empreinte d'un jeton, pour stockage en base.
 *
 * SHA-256 suffit ici, contrairement aux mots de passe : le jeton fait 256 bits
 * d'entropie, il n'est pas attaquable par dictionnaire. Un hachage lent ne
 * ferait que ralentir chaque rafraîchissement sans rien apporter.
 */
export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/** Comparaison à temps constant de deux empreintes. */
export function safeCompare(a: string, b: string): boolean {
  const bufferA = Buffer.from(a, 'utf8');
  const bufferB = Buffer.from(b, 'utf8');
  if (bufferA.length !== bufferB.length) return false;
  return timingSafeEqual(bufferA, bufferB);
}

/* -------------------------------------------------------------------------- */
/* Codes OTP                                                                   */
/* -------------------------------------------------------------------------- */

export const OTP_LENGTH = 6;

/**
 * Code à 6 chiffres, tiré cryptographiquement.
 *
 * `randomInt` est indispensable : `Math.random()` est prédictible et rendrait
 * les codes devinables.
 */
export function generateOtpCode(): string {
  const max = 10 ** OTP_LENGTH;
  return randomInt(0, max).toString().padStart(OTP_LENGTH, '0');
}

/**
 * Empreinte d'un code OTP, salée par le numéro et l'usage.
 *
 * Le sel est essentiel : un code à 6 chiffres n'a qu'un million de valeurs
 * possibles. Un SHA-256 non salé serait cassé par table arc-en-ciel en une
 * fraction de seconde, ce qui rendrait le stockage haché inutile.
 */
export function hashOtpCode(code: string, phone: string, purpose: string): string {
  return createHash('sha256').update(`${purpose}:${phone}:${code}`).digest('hex');
}

export function verifyOtpCode(
  storedHash: string,
  code: string,
  phone: string,
  purpose: string,
): boolean {
  return safeCompare(storedHash, hashOtpCode(code, phone, purpose));
}

/* -------------------------------------------------------------------------- */
/* Codes courts lisibles — invitations (Phase 04)                              */
/* -------------------------------------------------------------------------- */

/**
 * Alphabet sans ambiguïté visuelle.
 *
 * Ni 0/O, ni 1/I/L : ces codes sont imprimés sur une fiche papier et recopiés
 * à la main par un parent, souvent sur un petit écran (§11).
 */
const UNAMBIGUOUS_ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';

/** Génère un code de la forme `8F7K-PQ4M`. */
export function generateShortCode(groups = 2, groupSize = 4): string {
  const parts: string[] = [];
  for (let g = 0; g < groups; g += 1) {
    let part = '';
    for (let i = 0; i < groupSize; i += 1) {
      part += UNAMBIGUOUS_ALPHABET[randomInt(0, UNAMBIGUOUS_ALPHABET.length)];
    }
    parts.push(part);
  }
  return parts.join('-');
}
