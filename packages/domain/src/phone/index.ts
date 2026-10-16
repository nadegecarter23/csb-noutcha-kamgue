import { parsePhoneNumberFromString, type CountryCode } from 'libphonenumber-js';

/**
 * Normalisation des numéros de téléphone.
 *
 * C'est le point le plus critique du produit après le calcul du solde
 * (docs/phases/PHASE-01-identite-roles-acces.md §10). Le numéro est la clé de
 * la détection automatique des enfants (§8 du cahier) : si `699123456` saisi
 * par la scolarité et `+237 699 12 34 56` saisi par le parent ne produisent
 * pas la MÊME chaîne, le parent ne retrouve pas ses enfants et la
 * fonctionnalité phare de CSB Noutcha KAMGUE ne fonctionne pas.
 *
 * Toute entrée passe par ici, sans exception. Le format canonique est E.164.
 */

export const DEFAULT_COUNTRY: CountryCode = 'CM';

export class PhoneError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PhoneError';
  }
}

export interface NormalizedPhone {
  /** Format canonique stocké en base : `+237699123456`. */
  e164: string;
  /** Format lisible pour l'affichage : `+237 6 99 12 34 56`. */
  international: string;
  country: CountryCode | undefined;
}

/**
 * Normalise un numéro. Renvoie `null` si le numéro est invalide, plutôt que de
 * lever : l'appelant décide si c'est une erreur de saisie utilisateur (message)
 * ou une ligne d'import à rejeter (rapport).
 */
export function normalizePhone(
  raw: string | null | undefined,
  defaultCountry: CountryCode = DEFAULT_COUNTRY,
): NormalizedPhone | null {
  if (!raw) return null;

  // Les fichiers Excel des établissements contiennent des points, tirets,
  // barres obliques, préfixes 00, parenthèses… On nettoie avant d'analyser.
  const cleaned = raw
    .trim()
    .replace(/[\s.\-/()[\]]/g, '')
    .replace(/^00/, '+');

  if (cleaned.length === 0) return null;

  const parsed = parsePhoneNumberFromString(cleaned, defaultCountry);
  if (!parsed || !parsed.isValid()) return null;

  return {
    e164: parsed.number,
    international: parsed.formatInternational(),
    country: parsed.country,
  };
}

/** Variante stricte, pour le code qui ne peut pas continuer sans numéro valide. */
export function requirePhone(
  raw: string | null | undefined,
  defaultCountry: CountryCode = DEFAULT_COUNTRY,
): NormalizedPhone {
  const normalized = normalizePhone(raw, defaultCountry);
  if (!normalized) {
    throw new PhoneError(`Numéro de téléphone invalide : « ${raw ?? ''} »`);
  }
  return normalized;
}

export function isValidPhone(
  raw: string | null | undefined,
  defaultCountry: CountryCode = DEFAULT_COUNTRY,
): boolean {
  return normalizePhone(raw, defaultCountry) !== null;
}

/**
 * Masque un numéro pour l'affichage partiel : `+237699123456` → `+237•••••3456`.
 *
 * Utilisé côté parent avant acceptation d'une association (§8) et dans les
 * logs (docs/02 §8). Voir aussi `maskPhone` côté API.
 */
export function maskPhone(e164: string): string {
  if (e164.length <= 8) return '•'.repeat(e164.length);
  return `${e164.slice(0, 4)}${'•'.repeat(e164.length - 8)}${e164.slice(-4)}`;
}

/**
 * Détecte l'opérateur camerounais à partir du numéro.
 *
 * Sert à pré-sélectionner MTN MoMo ou Orange Money sur l'écran P10 (Phase 11)
 * et à avertir avant un envoi voué à l'échec.
 *
 * ATTENTION : les plages sont attribuées par l'ART et ÉVOLUENT. Cette fonction
 * donne une SUGGESTION, jamais une certitude — le parent doit toujours pouvoir
 * choisir un autre opérateur. À revalider avec les opérateurs avant la mise en
 * production de la Phase 11.
 */
export type CameroonOperator = 'MTN' | 'ORANGE' | 'CAMTEL' | 'UNKNOWN';

export function guessCameroonOperator(e164: string): CameroonOperator {
  if (!e164.startsWith('+237')) return 'UNKNOWN';

  const national = e164.slice(4);
  if (national.length !== 9) return 'UNKNOWN';

  const prefix3 = national.slice(0, 3);
  const prefix2 = national.slice(0, 2);

  // Plages indicatives — à confirmer auprès des opérateurs (Phase 11).
  if (['650', '651', '652', '653', '654'].includes(prefix3)) return 'MTN';
  if (['655', '656', '657', '658', '659'].includes(prefix3)) return 'ORANGE';
  if (prefix2 === '67' || prefix2 === '68') return 'MTN';
  if (prefix2 === '69') return 'ORANGE';
  if (prefix2 === '62') return 'CAMTEL';

  return 'UNKNOWN';
}
