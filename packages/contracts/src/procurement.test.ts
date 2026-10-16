import { describe, expect, it } from 'vitest';
import {
  createExpenseBodySchema,
  createPurchaseOrderBodySchema,
  createSupplierBodySchema,
  payExpenseBodySchema,
  workflowDecisionBodySchema,
} from './procurement.js';

const id = '01990000-0000-7000-8000-000000000001';
describe('contrats achats et dépenses', () => {
  it('normalise le code fournisseur', () => {
    expect(
      createSupplierBodySchema.parse({ code: ' papcam ', name: 'Papeterie Cameroun' }).code,
    ).toBe('PAPCAM');
  });
  it('refuse une échéance antérieure à la facture', () => {
    expect(
      createExpenseBodySchema.safeParse({
        supplierId: id,
        categoryId: id,
        invoiceDate: '2026-10-10',
        dueDate: '2026-10-01',
        description: 'Fournitures',
        amount: 5000,
      }).success,
    ).toBe(false);
  });
  it('impose au moins une ligne sur le bon d’achat', () => {
    expect(createPurchaseOrderBodySchema.safeParse({ supplierId: id, lines: [] }).success).toBe(
      false,
    );
  });
  it('exige un motif de rejet', () => {
    expect(workflowDecisionBodySchema.safeParse({ decision: 'REJECT' }).success).toBe(false);
    expect(
      workflowDecisionBodySchema.safeParse({ decision: 'REJECT', reason: 'Budget insuffisant' })
        .success,
    ).toBe(true);
  });
  it('accepte un paiement mobile documenté', () => {
    expect(
      payExpenseBodySchema.safeParse({
        amount: 25000,
        method: 'MOBILE_MONEY',
        externalReference: 'MOMO-123',
        paidAt: '2026-10-03T08:00:00.000Z',
      }).success,
    ).toBe(true);
  });
});
