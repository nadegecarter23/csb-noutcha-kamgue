import { describe, expect, it } from 'vitest';
import {
  computeAllocations,
  validateManualAllocations,
  type AllocationTarget,
} from './allocation.js';

const target = (overrides: Partial<AllocationTarget> = {}): AllocationTarget => ({
  assignmentId: 'pension',
  installmentId: null,
  remainingAmount: 175000n,
  priority: 20,
  dueDate: '2026-09-30',
  name: 'Pension',
  allowPartialPayment: true,
  enforceInstallmentOrder: false,
  ...overrides,
});

describe("moteur d'allocation", () => {
  it('répartit 100 000 en 25 000 puis 75 000', () => {
    const result = computeAllocations(100000n, [
      target(),
      target({
        assignmentId: 'inscription',
        remainingAmount: 25000n,
        priority: 10,
        name: 'Inscription',
      }),
    ]);
    expect(result.allocations.map((item) => item.amount)).toEqual([25000n, 75000n]);
    expect(result.unallocatedAmount).toBe(0n);
  });
  it('conserve un surpaiement en avance', () =>
    expect(
      computeAllocations(200000n, [target({ remainingAmount: 100000n })]).unallocatedAmount,
    ).toBe(100000n));
  it('saute un frais indivisible insuffisamment couvert', () =>
    expect(
      computeAllocations(10000n, [target({ allowPartialPayment: false })]).allocations,
    ).toHaveLength(0));
  it('respecte l’ordre strict des tranches', () =>
    expect(
      computeAllocations(60000n, [
        target({ installmentId: 't2', priorInstallmentOpen: true, enforceInstallmentOrder: true }),
      ]).allocations,
    ).toHaveLength(0));
  it('exclut un frais non ouvert', () =>
    expect(
      computeAllocations(10000n, [target({ opensAt: '2099-01-01' })]).allocations,
    ).toHaveLength(0));
  it('départage de façon déterministe', () =>
    expect(
      computeAllocations(1n, [
        target({ assignmentId: 'b', name: 'B' }),
        target({ assignmentId: 'a', name: 'A' }),
      ]).allocations[0]?.assignmentId,
    ).toBe('a'));
  it('refuse une allocation dirigée excessive ou étrangère', () => {
    expect(() =>
      validateManualAllocations(
        10n,
        [{ assignmentId: 'pension', installmentId: null, amount: 11n }],
        [target({ remainingAmount: 10n })],
      ),
    ).toThrow();
    expect(() =>
      validateManualAllocations(
        10n,
        [{ assignmentId: 'x', installmentId: null, amount: 1n }],
        [target()],
      ),
    ).toThrow();
  });
});
