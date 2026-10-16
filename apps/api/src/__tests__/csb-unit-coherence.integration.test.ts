import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { closeTestDatabase, resetTestData, testDatabase } from './helpers/test-app.js';
import { runWithContext } from '../platform/request-context.js';
import { createAuditService } from '../platform/audit.js';
import type { Storage } from '../platform/storage.js';
import { createProcurementService } from '../modules/procurement/procurement.service.js';
import { createCommunicationsService } from '../modules/communications/communications.service.js';
import { createPortalService } from '../modules/portal/portal.service.js';

/**
 * Cohérence par cycle des achats, dépenses, budgets et annonces.
 *
 * Exécuté avec le rôle applicatif `cplan_app` : la RLS est donc réellement
 * appliquée, comme en production.
 */
const APP_ROLE_URL =
  process.env.DATABASE_TEST_APP_URL ??
  'postgresql://cplan_app:cplan_dev_password@localhost:5442/cplan_test?schema=public';

let owner: PrismaClient;
let appRole: PrismaClient;
let schoolId: string;
let yearId: string;
let primaryUnitId: string;
let secondaryUnitId: string;
let primaryUserId: string;
let globalUserId: string;
let approverUserId: string;
let parentUserId: string;
let supplierId: string;
let categoryId: string;

const storage = {} as Storage;

beforeAll(() => {
  owner = testDatabase();
  appRole = new PrismaClient({ datasources: { db: { url: APP_ROLE_URL } }, log: [] });
});

afterAll(async () => {
  await appRole.$disconnect();
  await closeTestDatabase();
});

beforeEach(async () => {
  await resetTestData(owner);
  schoolId = (await owner.school.create({ data: { code: 'CSB-COH', name: 'CSB Cohérence' } })).id;
  const units = await owner.organizationalUnit.findMany({ where: { schoolId } });
  const primaryUnit = units.find((unit) => unit.code === 'PRIMAIRE');
  const secondaryUnit = units.find((unit) => unit.code === 'SECONDAIRE');
  if (!primaryUnit || !secondaryUnit) throw new Error('Référentiel organisationnel incomplet.');
  primaryUnitId = primaryUnit.id;
  secondaryUnitId = secondaryUnit.id;
  yearId = (
    await owner.academicYear.create({
      data: {
        schoolId,
        name: '2026/2027',
        startDate: new Date('2026-09-01'),
        endDate: new Date('2027-07-31'),
        status: 'ACTIVE',
        isCurrent: true,
      },
    })
  ).id;
  const user = (firstName: string, phone: string) =>
    owner.user.create({ data: { firstName, lastName: 'Test', phone, status: 'ACTIVE' } });
  const [primary, global, approver, parent] = await Promise.all([
    user('Primaire', '+237699320001'),
    user('Économe', '+237699320002'),
    user('Direction', '+237699320003'),
    user('Parent', '+237699320004'),
  ]);
  primaryUserId = primary.id;
  globalUserId = global.id;
  approverUserId = approver.id;
  parentUserId = parent.id;
  await owner.userAccessScope.createMany({
    data: [
      { schoolId, userId: primaryUserId, scopeType: 'UNIT', organizationalUnitId: primaryUnitId },
      { schoolId, userId: globalUserId, scopeType: 'SCHOOL' },
      { schoolId, userId: approverUserId, scopeType: 'SCHOOL' },
    ],
  });
  supplierId = (
    await owner.supplier.create({ data: { schoolId, code: 'F-001', name: 'Papeterie' } })
  ).id;
  categoryId = (
    await owner.expenseCategory.create({
      data: { schoolId, code: 'FOURNITURES', name: 'Fournitures' },
    })
  ).id;
});

const as = <T>(userId: string, work: () => Promise<T>) =>
  runWithContext({ requestId: `test-${userId}`, userId, schoolId }, work);
const procurement = () => createProcurementService(appRole, createAuditService(appRole), storage);
const communications = () => createCommunicationsService(appRole, createAuditService(appRole));

