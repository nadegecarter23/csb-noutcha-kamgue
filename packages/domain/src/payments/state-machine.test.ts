import { describe, expect, it } from 'vitest';
import {
  assertPaymentTransition,
  canTransitionPayment,
  type PaymentState,
} from './state-machine.js';

describe('machine à états des paiements', () => {
  it('accepte uniquement la matrice métier', () => {
    expect(canTransitionPayment('PENDING', 'SUCCESS')).toBe(true);
    expect(canTransitionPayment('PROCESSING', 'FAILED')).toBe(true);
    expect(canTransitionPayment('PROCESSING', 'PENDING_INVESTIGATION')).toBe(true);
    expect(canTransitionPayment('PENDING_INVESTIGATION', 'SUCCESS')).toBe(true);
    expect(canTransitionPayment('FAILED', 'SUCCESS')).toBe(false);
    expect(() => assertPaymentTransition('FAILED', 'SUCCESS')).toThrow(/interdite/);
  });
  it('rend les états terminaux immuables', () => {
    for (const state of [
      'FAILED',
      'REJECTED',
      'CANCELLED',
      'REVERSED',
      'REFUNDED',
    ] as PaymentState[])
      expect(canTransitionPayment(state, 'SUCCESS')).toBe(false);
  });
});
