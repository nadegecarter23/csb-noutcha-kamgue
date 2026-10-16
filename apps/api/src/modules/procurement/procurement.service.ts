import { createHash, randomUUID } from 'node:crypto';
import type { Prisma, SequenceScope } from '@prisma/client';
import type {
  CreateExpenseBody,
  CreatePurchaseOrderBody,
  CreateSupplierBody,
  PayExpenseBody,
  ProcurementOverviewDto,
  UpdateSupplierBody,
  WorkflowDecisionBody,
} from '@cplan/contracts';
import type { Database } from '../../platform/db.js';
import type { AuditService } from '../../platform/audit.js';
import type { Storage } from '../../platform/storage.js';
import { AuditAction } from '../../platform/audit.js';
import { errors } from '../../platform/errors.js';
import { withSchoolScope } from '../../platform/school-scope.js';

const number = (value: bigint | null | undefined) => Number(value ?? 0n);
const date = (value: Date) => value.toISOString().slice(0, 10);
const iso = (value: Date | null) => value?.toISOString() ?? null;
const purchaseInclude = {
  supplier: true,
  lines: { orderBy: { id: 'asc' as const } },
} satisfies Prisma.PurchaseOrderInclude;
const expenseInclude = {
  supplier: true,
  category: true,
  purchaseOrder: true,
  payments: { where: { status: 'SUCCESS' as const }, orderBy: { paidAt: 'desc' as const } },
} satisfies Prisma.ExpenseInclude;
type PurchaseRow = Prisma.PurchaseOrderGetPayload<{ include: typeof purchaseInclude }>;
type ExpenseRow = Prisma.ExpenseGetPayload<{ include: typeof expenseInclude }>;

async function nextReference(
  tx: Prisma.TransactionClient,
  schoolId: string,
  scope: SequenceScope,
  prefix: string,
) {
  const period = String(new Date().getUTCFullYear());
  const sequence = await tx.numberSequence.upsert({
    where: { schoolId_scope_period: { schoolId, scope, period } },
    create: { schoolId, scope, period, currentValue: 1n },
    update: { currentValue: { increment: 1n } },
  });
  return `${prefix}-${period}-${sequence.currentValue.toString().padStart(5, '0')}`;
}
function purchaseDto(row: PurchaseRow, names: Map<string, string>) {
  return {
    id: row.id,
    reference: row.reference,
    supplierId: row.supplierId,
    supplierName: row.supplier.name,
    status: row.status,
    subtotal: number(row.subtotal),
    totalAmount: number(row.totalAmount),
    expectedDate: row.expectedDate ? date(row.expectedDate) : null,
    notes: row.notes,
    requestedByName: names.get(row.requestedBy) ?? 'Utilisateur',
    approvedByName: row.approvedBy ? (names.get(row.approvedBy) ?? 'Utilisateur') : null,
    submittedAt: iso(row.submittedAt),
    approvedAt: iso(row.approvedAt),
    receivedAt: iso(row.receivedAt),
    createdAt: row.createdAt.toISOString(),
    lines: row.lines.map((line) => ({
      id: line.id,
      description: line.description,
      quantity: Number(line.quantity),
      unitPrice: number(line.unitPrice),
      lineTotal: number(line.lineTotal),
    })),
  };
}
function expenseDto(row: ExpenseRow, names: Map<string, string>) {
  return {
    id: row.id,
    reference: row.reference,
    supplierId: row.supplierId,
    supplierName: row.supplier.name,
    categoryId: row.categoryId,
    categoryName: row.category.name,
    purchaseOrderId: row.purchaseOrderId,
    purchaseOrderReference: row.purchaseOrder?.reference ?? null,
    invoiceNumber: row.invoiceNumber,
    invoiceDate: date(row.invoiceDate),
    dueDate: date(row.dueDate),
    description: row.description,
    amount: number(row.amount),
    paidAmount: number(row.paidAmount),
    balance: number(row.amount - row.paidAmount),
    status: row.status,
    attachmentFileId: row.attachmentFileId,
    createdByName: names.get(row.createdBy) ?? 'Utilisateur',
    approvedByName: row.approvedBy ? (names.get(row.approvedBy) ?? 'Utilisateur') : null,
    submittedAt: iso(row.submittedAt),
    approvedAt: iso(row.approvedAt),
    createdAt: row.createdAt.toISOString(),
    payments: row.payments.map((payment) => ({
      id: payment.id,
      reference: payment.reference,
      amount: number(payment.amount),
      method: payment.method,
      externalReference: payment.externalReference,
      paidAt: payment.paidAt.toISOString(),
      status: payment.status,
    })),
  };
}

