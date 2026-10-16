import type { Amount } from './amount.js';

/**
 * Formatage des montants — présentation UNIQUEMENT.
 *
 * Règle (docs/06-CONVENTIONS-DEV.md §2) : les montants circulent en entiers
 * dans les API et la base. Le formatage n'intervient qu'au dernier moment,
 * à l'affichage ou à l'impression, et passe toujours par ces fonctions.
 *
 * L'espace utilisé comme séparateur de milliers est une ESPACE INSÉCABLE
 * ÉTROITE (U+202F) : « 75 000 FCFA » ne doit jamais se couper en fin de ligne
 * sur un reçu.
 */

const NARROW_NO_BREAK_SPACE = ' ';

/** `75000` → `« 75 000 »` (sans devise). */
export function formatNumber(value: Amount | number): string {
  const sign = value < 0 ? '-' : '';
  const digits = Math.abs(value).toString();
  const grouped = digits.replace(/\B(?=(\d{3})+(?!\d))/g, NARROW_NO_BREAK_SPACE);
  return `${sign}${grouped}`;
}

/** `75000` → `« 75 000 FCFA »`. */
export function formatAmount(value: Amount | number, currency = 'FCFA'): string {
  return `${formatNumber(value)}${NARROW_NO_BREAK_SPACE}${currency}`;
}

/* -------------------------------------------------------------------------- */
/* Montant en toutes lettres — obligatoire sur les reçus (§28)                */
/* -------------------------------------------------------------------------- */

const UNITS = [
  '',
  'un',
  'deux',
  'trois',
  'quatre',
  'cinq',
  'six',
  'sept',
  'huit',
  'neuf',
  'dix',
  'onze',
  'douze',
  'treize',
  'quatorze',
  'quinze',
  'seize',
  'dix-sept',
  'dix-huit',
  'dix-neuf',
];

const TENS = [
  '',
  '',
  'vingt',
  'trente',
  'quarante',
  'cinquante',
  'soixante',
  'soixante',
  'quatre-vingt',
  'quatre-vingt',
];

function belowHundred(n: number): string {
  if (n < 20) return UNITS[n] ?? '';

  const tens = Math.floor(n / 10);
  const units = n % 10;

  // 70-79 et 90-99 : « soixante-dix », « quatre-vingt-dix »
  if (tens === 7 || tens === 9) {
    const base = TENS[tens] ?? '';
    const rest = UNITS[10 + units] ?? '';
    return units === 1 && tens === 7 ? `${base} et onze` : `${base}-${rest}`;
  }

  const base = TENS[tens] ?? '';
  if (units === 0) {
    // « quatre-vingts » prend un s quand il n'est suivi de rien
    return tens === 8 ? `${base}s` : base;
  }
  // « vingt et un », « trente et un »… mais pas « quatre-vingt et un »
  if (units === 1 && tens < 8) return `${base} et un`;
  return `${base}-${UNITS[units]}`;
}

function belowThousand(n: number): string {
  if (n < 100) return belowHundred(n);

  const hundreds = Math.floor(n / 100);
  const rest = n % 100;
  // « cent », « deux cents », « deux cent cinquante »
  const prefix = hundreds === 1 ? 'cent' : `${UNITS[hundreds]} cent${rest === 0 ? 's' : ''}`;
  return rest === 0 ? prefix : `${prefix} ${belowHundred(rest)}`;
}

/**
 * `50000` → `« cinquante mille »`.
 *
 * Orthographe française des nombres, y compris les accords de « cent » et
 * « quatre-vingts ». « mille » est invariable.
 */
export function amountToWords(value: Amount | number): string {
  const n = Math.abs(Math.trunc(value));
  if (n === 0) return 'zéro';

  const parts: string[] = [];
  const billions = Math.floor(n / 1_000_000_000);
  const millions = Math.floor((n % 1_000_000_000) / 1_000_000);
  const thousands = Math.floor((n % 1_000_000) / 1_000);
  const remainder = n % 1_000;

  if (billions > 0) {
    parts.push(`${belowThousand(billions)} milliard${billions > 1 ? 's' : ''}`);
  }
  if (millions > 0) {
    parts.push(`${belowThousand(millions)} million${millions > 1 ? 's' : ''}`);
  }
  if (thousands > 0) {
    // « mille » et non « un mille » ; invariable au pluriel
    parts.push(thousands === 1 ? 'mille' : `${belowThousand(thousands)} mille`);
  }
  if (remainder > 0) {
    parts.push(belowThousand(remainder));
  }

  const words = parts.join(' ');
  return value < 0 ? `moins ${words}` : words;
}

/** Version prête à imprimer sur un reçu : « Cinquante mille francs CFA ». */
export function amountToWordsWithCurrency(value: Amount | number): string {
  const words = amountToWords(value);
  const capitalised = words.charAt(0).toUpperCase() + words.slice(1);
  return `${capitalised} francs CFA`;
}
