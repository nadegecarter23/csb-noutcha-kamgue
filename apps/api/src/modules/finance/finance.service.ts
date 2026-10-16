import type { Prisma } from '@prisma/client';
import { amount, distribute, percentOf, resolveApplicableFee } from '@cplan/domain';
import type {
  CreateFeeStructureBody,
  DiscountBody,
  UpdateFeeStructureBody,
} from '@cplan/contracts';
import type { AuditService } from '../../platform/audit.js';
import { AuditAction } from '../../platform/audit.js';
import type { Database } from '../../platform/db.js';
import { errors } from '../../platform/errors.js';
import { withSchoolScope } from '../../platform/school-scope.js';

const date = (value: Date | null) => (value ? value.toISOString().slice(0, 10) : null);
const num = (value: bigint | Prisma.Decimal) => Number(value);

const structureInclude = {
  feeType: true,
  installments: { where: { status: 'ACTIVE' as const }, orderBy: { orderIndex: 'asc' as const } },
} satisfies Prisma.FeeStructureInclude;

function structureDto(row: Prisma.FeeStructureGetPayload<{ include: typeof structureInclude }>) {
  return {
    id: row.id,
    academicYearId: row.academicYearId,
    feeTypeId: row.feeTypeId,
    feeTypeName: row.feeType.name,
    gradeLevelId: row.gradeLevelId,
    classId: row.classId,
    studentCategoryId: row.studentCategoryId,
    name: row.name,
    amount: num(row.amount),
    isMandatory: row.isMandatory,
    allowPartialPayment: row.allowPartialPayment,
    allowFullPayment: row.allowFullPayment,
    allowFreeAmount: row.allowFreeAmount,
    enforceInstallmentOrder: row.enforceInstallmentOrder,
    opensAt: date(row.opensAt),
    dueDate: date(row.dueDate),
    status: row.status,
    installments: row.installments.map((item) => ({
      id: item.id,
      name: item.name,
      amount: num(item.amount),
      dueDate: item.dueDate.toISOString().slice(0, 10),
      orderIndex: item.orderIndex,
    })),
  };
}

export async function assignMandatoryFees(
  tx: Prisma.TransactionClient,
  schoolId: string,
  enrollmentId: string,
) {
  const enrollment = await tx.enrollment.findFirst({
    where: { id: enrollmentId, schoolId },
    include: { class: true },
  });
  if (!enrollment) throw errors.notFound('Inscription introuvable.');
  const structures = await tx.feeStructure.findMany({
    where: {
      schoolId,
      academicYearId: enrollment.academicYearId,
      status: 'ACTIVE',
      isMandatory: true,
    },
    include: structureInclude,
  });
  const byType = new Map<string, typeof structures>();
  for (const structure of structures) {
    const list = byType.get(structure.feeTypeId) ?? [];
    list.push(structure);
    byType.set(structure.feeTypeId, list);
  }
  const created: string[] = [];
  for (const candidates of byType.values()) {
    const selected = resolveApplicableFee(candidates, {
      gradeLevelId: enrollment.class?.gradeLevelId ?? null,
      classId: enrollment.classId,
      studentCategoryId: enrollment.studentCategoryId,
    });
    if (!selected) continue;
    const existing = await tx.studentFeeAssignment.findUnique({
      where: { enrollmentId_feeStructureId: { enrollmentId, feeStructureId: selected.id } },
    });
    if (existing) continue;
    const assignment = await tx.studentFeeAssignment.create({
      data: {
        schoolId,
        organizationalUnitId: enrollment.class?.organizationalUnitId ?? null,
        enrollmentId,
        studentId: enrollment.studentId,
        feeStructureId: selected.id,
        feeTypeId: selected.feeTypeId,
        originalAmount: selected.amount,
        finalAmount: selected.amount,
      },
    });
    if (selected.installments.length)
      await tx.studentFeeInstallment.createMany({
        data: selected.installments.map((item) => ({
          studentFeeAssignmentId: assignment.id,
          feeInstallmentId: item.id,
          name: item.name,
          amount: item.amount,
          dueDate: item.dueDate,
          orderIndex: item.orderIndex,
        })),
      });
    created.push(assignment.id);
  }
  return created;
}

