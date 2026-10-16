export type PaymentState =
  | 'PENDING'
  | 'PROCESSING'
  | 'PENDING_INVESTIGATION'
  | 'AWAITING_VALIDATION'
  | 'CORRECTION_REQUESTED'
  | 'SUCCESS'
  | 'FAILED'
  | 'REJECTED'
  | 'CANCELLED'
  | 'REVERSED'
  | 'REFUNDED';

const transitions: Record<PaymentState, readonly PaymentState[]> = {
  PENDING: ['PROCESSING', 'AWAITING_VALIDATION', 'SUCCESS', 'CANCELLED'],
  PROCESSING: ['SUCCESS', 'FAILED', 'PENDING_INVESTIGATION', 'CANCELLED'],
  PENDING_INVESTIGATION: ['SUCCESS', 'FAILED'],
  AWAITING_VALIDATION: ['SUCCESS', 'REJECTED', 'CORRECTION_REQUESTED', 'CANCELLED'],
  CORRECTION_REQUESTED: ['SUCCESS', 'REJECTED', 'AWAITING_VALIDATION', 'CANCELLED'],
  SUCCESS: ['REVERSED', 'REFUNDED'],
  FAILED: [],
  REJECTED: [],
  CANCELLED: [],
  REVERSED: [],
  REFUNDED: [],
};

export function canTransitionPayment(from: PaymentState, to: PaymentState): boolean {
  return transitions[from].includes(to);
}

export function assertPaymentTransition(from: PaymentState, to: PaymentState): void {
  if (!canTransitionPayment(from, to))
    throw new Error(`Transition de paiement interdite : ${from} → ${to}.`);
}
