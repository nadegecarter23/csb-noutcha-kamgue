import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AuditAction, diffValues } from '../platform/audit.js';
import { assertFileSignature, assertProofFile } from '../platform/file-validation.js';
import { closeTestDatabase, resetTestData, testDatabase } from './helpers/test-app.js';

const db = testDatabase();

beforeAll(() => resetTestData(db));
afterAll(() => closeTestDatabase());

describe('phase 16 — sécurité et audit', () => {
  it('expurge récursivement les secrets du journal et ne garde que les différences', () => {
    const result = diffValues(
      { status: 'PENDING', nested: { token: 'ancien', safe: 'ok' }, amount: 10n },
      { status: 'SUCCESS', nested: { token: 'nouveau', safe: 'ok' }, amount: 10n },
    );
    expect(result).toEqual({
      oldValues: { status: 'PENDING' },
      newValues: { status: 'SUCCESS' },
    });
  });

  it('maintient un catalogue d’actions sans doublon incluant la purge', () => {
    const actions = Object.values(AuditAction);
    expect(new Set(actions).size).toBe(actions.length);
    expect(actions).toContain('security.retention_purge');
  });

  it('valide le contenu réel des justificatifs et classeurs', () => {
    expect(() => assertProofFile(Buffer.from('%PDF-1.7'), 'application/pdf')).not.toThrow();
    expect(() => assertProofFile(Buffer.from('faux jpeg'), 'image/jpeg')).toThrow(/contenu/i);
    expect(() => assertProofFile(Buffer.from('%PDF-1.7'), 'text/html')).toThrow(/format/i);
    expect(() =>
      assertFileSignature(
        Buffer.from([0x50, 0x4b, 0x03, 0x04]),
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      ),
    ).not.toThrow();
  });

  it('interdit en base la modification d’un montant réussi mais autorise son extourne', async () => {
    const school = await db.school.create({
      data: { code: `SEC-${Date.now()}`, name: 'École sécurité' },
    });
    const payment = await db.payment.create({
      data: {
        schoolId: school.id,
        reference: `SEC-PAY-${Date.now()}`,
        amount: 50_000,
        paymentMethod: 'CASH',
        channel: 'BACKOFFICE',
        status: 'SUCCESS',
        paidAt: new Date(),
      },
    });
    await expect(
      db.payment.update({ where: { id: payment.id }, data: { amount: 40_000 } }),
    ).rejects.toThrow(/immutable/i);
    await expect(
      db.payment.update({
        where: { id: payment.id },
        data: { status: 'REVERSED', statusReason: 'Test de sécurité' },
      }),
    ).resolves.toMatchObject({ status: 'REVERSED', amount: 50_000n });
  });
});