const purchase = (organizationalUnitId: string) => ({
  organizationalUnitId,
  supplierId,
  lines: [{ description: 'Ramettes A4', quantity: 10, unitPrice: 5_000 }],
});
const expense = (organizationalUnitId: string, amount = 50_000) => ({
  organizationalUnitId,
  supplierId,
  categoryId,
  invoiceDate: '2026-10-05',
  dueDate: '2026-11-04',
  description: 'Fournitures de rentrée',
  amount,
});

describe('achats et dépenses par cycle', () => {
  it('limite la création et la lecture au cycle autorisé', async () => {
    const service = procurement();
    await expect(
      as(primaryUserId, () =>
        service.createPurchase(schoolId, primaryUserId, purchase(secondaryUnitId)),
      ),
    ).rejects.toThrow(/périmètre/);
    const order = await as(primaryUserId, () =>
      service.createPurchase(schoolId, primaryUserId, purchase(primaryUnitId)),
    );
    expect(order.organizationalUnitName).toBe('Primaire');
    await as(globalUserId, () =>
      service.createExpense(schoolId, globalUserId, expense(secondaryUnitId)),
    );

    const restricted = await as(primaryUserId, () => service.overview(schoolId));
    expect(restricted.purchaseOrders).toHaveLength(1);
    expect(restricted.expenses).toHaveLength(0);
    expect(restricted.writable).toEqual({
      units: [expect.objectContaining({ id: primaryUnitId })],
      schoolWide: false,
    });

    const global = await as(globalUserId, () => service.overview(schoolId));
    expect(global.purchaseOrders).toHaveLength(1);
    expect(global.expenses).toHaveLength(1);
    expect(global.writable.units).toHaveLength(4);
    expect(global.writable.schoolWide).toBe(true);
  });

  it('impute une facture au cycle de son bon d’achat', async () => {
    const service = procurement();
    const order = await as(globalUserId, () =>
      service.createPurchase(schoolId, globalUserId, purchase(primaryUnitId)),
    );
    await as(globalUserId, () => service.submitPurchase(schoolId, globalUserId, order.id));
    await as(approverUserId, () =>
      service.decidePurchase(schoolId, approverUserId, order.id, { decision: 'APPROVE' }),
    );
    await expect(
      as(globalUserId, () =>
        service.createExpense(schoolId, globalUserId, {
          ...expense(secondaryUnitId),
          purchaseOrderId: order.id,
        }),
      ),
    ).rejects.toThrow(/cycle de son bon d’achat/);
    const linked = await as(globalUserId, () =>
      service.createExpense(schoolId, globalUserId, {
        ...expense(primaryUnitId),
        purchaseOrderId: order.id,
      }),
    );
    expect(linked.organizationalUnitId).toBe(primaryUnitId);
  });

  it('calcule la consommation du budget annuel d’un cycle', async () => {
    const service = procurement();
    await as(globalUserId, () =>
      service.upsertBudget(schoolId, {
        organizationalUnitId: primaryUnitId,
        fiscalYear: 2026,
        name: 'Budget primaire 2026',
        lines: [{ categoryId, plannedAmount: 100_000 }],
      }),
    );
    const draft = await as(globalUserId, () =>
      service.createExpense(schoolId, globalUserId, expense(primaryUnitId, 120_000)),
    );
    await as(globalUserId, () => service.submitExpense(schoolId, globalUserId, draft.id));
    await as(approverUserId, () =>
      service.decideExpense(schoolId, approverUserId, draft.id, { decision: 'APPROVE' }),
    );
    // Une dépense d'un autre cycle ne consomme pas ce budget.
    const other = await as(globalUserId, () =>
      service.createExpense(schoolId, globalUserId, expense(secondaryUnitId, 30_000)),
    );
    await as(globalUserId, () => service.submitExpense(schoolId, globalUserId, other.id));
    await as(approverUserId, () =>
      service.decideExpense(schoolId, approverUserId, other.id, { decision: 'APPROVE' }),
    );
    // Le règlement hérite du cycle de la dépense et alimente le « payé » du budget.
    await as(globalUserId, () =>
      service.payExpense(schoolId, globalUserId, draft.id, 'coh-pay-1', {
        amount: 20_000,
        method: 'BANK_TRANSFER',
        paidAt: new Date().toISOString(),
      }),
    );
    const payment = await owner.supplierPayment.findUniqueOrThrow({
      where: { idempotencyKey: 'coh-pay-1' },
    });
    expect(payment.organizationalUnitId).toBe(primaryUnitId);

    const [budget] = (await as(globalUserId, () => service.overview(schoolId))).budgets;
    expect(budget).toMatchObject({
      organizationalUnitName: 'Primaire',
      plannedTotal: 100_000,
      committedTotal: 120_000,
      paidTotal: 20_000,
    });
    expect(budget?.lines[0]?.remainingAmount).toBe(-20_000);

    await expect(
      as(primaryUserId, () =>
        service.upsertBudget(schoolId, {
          organizationalUnitId: secondaryUnitId,
          fiscalYear: 2026,
          name: 'Hors périmètre',
          lines: [{ categoryId, plannedAmount: 1 }],
        }),
      ),
    ).rejects.toThrow(/périmètre/);
  });
});