export function createFinanceService(db: Database, audit: AuditService) {
  async function recalculateAssignment(tx: Prisma.TransactionClient, id: string) {
    const assignment = await tx.studentFeeAssignment.findUnique({
      where: { id },
      include: { discounts: true, installments: { orderBy: { orderIndex: 'asc' } } },
    });
    if (!assignment) throw errors.notFound('Affectation introuvable.');
    const discount = assignment.discounts
      .filter((item) => item.status === 'APPROVED')
      .reduce((sum, item) => sum + item.amount, 0n);
    const finalAmount = assignment.originalAmount - discount;
    if (finalAmount < assignment.paidAmount)
      throw errors.conflict('La remise ferait passer le net sous le montant déjà payé.');
    const parts = assignment.installments.length
      ? distribute(
          amount(Number(finalAmount)),
          assignment.installments.map((item) => Number(item.amount)),
        )
      : [];
    for (const [index, installment] of assignment.installments.entries()) {
      const next = BigInt(parts[index] ?? 0);
      if (next < installment.paidAmount)
        throw errors.conflict('La remise ferait passer une tranche sous son montant déjà payé.');
      await tx.studentFeeInstallment.update({
        where: { id: installment.id },
        data: { amount: next },
      });
    }
    return tx.studentFeeAssignment.update({
      where: { id },
      data: {
        discountAmount: discount,
        finalAmount,
        status:
          finalAmount === 0n
            ? 'WAIVED'
            : assignment.paidAmount === 0n
              ? 'PENDING'
              : assignment.paidAmount >= finalAmount
                ? 'PAID'
                : 'PARTIALLY_PAID',
      },
    });
  }

  return {
    async listFeeTypes(schoolId: string) {
      return withSchoolScope(db, schoolId, async (tx) =>
        (
          await tx.feeType.findMany({
            where: { schoolId },
            orderBy: [{ priority: 'asc' }, { name: 'asc' }],
          })
        ).map((row) => ({
          id: row.id,
          code: row.code,
          name: row.name,
          description: row.description,
          isMandatory: row.isMandatory,
          priority: row.priority,
          status: row.status,
        })),
      );
    },
    async createFeeType(
      schoolId: string,
      input: {
        code: string;
        name: string;
        description?: string | null | undefined;
        isMandatory?: boolean | undefined;
        priority?: number | undefined;
      },
    ) {
      return withSchoolScope(db, schoolId, async (tx) => {
        const row = await tx.feeType.create({
          data: {
            schoolId,
            code: input.code.toUpperCase(),
            name: input.name,
            description: input.description ?? null,
            isMandatory: input.isMandatory ?? true,
            priority: input.priority ?? 100,
          },
        });
        await audit.log(
          {
            action: AuditAction.FEE_TYPE_CREATED,
            entityType: 'fee_type',
            entityId: row.id,
            schoolId,
            after: input,
          },
          tx,
        );
        return {
          id: row.id,
          code: row.code,
          name: row.name,
          description: row.description,
          isMandatory: row.isMandatory,
          priority: row.priority,
          status: row.status,
        };
      });
    },
    async listStructures(
      schoolId: string,
      query: {
        academic_year_id?: string | undefined;
        grade_level_id?: string | undefined;
        fee_type_id?: string | undefined;
        status?: 'DRAFT' | 'ACTIVE' | 'INACTIVE' | undefined;
      },
    ) {
      return withSchoolScope(db, schoolId, async (tx) =>
        (
          await tx.feeStructure.findMany({
            where: {
              schoolId,
              ...(query.academic_year_id ? { academicYearId: query.academic_year_id } : {}),
              ...(query.grade_level_id ? { gradeLevelId: query.grade_level_id } : {}),
              ...(query.fee_type_id ? { feeTypeId: query.fee_type_id } : {}),
              ...(query.status ? { status: query.status } : {}),
            },
            include: structureInclude,
            orderBy: [{ feeType: { priority: 'asc' } }, { name: 'asc' }],
          })
        ).map(structureDto),
      );
    },
    async createStructure(schoolId: string, input: CreateFeeStructureBody) {
      return withSchoolScope(db, schoolId, async (tx) => {
        const total = input.installments.reduce((sum, item) => sum + item.amount, 0);
        if (input.installments.length && total !== input.amount)
          throw errors.validation('La somme des tranches doit être égale au montant.');
        if (input.classId) {
          const schoolClass = await tx.class.findFirst({
            where: { id: input.classId, schoolId, academicYearId: input.academicYearId },
          });
          if (!schoolClass) throw errors.validation("La classe n'appartient pas à l'année ciblée.");
          if (input.gradeLevelId && schoolClass.gradeLevelId !== input.gradeLevelId)
            throw errors.validation('La classe ne correspond pas au niveau ciblé.');
        }
        const row = await tx.feeStructure.create({
          data: {
            schoolId,
            academicYearId: input.academicYearId,
            feeTypeId: input.feeTypeId,
            gradeLevelId: input.gradeLevelId ?? null,
            classId: input.classId ?? null,
            studentCategoryId: input.studentCategoryId ?? null,
            name: input.name,
            amount: BigInt(input.amount),
            isMandatory: input.isMandatory,
            allowPartialPayment: input.allowPartialPayment,
            allowFullPayment: input.allowFullPayment,
            allowFreeAmount: input.allowFreeAmount,
            enforceInstallmentOrder: input.enforceInstallmentOrder,
            opensAt: input.opensAt ? new Date(input.opensAt) : null,
            dueDate: input.dueDate ? new Date(input.dueDate) : null,
            installments: {
              create: input.installments.map((item) => ({
                name: item.name,
                amount: BigInt(item.amount),
                dueDate: new Date(item.dueDate),
                orderIndex: item.orderIndex,
              })),
            },
          },
          include: structureInclude,
        });
        await audit.log(
          {
            action: AuditAction.FEE_STRUCTURE_CREATED,
            entityType: 'fee_structure',
            entityId: row.id,
            schoolId,
            after: { name: row.name, amount: input.amount },
          },
          tx,
        );
        return structureDto(row);
      });
    },
    async setStructureStatus(schoolId: string, id: string, status: 'ACTIVE' | 'INACTIVE') {
      return withSchoolScope(db, schoolId, async (tx) => {
        const row = await tx.feeStructure.update({
          where: { id, schoolId },
          data: { status },
          include: structureInclude,
        });
        await audit.log(
          {
            action: AuditAction.FEE_STRUCTURE_UPDATED,
            entityType: 'fee_structure',
            entityId: id,
            schoolId,
            after: { status },
          },
          tx,
        );
        return structureDto(row);
      });
    },
    async updateStructure(schoolId: string, id: string, input: UpdateFeeStructureBody) {
      return withSchoolScope(db, schoolId, async (tx) => {
        const before = await tx.feeStructure.findFirst({ where: { id, schoolId } });
        if (!before) throw errors.notFound('Structure introuvable.');
        const data: Prisma.FeeStructureUpdateInput = {};
        if (input.name !== undefined) data.name = input.name;
        if (input.amount !== undefined) data.amount = BigInt(input.amount);
        if (input.isMandatory !== undefined) data.isMandatory = input.isMandatory;
        if (input.allowPartialPayment !== undefined)
          data.allowPartialPayment = input.allowPartialPayment;
        if (input.allowFullPayment !== undefined) data.allowFullPayment = input.allowFullPayment;
        if (input.allowFreeAmount !== undefined) data.allowFreeAmount = input.allowFreeAmount;
        if (input.enforceInstallmentOrder !== undefined)
          data.enforceInstallmentOrder = input.enforceInstallmentOrder;
        if (input.opensAt !== undefined)
          data.opensAt = input.opensAt ? new Date(input.opensAt) : null;
        if (input.dueDate !== undefined)
          data.dueDate = input.dueDate ? new Date(input.dueDate) : null;
        const row = await tx.feeStructure.update({
          where: { id },
          data,
          include: structureInclude,
        });
        await audit.log(
          {
            action: AuditAction.FEE_STRUCTURE_UPDATED,
            entityType: 'fee_structure',
            entityId: id,
            schoolId,
            before: { name: before.name, amount: num(before.amount) },
            after: { name: row.name, amount: num(row.amount) },
          },
          tx,
        );
        return structureDto(row);
      });
    },
    async duplicateStructure(schoolId: string, id: string, targetAcademicYearId: string) {
      return withSchoolScope(db, schoolId, async (tx) => {
        const source = await tx.feeStructure.findFirst({
          where: { id, schoolId },
          include: { ...structureInclude, academicYear: true },
        });
        const target = await tx.academicYear.findFirst({
          where: { id: targetAcademicYearId, schoolId },
        });
        if (!source || !target) throw errors.notFound('Structure ou année cible introuvable.');
        const yearShift =
          target.startDate.getUTCFullYear() - source.academicYear.startDate.getUTCFullYear();
        const shift = (value: Date | null) =>
          value
            ? new Date(
                Date.UTC(
                  value.getUTCFullYear() + yearShift,
                  value.getUTCMonth(),
                  value.getUTCDate(),
                ),
              )
            : null;
        const row = await tx.feeStructure.create({
          data: {
            schoolId,
            academicYearId: target.id,
            feeTypeId: source.feeTypeId,
            gradeLevelId: source.gradeLevelId,
            studentCategoryId: source.studentCategoryId,
            name: source.name,
            amount: source.amount,
            isMandatory: source.isMandatory,
            allowPartialPayment: source.allowPartialPayment,
            allowFullPayment: source.allowFullPayment,
            allowFreeAmount: source.allowFreeAmount,
            enforceInstallmentOrder: source.enforceInstallmentOrder,
            opensAt: shift(source.opensAt),
            dueDate: shift(source.dueDate),
            status: 'DRAFT',
            installments: {
              create: source.installments.map((item) => ({
                name: item.name,
                amount: item.amount,
                dueDate: shift(item.dueDate) ?? item.dueDate,
                orderIndex: item.orderIndex,
              })),
            },
          },
          include: structureInclude,
        });
        await audit.log(
          {
            action: AuditAction.FEE_STRUCTURE_DUPLICATED,
            entityType: 'fee_structure',
            entityId: row.id,
            schoolId,
            after: { sourceId: id, targetAcademicYearId },
          },
          tx,
        );
        return structureDto(row);
      });
    },
    async recalculateAssignments(schoolId: string, id: string, preview: boolean) {
      return withSchoolScope(db, schoolId, async (tx) => {
        const structure = await tx.feeStructure.findFirst({
          where: { id, schoolId },
          include: {
            installments: { where: { status: 'ACTIVE' }, orderBy: { orderIndex: 'asc' } },
            assignments: {
              include: { discounts: true, installments: { orderBy: { orderIndex: 'asc' } } },
            },
          },
        });
        if (!structure) throw errors.notFound('Structure introuvable.');
        const blocked: string[] = [];
        let oldTotal = 0n;
        let newTotal = 0n;
        for (const assignment of structure.assignments) {
          const discount = assignment.discounts
            .filter((item) => item.status === 'APPROVED')
            .reduce((sum, item) => sum + item.amount, 0n);
          const finalAmount = structure.amount - discount;
          oldTotal += assignment.finalAmount;
          newTotal += finalAmount;
          if (finalAmount < assignment.paidAmount) {
            blocked.push(assignment.id);
            continue;
          }
          if (preview) continue;
          const parts = assignment.installments.length
            ? distribute(
                amount(Number(finalAmount)),
                structure.installments.map((item) => Number(item.amount)),
              )
            : [];
          if (
            assignment.installments.some(
              (item, index) => BigInt(parts[index] ?? 0) < item.paidAmount,
            )
          ) {
            blocked.push(assignment.id);
            continue;
          }
          await tx.studentFeeAssignment.update({
            where: { id: assignment.id },
            data: {
              originalAmount: structure.amount,
              finalAmount,
              status:
                assignment.paidAmount === 0n
                  ? 'PENDING'
                  : assignment.paidAmount >= finalAmount
                    ? 'PAID'
                    : 'PARTIALLY_PAID',
            },
          });
          for (const [index, installment] of assignment.installments.entries())
            await tx.studentFeeInstallment.update({
              where: { id: installment.id },
              data: { amount: BigInt(parts[index] ?? 0) },
            });
          await audit.log(
            {
              action: AuditAction.FEE_STRUCTURE_UPDATED,
              entityType: 'student_fee_assignment',
              entityId: assignment.id,
              schoolId,
              before: {
                originalAmount: num(assignment.originalAmount),
                finalAmount: num(assignment.finalAmount),
              },
              after: { originalAmount: num(structure.amount), finalAmount: num(finalAmount) },
            },
            tx,
          );
        }
        if (!preview && blocked.length)
          throw errors.conflict(
            `${blocked.length} affectation(s) ont déjà un paiement supérieur au nouveau montant.`,
          );
        return {
          preview,
          assignments: structure.assignments.length,
          blocked: blocked.length,
          oldTotal: num(oldTotal),
          newTotal: num(newTotal),
          difference: num(newTotal - oldTotal),
        };
      });
    },
    async impact(schoolId: string, id: string) {
      return withSchoolScope(db, schoolId, async (tx) => {
        const structure = await tx.feeStructure.findFirst({ where: { id, schoolId } });
        if (!structure) throw errors.notFound('Structure introuvable.');
        const count = await tx.enrollment.count({
          where: {
            schoolId,
            academicYearId: structure.academicYearId,
            ...(structure.classId ? { classId: structure.classId } : {}),
            ...(structure.studentCategoryId
              ? { studentCategoryId: structure.studentCategoryId }
              : {}),
            ...(structure.gradeLevelId ? { class: { gradeLevelId: structure.gradeLevelId } } : {}),
          },
        });
        return { studentCount: count, totalAmount: count * Number(structure.amount) };
      });
    },
    async assignFees(schoolId: string, enrollmentId: string) {
      return withSchoolScope(db, schoolId, async (tx) => {
        const ids = await assignMandatoryFees(tx, schoolId, enrollmentId);
        await audit.log(
          {
            action: AuditAction.STUDENT_FEES_ASSIGNED,
            entityType: 'enrollment',
            entityId: enrollmentId,
            schoolId,
            after: { assignments: ids.length },
          },
          tx,
        );
        return { created: ids.length };
      });
    },
    async enrollmentFees(schoolId: string, enrollmentId: string) {
      return withSchoolScope(db, schoolId, async (tx) => {
        const rows = await tx.studentFeeAssignment.findMany({
          where: { schoolId, enrollmentId },
          include: {
            feeType: true,
            feeStructure: true,
            installments: { orderBy: { orderIndex: 'asc' } },
          },
          orderBy: { feeType: { priority: 'asc' } },
        });
        return rows.map((row) => ({
          id: row.id,
          feeTypeName: row.feeType.name,
          structureName: row.feeStructure.name,
          originalAmount: num(row.originalAmount),
          discountAmount: num(row.discountAmount),
          finalAmount: num(row.finalAmount),
          paidAmount: num(row.paidAmount),
          status: row.status,
          installments: row.installments.map((item) => ({
            id: item.id,
            name: item.name,
            amount: num(item.amount),
            paidAmount: num(item.paidAmount),
            dueDate: item.dueDate.toISOString().slice(0, 10),
            status: item.status,
          })),
        }));
      });
    },
    async balance(schoolId: string, enrollmentId: string) {
      return withSchoolScope(db, schoolId, async (tx) => {
        const rows = await tx.$queryRaw<
          Array<{
            enrollment_id: string;
            total_gross: bigint;
            total_discount: bigint;
            total_due: bigint;
            total_paid: bigint;
            balance: bigint;
          }>
        >`SELECT * FROM v_enrollment_balance WHERE enrollment_id = ${enrollmentId}::uuid AND school_id = ${schoolId}::uuid`;
        const row = rows[0];
        if (!row) throw errors.notFound('Inscription introuvable.');
        const due = num(row.total_due);
        const paid = num(row.total_paid);
        return {
          enrollmentId: row.enrollment_id,
          totalGross: num(row.total_gross),
          totalDiscount: num(row.total_discount),
          totalDue: due,
          totalPaid: paid,
          balance: num(row.balance),
          progression: due === 0 ? 100 : Math.floor((paid * 100) / due),
        };
      });
    },
    async createDiscount(schoolId: string, actorId: string, input: DiscountBody) {
      return withSchoolScope(db, schoolId, async (tx) => {
        const assignment = await tx.studentFeeAssignment.findFirst({
          where: { id: input.studentFeeAssignmentId, schoolId },
        });
        if (!assignment) throw errors.notFound('Affectation introuvable.');
        const effective =
          input.type === 'PERCENTAGE'
            ? percentOf(amount(num(assignment.originalAmount)), input.value)
            : amount(input.value);
        if (effective > num(assignment.originalAmount))
          throw errors.validation('La remise dépasse le montant du frais.');
        const settings = await tx.schoolSettings.findUniqueOrThrow({ where: { schoolId } });
        const status =
          effective <= settings.discountApprovalThreshold ? 'APPROVED' : 'PENDING_APPROVAL';
        const row = await tx.discount.create({
          data: {
            studentFeeAssignmentId: assignment.id,
            type: input.type,
            value: input.value,
            amount: BigInt(effective),
            reason: input.reason,
            category: input.category,
            status,
            createdBy: actorId,
            ...(status === 'APPROVED' ? { approvedBy: actorId, approvedAt: new Date() } : {}),
          },
        });
        if (status === 'APPROVED') await recalculateAssignment(tx, assignment.id);
        await audit.log(
          {
            action: AuditAction.DISCOUNT_CREATED,
            entityType: 'discount',
            entityId: row.id,
            schoolId,
            after: { amount: effective, status },
          },
          tx,
        );
        return {
          id: row.id,
          studentFeeAssignmentId: row.studentFeeAssignmentId,
          type: row.type,
          value: Number(row.value),
          amount: num(row.amount),
          reason: row.reason,
          category: row.category,
          status: row.status,
          createdAt: row.createdAt.toISOString(),
        };
      });
    },
    async decideDiscount(schoolId: string, actorId: string, id: string, approve: boolean) {
      return withSchoolScope(db, schoolId, async (tx) => {
        const row = await tx.discount.findFirst({ where: { id, assignment: { schoolId } } });
        if (!row) throw errors.notFound('Remise introuvable.');
        if (row.status !== 'PENDING_APPROVAL')
          throw errors.conflict('Cette remise n’attend pas de décision.');
        // Double contrôle : celui qui accorde une remise au-dessus du seuil ne
        // peut pas l’approuver lui-même, comme pour les achats et les dépenses.
        if (row.createdBy === actorId)
          throw errors.forbidden('L’auteur d’une remise ne peut pas l’approuver lui-même.');
        await tx.discount.update({
          where: { id },
          data: approve
            ? { status: 'APPROVED', approvedBy: actorId, approvedAt: new Date() }
            : { status: 'REJECTED' },
        });
        if (approve) await recalculateAssignment(tx, row.studentFeeAssignmentId);
        await audit.log(
          {
            action: approve ? AuditAction.DISCOUNT_APPROVED : AuditAction.DISCOUNT_REJECTED,
            entityType: 'discount',
            entityId: id,
            schoolId,
            after: { status: approve ? 'APPROVED' : 'REJECTED' },
          },
          tx,
        );
      });
    },
  };
}

export type FinanceService = ReturnType<typeof createFinanceService>;