export function createProcurementService(db: Database, audit: AuditService, storage: Storage) {
  async function overview(schoolId: string): Promise<ProcurementOverviewDto> {
    return withSchoolScope(db, schoolId, async (tx) => {
      const [suppliers, categories, purchaseOrders, expenses] = await Promise.all([
        tx.supplier.findMany({ where: { schoolId }, orderBy: { name: 'asc' } }),
        tx.expenseCategory.findMany({ where: { schoolId }, orderBy: { name: 'asc' } }),
        tx.purchaseOrder.findMany({
          where: { schoolId },
          include: purchaseInclude,
          orderBy: { createdAt: 'desc' },
          take: 200,
        }),
        tx.expense.findMany({
          where: { schoolId },
          include: expenseInclude,
          orderBy: { createdAt: 'desc' },
          take: 300,
        }),
      ]);
      const userIds = [
        ...new Set([
          ...purchaseOrders.flatMap((x) => [
            x.requestedBy,
            ...(x.approvedBy ? [x.approvedBy] : []),
          ]),
          ...expenses.flatMap((x) => [x.createdBy, ...(x.approvedBy ? [x.approvedBy] : [])]),
        ]),
      ];
      const users = await tx.user.findMany({
        where: { id: { in: userIds } },
        select: { id: true, firstName: true, lastName: true },
      });
      const names = new Map(users.map((x) => [x.id, `${x.firstName} ${x.lastName}`]));
      const outstanding = new Map<string, number>();
      for (const item of expenses)
        if (['APPROVED', 'PARTIALLY_PAID'].includes(item.status))
          outstanding.set(
            item.supplierId,
            (outstanding.get(item.supplierId) ?? 0) + number(item.amount - item.paidAmount),
          );
      const now = new Date(),
        monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)),
        today = date(now);
      const payable = expenses.filter((x) => ['APPROVED', 'PARTIALLY_PAID'].includes(x.status));
      return {
        summary: {
          supplierCount: suppliers.filter((x) => x.status === 'ACTIVE').length,
          pendingApprovalCount:
            purchaseOrders.filter((x) => x.status === 'SUBMITTED').length +
            expenses.filter((x) => x.status === 'SUBMITTED').length,
          payableAmount: payable.reduce((sum, x) => sum + number(x.amount - x.paidAmount), 0),
          overdueAmount: payable
            .filter((x) => date(x.dueDate) < today)
            .reduce((sum, x) => sum + number(x.amount - x.paidAmount), 0),
          paidThisMonth: expenses
            .flatMap((x) => x.payments)
            .filter((x) => x.paidAt >= monthStart)
            .reduce((sum, x) => sum + number(x.amount), 0),
        },
        suppliers: suppliers.map((x) => ({
          id: x.id,
          code: x.code,
          name: x.name,
          taxId: x.taxId,
          phone: x.phone,
          email: x.email,
          address: x.address,
          paymentTermsDays: x.paymentTermsDays,
          status: x.status,
          outstandingAmount: outstanding.get(x.id) ?? 0,
        })),
        categories: categories.map((x) => ({
          id: x.id,
          code: x.code,
          name: x.name,
          description: x.description,
          status: x.status,
        })),
        purchaseOrders: purchaseOrders.map((x) => purchaseDto(x, names)),
        expenses: expenses.map((x) => expenseDto(x, names)),
      };
    });
  }
  async function getPurchase(schoolId: string, id: string) {
    const result = await overview(schoolId);
    const item = result.purchaseOrders.find((x) => x.id === id);
    if (!item) throw errors.notFound('Bon d’achat introuvable.');
    return item;
  }
  async function getExpense(schoolId: string, id: string) {
    const result = await overview(schoolId);
    const item = result.expenses.find((x) => x.id === id);
    if (!item) throw errors.notFound('Dépense introuvable.');
    return item;
  }
  return {
    overview,
    async uploadDocument(
      schoolId: string,
      actorId: string,
      file: { filename: string; mimetype: string; body: Buffer },
    ) {
      const extension =
        file.mimetype === 'application/pdf'
          ? '.pdf'
          : file.mimetype === 'image/png'
            ? '.png'
            : '.jpg';
      const key = `expenses/${schoolId}/${randomUUID()}${extension}`;
      await storage.putObject({ key, body: file.body, contentType: file.mimetype });
      try {
        return await withSchoolScope(db, schoolId, async (tx) => {
          const row = await tx.file.create({
            data: {
              schoolId,
              storageKey: key,
              originalName: file.filename,
              mimeType: file.mimetype,
              sizeBytes: file.body.byteLength,
              checksumSha256: createHash('sha256').update(file.body).digest('hex'),
              kind: 'EXPENSE_DOCUMENT',
              uploadedBy: actorId,
            },
          });
          return {
            id: row.id,
            originalName: row.originalName ?? file.filename,
            mimeType: row.mimeType,
            sizeBytes: Number(row.sizeBytes),
          };
        });
      } catch (error) {
        await storage.deleteObject(key).catch(() => undefined);
        throw error;
      }
    },
    async documentUrl(schoolId: string, expenseId: string) {
      return withSchoolScope(db, schoolId, async (tx) => {
        const row = await tx.expense.findFirst({
          where: { id: expenseId, schoolId },
          include: { attachment: true },
        });
        if (!row) throw errors.notFound('Dépense introuvable.');
        if (!row.attachment)
          throw errors.notFound('Cette dépense ne contient aucune pièce justificative.');
        return {
          url: await storage.getDownloadUrl(row.attachment.storageKey, 300),
          expiresIn: 300,
        };
      });
    },
    async createSupplier(schoolId: string, input: CreateSupplierBody) {
      return withSchoolScope(db, schoolId, async (tx) => {
        const row = await tx.supplier.create({
          data: {
            schoolId,
            code: input.code,
            name: input.name,
            paymentTermsDays: input.paymentTermsDays,
            taxId: input.taxId ?? null,
            phone: input.phone ?? null,
            email: input.email ?? null,
            address: input.address ?? null,
          },
        });
        await audit.log(
          {
            action: AuditAction.SUPPLIER_CREATED,
            entityType: 'supplier',
            entityId: row.id,
            schoolId,
            after: input,
          },
          tx,
        );
        return { ...row, outstandingAmount: 0 };
      });
    },
    async updateSupplier(schoolId: string, id: string, input: UpdateSupplierBody) {
      return withSchoolScope(db, schoolId, async (tx) => {
        const before = await tx.supplier.findFirst({ where: { id, schoolId } });
        if (!before) throw errors.notFound('Fournisseur introuvable.');
        const data = {
          ...(input.code !== undefined && { code: input.code }),
          ...(input.name !== undefined && { name: input.name }),
          ...(input.taxId !== undefined && { taxId: input.taxId }),
          ...(input.phone !== undefined && { phone: input.phone }),
          ...(input.email !== undefined && { email: input.email }),
          ...(input.address !== undefined && { address: input.address }),
          ...(input.paymentTermsDays !== undefined && { paymentTermsDays: input.paymentTermsDays }),
          ...(input.status !== undefined && { status: input.status }),
        };
        const row = await tx.supplier.update({ where: { id }, data });
        await audit.log(
          {
            action: AuditAction.SUPPLIER_UPDATED,
            entityType: 'supplier',
            entityId: id,
            schoolId,
            before,
            after: row,
          },
          tx,
        );
        return { ...row, outstandingAmount: 0 };
      });
    },
    async createCategory(
      schoolId: string,
      input: { code: string; name: string; description?: string | null | undefined },
    ) {
      return withSchoolScope(db, schoolId, async (tx) => {
        const row = await tx.expenseCategory.create({
          data: {
            schoolId,
            code: input.code,
            name: input.name,
            description: input.description ?? null,
          },
        });
        await audit.log(
          {
            action: AuditAction.EXPENSE_CATEGORY_CREATED,
            entityType: 'expense_category',
            entityId: row.id,
            schoolId,
            after: input,
          },
          tx,
        );
        return row;
      });
    },
    async createPurchase(schoolId: string, actorId: string, input: CreatePurchaseOrderBody) {
      const id = await withSchoolScope(db, schoolId, async (tx) => {
        const supplier = await tx.supplier.findFirst({
          where: { id: input.supplierId, schoolId, status: 'ACTIVE' },
        });
        if (!supplier) throw errors.validation('Le fournisseur est introuvable ou inactif.');
        const calculated = input.lines.map((line) => ({
          ...line,
          lineTotal: Math.round(line.quantity * line.unitPrice),
        }));
        const total = calculated.reduce((sum, line) => sum + line.lineTotal, 0);
        const reference = await nextReference(tx, schoolId, 'PURCHASE_ORDER', 'BC');
        const row = await tx.purchaseOrder.create({
          data: {
            schoolId,
            reference,
            supplierId: supplier.id,
            subtotal: BigInt(total),
            totalAmount: BigInt(total),
            requestedBy: actorId,
            expectedDate: input.expectedDate ? new Date(input.expectedDate) : null,
            notes: input.notes ?? null,
            lines: {
              create: calculated.map((line) => ({
                schoolId,
                description: line.description,
                quantity: line.quantity,
                unitPrice: BigInt(line.unitPrice),
                lineTotal: BigInt(line.lineTotal),
              })),
            },
          },
        });
        await audit.log(
          {
            action: AuditAction.PURCHASE_ORDER_CREATED,
            entityType: 'purchase_order',
            entityId: row.id,
            schoolId,
            after: { reference, total, lineCount: input.lines.length },
          },
          tx,
        );
        return row.id;
      });
      return getPurchase(schoolId, id);
    },
    async submitPurchase(schoolId: string, actorId: string, id: string) {
      await withSchoolScope(db, schoolId, async (tx) => {
        const row = await tx.purchaseOrder.findFirst({ where: { id, schoolId } });
        if (!row) throw errors.notFound('Bon d’achat introuvable.');
        if (row.requestedBy !== actorId)
          throw errors.forbidden('Seul l’auteur peut soumettre ce bon d’achat.');
        if (row.status !== 'DRAFT' && row.status !== 'REJECTED')
          throw errors.conflict('Ce bon d’achat ne peut plus être soumis.');
        await tx.purchaseOrder.update({
          where: { id },
          data: {
            status: 'SUBMITTED',
            submittedAt: new Date(),
            decisionReason: null,
            approvedBy: null,
            approvedAt: null,
          },
        });
        await audit.log(
          {
            action: AuditAction.PURCHASE_ORDER_SUBMITTED,
            entityType: 'purchase_order',
            entityId: id,
            schoolId,
          },
          tx,
        );
      });
      return getPurchase(schoolId, id);
    },
    async decidePurchase(
      schoolId: string,
      actorId: string,
      id: string,
      input: WorkflowDecisionBody,
    ) {
      await withSchoolScope(db, schoolId, async (tx) => {
        const row = await tx.purchaseOrder.findFirst({ where: { id, schoolId } });
        if (!row) throw errors.notFound('Bon d’achat introuvable.');
        if (row.status !== 'SUBMITTED')
          throw errors.conflict('Ce bon d’achat n’attend pas de décision.');
        if (row.requestedBy === actorId)
          throw errors.forbidden('L’auteur ne peut pas approuver sa propre demande.');
        const status = input.decision === 'APPROVE' ? ('APPROVED' as const) : ('REJECTED' as const);
        await tx.purchaseOrder.update({
          where: { id },
          data: {
            status,
            approvedBy: actorId,
            approvedAt: new Date(),
            decisionReason: input.reason ?? null,
          },
        });
        await audit.log(
          {
            action: AuditAction.PURCHASE_ORDER_DECIDED,
            entityType: 'purchase_order',
            entityId: id,
            schoolId,
            before: { status: row.status },
            after: { status, reason: input.reason },
          },
          tx,
        );
      });
      return getPurchase(schoolId, id);
    },
    async receivePurchase(schoolId: string, id: string) {
      await withSchoolScope(db, schoolId, async (tx) => {
        const row = await tx.purchaseOrder.findFirst({ where: { id, schoolId } });
        if (!row) throw errors.notFound('Bon d’achat introuvable.');
        if (!['APPROVED', 'ORDERED', 'PARTIALLY_RECEIVED'].includes(row.status))
          throw errors.conflict('Ce bon d’achat ne peut pas être réceptionné.');
        await tx.purchaseOrder.update({
          where: { id },
          data: { status: 'RECEIVED', receivedAt: new Date() },
        });
        await audit.log(
          {
            action: AuditAction.PURCHASE_ORDER_RECEIVED,
            entityType: 'purchase_order',
            entityId: id,
            schoolId,
          },
          tx,
        );
      });
      return getPurchase(schoolId, id);
    },
    async createExpense(schoolId: string, actorId: string, input: CreateExpenseBody) {
      const id = await withSchoolScope(db, schoolId, async (tx) => {
        const [supplier, category, order, file] = await Promise.all([
          tx.supplier.findFirst({ where: { id: input.supplierId, schoolId, status: 'ACTIVE' } }),
          tx.expenseCategory.findFirst({
            where: { id: input.categoryId, schoolId, status: 'ACTIVE' },
          }),
          input.purchaseOrderId
            ? tx.purchaseOrder.findFirst({ where: { id: input.purchaseOrderId, schoolId } })
            : Promise.resolve(null),
          input.attachmentFileId
            ? tx.file.findFirst({
                where: { id: input.attachmentFileId, schoolId, kind: 'EXPENSE_DOCUMENT' },
              })
            : Promise.resolve(null),
        ]);
        if (!supplier || !category) throw errors.validation('Fournisseur ou catégorie invalide.');
        if (
          input.purchaseOrderId &&
          (!order ||
            order.supplierId !== supplier.id ||
            !['APPROVED', 'ORDERED', 'PARTIALLY_RECEIVED', 'RECEIVED'].includes(order.status))
        )
          throw errors.validation('Le bon d’achat ne correspond pas à cette facture.');
        if (input.attachmentFileId && !file)
          throw errors.validation('La pièce justificative est invalide.');
        if (order) {
          const used = await tx.expense.aggregate({
            where: { purchaseOrderId: order.id, status: { notIn: ['REJECTED', 'CANCELLED'] } },
            _sum: { amount: true },
          });
          if (number(used._sum.amount) + input.amount > number(order.totalAmount))
            throw errors.validation('Le total facturé dépasse le montant du bon d’achat.');
        }
        const reference = await nextReference(tx, schoolId, 'EXPENSE', 'DEP');
        const row = await tx.expense.create({
          data: {
            schoolId,
            reference,
            supplierId: supplier.id,
            categoryId: category.id,
            purchaseOrderId: order?.id ?? null,
            invoiceNumber: input.invoiceNumber ?? null,
            invoiceDate: new Date(input.invoiceDate),
            dueDate: new Date(input.dueDate),
            description: input.description,
            amount: BigInt(input.amount),
            attachmentFileId: input.attachmentFileId ?? null,
            createdBy: actorId,
          },
        });
        await audit.log(
          {
            action: AuditAction.EXPENSE_CREATED,
            entityType: 'expense',
            entityId: row.id,
            schoolId,
            after: { ...input, reference },
          },
          tx,
        );
        return row.id;
      });
      return getExpense(schoolId, id);
    },
    async submitExpense(schoolId: string, actorId: string, id: string) {
      await withSchoolScope(db, schoolId, async (tx) => {
        const row = await tx.expense.findFirst({ where: { id, schoolId } });
        if (!row) throw errors.notFound('Dépense introuvable.');
        if (row.createdBy !== actorId)
          throw errors.forbidden('Seul l’auteur peut soumettre cette dépense.');
        if (row.status !== 'DRAFT' && row.status !== 'REJECTED')
          throw errors.conflict('Cette dépense ne peut plus être soumise.');
        await tx.expense.update({
          where: { id },
          data: {
            status: 'SUBMITTED',
            submittedAt: new Date(),
            decisionReason: null,
            approvedBy: null,
            approvedAt: null,
          },
        });
        await audit.log(
          { action: AuditAction.EXPENSE_SUBMITTED, entityType: 'expense', entityId: id, schoolId },
          tx,
        );
      });
      return getExpense(schoolId, id);
    },
    async decideExpense(
      schoolId: string,
      actorId: string,
      id: string,
      input: WorkflowDecisionBody,
    ) {
      await withSchoolScope(db, schoolId, async (tx) => {
        const row = await tx.expense.findFirst({ where: { id, schoolId } });
        if (!row) throw errors.notFound('Dépense introuvable.');
        if (row.status !== 'SUBMITTED')
          throw errors.conflict('Cette dépense n’attend pas de décision.');
        if (row.createdBy === actorId)
          throw errors.forbidden('L’auteur ne peut pas approuver sa propre dépense.');
        const status = input.decision === 'APPROVE' ? ('APPROVED' as const) : ('REJECTED' as const);
        await tx.expense.update({
          where: { id },
          data: {
            status,
            approvedBy: actorId,
            approvedAt: new Date(),
            decisionReason: input.reason ?? null,
          },
        });
        await audit.log(
          {
            action: AuditAction.EXPENSE_DECIDED,
            entityType: 'expense',
            entityId: id,
            schoolId,
            before: { status: row.status },
            after: { status, reason: input.reason },
          },
          tx,
        );
      });
      return getExpense(schoolId, id);
    },
    async payExpense(
      schoolId: string,
      actorId: string,
      id: string,
      key: string,
      input: PayExpenseBody,
    ) {
      const paymentId = await withSchoolScope(db, schoolId, async (tx) => {
        const prior = await tx.supplierPayment.findUnique({ where: { idempotencyKey: key } });
        if (prior) {
          if (prior.expenseId !== id)
            throw errors.conflict('Cette clé d’idempotence a déjà été utilisée.');
          return prior.id;
        }
        await tx.$queryRaw`SELECT id FROM expenses WHERE id=${id}::uuid AND school_id=${schoolId}::uuid FOR UPDATE`;
        const expense = await tx.expense.findFirst({ where: { id, schoolId } });
        if (!expense) throw errors.notFound('Dépense introuvable.');
        if (!['APPROVED', 'PARTIALLY_PAID'].includes(expense.status))
          throw errors.conflict('Cette dépense n’est pas payable.');
        if (input.amount > number(expense.amount - expense.paidAmount))
          throw errors.validation('Le paiement dépasse le solde fournisseur.');
        if (new Date(input.paidAt) > new Date())
          throw errors.validation('La date de paiement ne peut pas être future.');
        let cashSessionId: string | null = null;
        if (input.method === 'CASH') {
          const session = await tx.cashSession.findFirst({
            where: {
              schoolId,
              cashierUserId: actorId,
              status: 'OPEN',
              ...(input.cashSessionId ? { id: input.cashSessionId } : {}),
            },
          });
          if (!session)
            throw errors.conflict(
              'Une session de caisse ouverte par l’utilisateur est obligatoire.',
            );
          cashSessionId = session.id;
        }
        const reference = await nextReference(tx, schoolId, 'SUPPLIER_PAYMENT', 'PAF');
        const payment = await tx.supplierPayment.create({
          data: {
            schoolId,
            expenseId: id,
            reference,
            amount: BigInt(input.amount),
            method: input.method,
            externalReference: input.externalReference ?? null,
            paidAt: new Date(input.paidAt),
            cashSessionId,
            idempotencyKey: key,
            note: input.note ?? null,
            createdBy: actorId,
          },
        });
        if (cashSessionId)
          await tx.cashSessionMovement.create({
            data: {
              schoolId,
              sessionId: cashSessionId,
              supplierPaymentId: payment.id,
              type: 'CASH_OUT',
              amount: BigInt(input.amount),
              note: `Paiement fournisseur ${reference}`,
              createdBy: actorId,
            },
          });
        const paid = expense.paidAmount + BigInt(input.amount),
          status = paid === expense.amount ? ('PAID' as const) : ('PARTIALLY_PAID' as const);
        await tx.expense.update({ where: { id }, data: { paidAmount: paid, status } });
        await audit.log(
          {
            action: AuditAction.SUPPLIER_PAYMENT_CREATED,
            entityType: 'supplier_payment',
            entityId: payment.id,
            schoolId,
            after: { expenseId: id, reference, amount: input.amount, method: input.method },
          },
          tx,
        );
        return payment.id;
      });
      const result = await getExpense(schoolId, id);
      const payment = result.payments.find((x) => x.id === paymentId);
      if (!payment) throw errors.notFound('Paiement fournisseur introuvable.');
      return payment;
    },
  };
}
export type ProcurementService = ReturnType<typeof createProcurementService>;
