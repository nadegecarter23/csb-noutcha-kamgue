import { amount, MoneyError, type Amount } from './amount.js';

/**
 * Répartition d'un montant selon des poids, SANS PERTE.
 *
 * C'est la fonction la plus délicate du domaine financier
 * (docs/04-REGLES-METIER-FINANCIERES.md §1). Elle sert :
 *   · au prorata d'une remise sur les tranches d'un frais (Phase 06)
 *   · à la ventilation d'un paiement (Phase 07)
 *
 * Garantie absolue : `sum(distribute(total, poids)) === total`, toujours.
 * Un franc perdu ou créé à cette étape rend la réconciliation nocturne fausse
 * et le solde de l'élève incontestable — dans le mauvais sens.
 *
 * Méthode : **plus forts restes** (Hamilton). Chaque part reçoit d'abord sa
 * valeur entière par défaut, puis les francs restants sont attribués aux parts
 * dont la fraction perdue était la plus grande. À égalité, l'indice le plus
 * petit l'emporte, ce qui rend le résultat déterministe et reproductible.
 *
 * Pourquoi pas « tout le reliquat sur la dernière part » : sur trois tranches
 * égales, cette méthode déséquilibrerait systématiquement la dernière, et le
 * parent verrait une tranche 3 plus chère sans explication. Les plus forts
 * restes répartissent l'écart au plus près de la proportion réelle.
 *
 * @example
 * distribute(100_000, [3, 2])          // [60_000, 40_000]
 * distribute(100_000, [1, 1, 1])       // [33_334, 33_333, 33_333]
 * distribute(155_000, [75_000, 60_000, 40_000]) // [66_429, 53_143, 35_428]
 */
export function distribute(total: Amount, weights: readonly number[]): Amount[] {
  if (weights.length === 0) {
    if (total !== 0) {
      throw new MoneyError(`Impossible de répartir ${total} FCFA : aucune part fournie.`);
    }
    return [];
  }

  for (const [index, weight] of weights.entries()) {
    if (!Number.isFinite(weight) || weight < 0) {
      throw new MoneyError(
        `Poids invalide à l'indice ${index} : ${weight} (attendu un nombre positif ou nul).`,
      );
    }
  }

  const totalWeight = weights.reduce((acc, w) => acc + w, 0);

  if (totalWeight === 0) {
    if (total !== 0) {
      throw new MoneyError(`Impossible de répartir ${total} FCFA : la somme des poids est nulle.`);
    }
    return weights.map(() => amount(0));
  }

  // Le signe est traité à part : une contrepassation répartit un montant
  // négatif, et l'arrondi doit rester symétrique de celui du paiement d'origine.
  const sign = total < 0 ? -1 : 1;
  const absoluteTotal = BigInt(Math.abs(total));
  const weightSum = BigInt(Math.round(totalWeight * 1e6));

  interface Share {
    index: number;
    base: bigint;
    remainder: bigint;
  }

  const shares: Share[] = weights.map((weight, index) => {
    // BigInt sur la multiplication : total peut atteindre 1e12 et les poids
    // sont eux-mêmes des montants. Le produit dépasse Number.MAX_SAFE_INTEGER.
    const scaledWeight = BigInt(Math.round(weight * 1e6));
    const product = absoluteTotal * scaledWeight;
    return {
      index,
      base: product / weightSum,
      remainder: product % weightSum,
    };
  });

  const distributed = shares.reduce((acc, share) => acc + share.base, 0n);
  let leftover = absoluteTotal - distributed;

  // Les plus forts restes d'abord ; à égalité, l'indice le plus petit.
  const byRemainder = [...shares].sort((a, b) => {
    if (a.remainder === b.remainder) return a.index - b.index;
    return a.remainder > b.remainder ? -1 : 1;
  });

  const result = shares.map((share) => share.base);
  for (const share of byRemainder) {
    if (leftover <= 0n) break;
    result[share.index] = (result[share.index] ?? 0n) + 1n;
    leftover -= 1n;
  }

  return result.map((value) => amount(sign * Number(value)));
}

/**
 * Répartit un montant en `parts` parts aussi égales que possible.
 *
 * Utilisé par l'assistant « diviser en N tranches égales » de l'écran C03
 * (Phase 06). Les francs excédentaires vont aux premières tranches.
 *
 * @example splitEvenly(100_000, 3) // [33_334, 33_333, 33_333]
 */
export function splitEvenly(total: Amount, parts: number): Amount[] {
  if (!Number.isInteger(parts) || parts <= 0) {
    throw new MoneyError(`Nombre de parts invalide : ${parts} (attendu un entier positif).`);
  }
  return distribute(total, new Array<number>(parts).fill(1));
}
