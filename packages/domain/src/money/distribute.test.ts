import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { amount, sum, MoneyError } from './amount.js';
import { distribute, splitEvenly } from './distribute.js';

describe('distribute', () => {
  it('répartit exactement quand la division tombe juste', () => {
    expect(distribute(amount(100_000), [3, 2])).toEqual([60_000, 40_000]);
  });

  it('attribue le reliquat aux plus forts restes, indice le plus petit à égalité', () => {
    expect(distribute(amount(100_000), [1, 1, 1])).toEqual([33_334, 33_333, 33_333]);
  });

  it('reproduit le prorata de remise du cahier (155 000 sur trois tranches)', () => {
    // Pension 175 000 réduite à 155 000 par une remise de 20 000.
    // Tranches d'origine : 75 000 / 60 000 / 40 000.
    // Attendu : docs/04-REGLES-METIER-FINANCIERES.md §2.3
    const result = distribute(amount(155_000), [75_000, 60_000, 40_000]);
    expect(result).toEqual([66_429, 53_143, 35_428]);
    expect(sum(result)).toBe(155_000);
  });

  it('gère une part unique', () => {
    expect(distribute(amount(75_000), [1])).toEqual([75_000]);
  });

  it('accepte des poids nuls sans leur attribuer quoi que ce soit', () => {
    expect(distribute(amount(100_000), [1, 0, 1])).toEqual([50_000, 0, 50_000]);
  });

  it('répartit un montant nul sans erreur', () => {
    expect(distribute(amount(0), [3, 2, 1])).toEqual([0, 0, 0]);
  });

  it('répartit un montant négatif — cas de la contrepassation', () => {
    const result = distribute(amount(-100_000), [3, 2]);
    expect(result).toEqual([-60_000, -40_000]);
    expect(sum(result)).toBe(-100_000);
  });

  it('renvoie une liste vide pour aucune part et un total nul', () => {
    expect(distribute(amount(0), [])).toEqual([]);
  });

  it('refuse de répartir un montant non nul sur aucune part', () => {
    expect(() => distribute(amount(1_000), [])).toThrow(MoneyError);
  });

  it('refuse de répartir un montant non nul sur des poids tous nuls', () => {
    expect(() => distribute(amount(1_000), [0, 0])).toThrow(MoneyError);
  });

  it('refuse un poids négatif', () => {
    expect(() => distribute(amount(1_000), [1, -1])).toThrow(/indice 1/);
  });

  it('reste exact sur de très gros montants (pas de perte de précision)', () => {
    const total = amount(999_999_999_999);
    const result = distribute(total, [7, 11, 13]);
    expect(sum(result)).toBe(total);
  });

  it('est déterministe : deux appels identiques donnent le même résultat', () => {
    const a = distribute(amount(123_457), [5, 3, 2, 7]);
    const b = distribute(amount(123_457), [5, 3, 2, 7]);
    expect(a).toEqual(b);
  });
});

/**
 * Test de propriété exigé par la Definition of Done
 * (docs/04-REGLES-METIER-FINANCIERES.md §1).
 *
 * Aucun franc ne doit jamais être créé ni perdu, quelles que soient les
 * entrées. C'est l'invariant dont dépendent la réconciliation nocturne et la
 * règle 8 du §81 du cahier.
 */
describe('distribute — invariants (10 000 tirages)', () => {
  it('la somme des parts est TOUJOURS exactement égale au total', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 500_000_000 }),
        fc.array(fc.integer({ min: 0, max: 1_000_000 }), { minLength: 1, maxLength: 12 }),
        (total, weights) => {
          if (weights.every((w) => w === 0) && total !== 0) return true; // cas d'erreur testé ailleurs
          const parts = distribute(amount(total), weights);
          return parts.reduce<number>((acc, v) => acc + v, 0) === total;
        },
      ),
      { numRuns: 10_000 },
    );
  });

  it('aucune part n’est négative quand le total est positif', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 100_000_000 }),
        fc.array(fc.integer({ min: 1, max: 100_000 }), { minLength: 1, maxLength: 10 }),
        (total, weights) => distribute(amount(total), weights).every((v) => v >= 0),
      ),
      { numRuns: 2_000 },
    );
  });

  it('deux parts de même poids ne diffèrent jamais de plus d’un franc', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 10_000_000 }),
        fc.integer({ min: 2, max: 10 }),
        (total, parts) => {
          const result = splitEvenly(amount(total), parts);
          return Math.max(...result) - Math.min(...result) <= 1;
        },
      ),
      { numRuns: 2_000 },
    );
  });
});

describe('splitEvenly', () => {
  it('divise en parts égales quand c’est possible', () => {
    expect(splitEvenly(amount(150_000), 3)).toEqual([50_000, 50_000, 50_000]);
  });

  it('place les francs excédentaires sur les premières parts', () => {
    expect(splitEvenly(amount(100_000), 3)).toEqual([33_334, 33_333, 33_333]);
  });

  it('refuse un nombre de parts invalide', () => {
    expect(() => splitEvenly(amount(1_000), 0)).toThrow(MoneyError);
    expect(() => splitEvenly(amount(1_000), 2.5)).toThrow(MoneyError);
  });
});
