import { describe, it, expect } from 'vitest';
import {
  amount,
  add,
  sub,
  sum,
  percentOf,
  multiply,
  negate,
  clampToZero,
  isValidAmount,
  MoneyError,
  MAX_AMOUNT,
} from './amount.js';

describe('amount', () => {
  it('accepte un entier', () => {
    expect(amount(75_000)).toBe(75_000);
    expect(amount(0)).toBe(0);
    expect(amount(-50_000)).toBe(-50_000);
  });

  it('REFUSE un décimal — le franc CFA n’a pas de sous-unité (ADR-012)', () => {
    expect(() => amount(75_000.5)).toThrow(/pas de sous-unité/);
  });

  it('refuse NaN et Infinity', () => {
    expect(() => amount(Number.NaN)).toThrow(MoneyError);
    expect(() => amount(Number.POSITIVE_INFINITY)).toThrow(MoneyError);
  });

  it('refuse un montant hors limites', () => {
    expect(() => amount(MAX_AMOUNT + 1)).toThrow(/hors limites/);
  });

  it('isValidAmount ne lève jamais', () => {
    expect(isValidAmount(75_000)).toBe(true);
    expect(isValidAmount(75_000.5)).toBe(false);
    expect(isValidAmount('75000')).toBe(false);
    expect(isValidAmount(null)).toBe(false);
  });
});

describe('opérations', () => {
  it('additionne et soustrait', () => {
    expect(add(amount(25_000), amount(50_000))).toBe(75_000);
    expect(sub(amount(200_000), amount(125_000))).toBe(75_000);
  });

  it('somme une liste', () => {
    expect(sum([amount(25_000), amount(75_000), amount(10_000)])).toBe(110_000);
    expect(sum([])).toBe(0);
  });

  it('détecte un dépassement de la limite à l’addition', () => {
    expect(() => add(amount(MAX_AMOUNT), amount(1))).toThrow(/hors limites/);
  });

  it('negate produit l’opposé — base de la contrepassation', () => {
    expect(negate(amount(50_000))).toBe(-50_000);
    expect(negate(amount(-50_000))).toBe(50_000);
  });

  it('clampToZero ramène le négatif à zéro', () => {
    expect(clampToZero(amount(-5_000))).toBe(0);
    expect(clampToZero(amount(5_000))).toBe(5_000);
  });

  it('multiply arrondit au franc inférieur', () => {
    expect(multiply(amount(175_000), 0.5)).toBe(87_500);
    expect(multiply(amount(175_001), 0.5)).toBe(87_500); // 87500.5 → 87500
  });
});

describe('percentOf', () => {
  it('calcule un pourcentage exact', () => {
    expect(percentOf(amount(200_000), 10)).toBe(20_000);
    expect(percentOf(amount(175_000), 7.5)).toBe(13_125);
  });

  it('arrondit TOUJOURS au franc inférieur, en faveur du payeur', () => {
    // 175 001 × 7,5 % = 13 125,075 → 13 125
    expect(percentOf(amount(175_001), 7.5)).toBe(13_125);
    // 100 × 33,333 % = 33,333 → 33
    expect(percentOf(amount(100), 33.333)).toBe(33);
  });

  it('gère les bornes', () => {
    expect(percentOf(amount(200_000), 0)).toBe(0);
    expect(percentOf(amount(200_000), 100)).toBe(200_000);
  });

  it('refuse un pourcentage hors de [0, 100]', () => {
    expect(() => percentOf(amount(1_000), -1)).toThrow(/hors bornes/);
    expect(() => percentOf(amount(1_000), 101)).toThrow(/hors bornes/);
  });
});