describe('annonces par cycle', () => {
  it('réserve « tout le complexe » au périmètre global et cible les familles du cycle', async () => {
    const service = communications();
    const base = { body: 'Information importante.', audience: 'ALL' as const };
    await expect(
      as(primaryUserId, () =>
        service.announce(schoolId, primaryUserId, { ...base, title: 'Pour tous' }),
      ),
    ).rejects.toThrow(/tout le complexe/);
    await as(primaryUserId, () =>
      service.announce(schoolId, primaryUserId, {
        ...base,
        title: 'Sortie du primaire',
        organizationalUnitId: primaryUnitId,
      }),
    );
    await as(globalUserId, () =>
      service.announce(schoolId, globalUserId, {
        ...base,
        title: 'Examens du secondaire',
        organizationalUnitId: secondaryUnitId,
      }),
    );
    await as(globalUserId, () =>
      service.announce(schoolId, globalUserId, { ...base, title: 'Rentrée du complexe' }),
    );

    // Personnel limité au primaire : complexe + primaire.
    const staff = await as(primaryUserId, () => service.overview(schoolId, primaryUserId, yearId));
    expect(staff.announcements.map((item) => item.title).sort()).toEqual([
      'Rentrée du complexe',
      'Sortie du primaire',
    ]);

    // Parent d'un élève du primaire : mêmes annonces, rien du secondaire.
    const level = await owner.gradeLevel.create({
      data: {
        schoolId,
        name: 'CM2',
        code: 'CM2',
        orderIndex: 1,
        cycle: 'PRIMAIRE',
        organizationalUnitId: primaryUnitId,
      },
    });
    const section = await owner.languageSection.findFirstOrThrow({
      where: { organizationalUnitId: primaryUnitId, code: 'FRANCOPHONE' },
    });
    const classRoom = await owner.class.create({
      data: {
        schoolId,
        academicYearId: yearId,
        gradeLevelId: level.id,
        organizationalUnitId: primaryUnitId,
        languageSectionId: section.id,
        name: 'CM2 A',
      },
    });
    const student = await owner.student.create({
      data: { schoolId, studentNumber: 'COH-1', firstName: 'Awa', lastName: 'Test' },
    });
    await owner.enrollment.create({
      data: {
        schoolId,
        studentId: student.id,
        academicYearId: yearId,
        classId: classRoom.id,
        enrollmentDate: new Date('2026-09-01'),
        status: 'ACTIVE',
      },
    });
    const guardian = await owner.guardian.create({
      data: {
        schoolId,
        userId: parentUserId,
        firstName: 'Parent',
        lastName: 'Test',
        phone: '+237699320004',
      },
    });
    await owner.studentGuardian.create({
      data: {
        studentId: student.id,
        guardianId: guardian.id,
        relationship: 'MERE',
        status: 'ACCEPTED',
      },
    });
    const portal = await as(parentUserId, () =>
      createPortalService(appRole).overview(schoolId, parentUserId, yearId),
    );
    expect(portal.mode).toBe('PARENT');
    // Le parent voit son enfant et sa classe malgré la RLS du rôle restreint.
    expect(portal.learners).toEqual([
      expect.objectContaining({ name: 'Awa Test', className: 'CM2 A' }),
    ]);
    expect(portal.announcements.map((item) => item.title).sort()).toEqual([
      'Rentrée du complexe',
      'Sortie du primaire',
    ]);
  });
});
