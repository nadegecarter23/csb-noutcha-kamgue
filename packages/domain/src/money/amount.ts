/**
 * Arithmétique monétaire CSB Noutcha KAMGUE (ADR-012).
 *
 * Le franc CFA (XAF) n'a PAS de sous-unité. Tous les montants sont donc des
 * entiers de francs. Aucun flottant n'intervient dans un calcul financier :
 * `0.1 + 0.2 !== 0.3` suffit à produire un solde faux, et un solde faux dans
 * un logiciel de scolarité, c'est un parent qui conteste au guichet.
 *
 * Le type `Amount` est nominal (branded) : il empêche de passer un nombre
 * quelconque là où un montant est attendu, et force à passer par `amount()`
 * qui valide.
 *
 * Référence : docs/04-REGLES-METIER-FINANCIERES.md §1
 */

declare const brand: unique symbol;

/** Montant en francs CFA. Toujours un entier. */
export type Amount = number & { readonly [brand]: 'XAF' };

/**
 * Limite haute de sécurité : 1 000 milliards de FCFA.
 *
 * Bien en deçà de Number.MAX_SAFE_INTEGER, mais très au-dessus de tout montant
 * scolaire plausible. Un dépassement signale une erreur de saisie ou de calcul,
 * jamais une opération légitime — on préfère échouer que propager.
 */
export const MAX_AMOUNT = 1_000_000_000_000;

export class MoneyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MoneyError';
  }
}

/** Construit un montant validé. Point d'entrée unique. */
export function amount(value: number): Amount {
  if (!Number.isFinite(value)) {
    throw new MoneyError(`Montant non fini : ${value}`);
  }
  if (!Number.isInteger(value)) {
    throw new MoneyError(`Le franc CFA n'a pas de sous-unité : ${value} n'est pas un entier.`);
  }
  if (Math.abs(value) > MAX_AMOUNT) {
    throw new MoneyError(`Montant hors limites : ${value} (maximum ${MAX_AMOUNT}).`);
  }
  return value as Amount;
}

/** Montant nul. */
export const ZERO: Amount = 0 as Amount;

/** Vrai si la valeur est un montant valide, sans lever d'erreur. */
export function isValidAmount(value: unknown): value is Amount {
  return (
    typeof value === 'number' &&
    Number.isInteger(value) &&
    Number.isFinite(value) &&
    Math.abs(value) <= MAX_AMOUNT
  );
}

/* -------------------------------------------------------------------------- */
/* Opérations                                                                  */
/* -------------------------------------------------------------------------- */

export function add(a: Amount, b: Amount): Amount {
  return amount(a + b);
}

export function sub(a: Amount, b: Amount): Amount {
  return amount(a - b);
}

export function sum(values: readonly Amount[]): Amount {
  let total = 0;
  for (const value of values) total += value;
  return amount(total);
}

export function multiply(value: Amount, factor: number): Amount {
  if (!Number.isFinite(factor)) {
    throw new MoneyError(`Facteur non fini : ${factor}`);
  }
  return amount(Math.floor(value * factor));
}

/**
 * Pourcentage d'un montant, arrondi au franc INFÉRIEUR.
 *
 * L'arrondi se fait toujours en faveur du payeur : une remise de 7,5 % sur
 * 175 000 donne 13 125 exactement, mais sur 175 001 elle donnera 13 125 et non
 * 13 126. Le sens de l'arrondi est une décision métier, pas un détail
 * d'implémentation — il est ici, à un seul endroit, pour ne jamais varier.
 */
export function percentOf(value: Amount, percentage: number): Amount {
  if (!Number.isFinite(percentage)) {
    throw new MoneyError(`Pourcentage non fini : ${percentage}`);
  }
  if (percentage < 0 || percentage > 100) {
    throw new MoneyError(`Pourcentage hors bornes : ${percentage} (attendu entre 0 et 100).`);
  }
  return amount(Math.floor((value * percentage) / 100));
}

/** Le plus petit des deux. */
export function min(a: Amount, b: Amount): Amount {
  return (a < b ? a : b) as Amount;
}

/** Le plus grand des deux. */
export function max(a: Amount, b: Amount): Amount {
  return (a > b ? a : b) as Amount;
}

/** Ramène un montant négatif à zéro. */
export function clampToZero(value: Amount): Amount {
  return (value < 0 ? 0 : value) as Amount;
}

export function isZero(value: Amount): boolean {
  return value === 0;
}

export function isPositive(value: Amount): boolean {
  return value > 0;
}

export function isNegative(value: Amount): boolean {
  return value < 0;
}

/** Valeur absolue. Utile pour présenter une contrepassation. */
export function abs(value: Amount): Amount {
  return Math.abs(value) as Amount;
}

/** Opposé — sert à construire une contrepassation (docs/04 §6). */
export function negate(value: Amount): Amount {
  return amount(-value);
}
