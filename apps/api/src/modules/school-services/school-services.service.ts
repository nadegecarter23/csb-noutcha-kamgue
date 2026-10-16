import type { SchoolServicesOverviewDto } from '@cplan/contracts';
import type { Database } from '../../platform/db.js';
import type { AuditService } from '../../platform/audit.js';
import { AuditAction } from '../../platform/audit.js';
import { errors } from '../../platform/errors.js';
import { withSchoolScope } from '../../platform/school-scope.js';
const day = (v: Date) => v.toISOString().slice(0, 10);
type BookInput = { isbn?: string | null | undefined; title: string; author: string; stock: number };
type LoanInput = { bookId: string; enrollmentId: string; dueAt: string };
type MealInput = { date: string; menu: string; planned: number; served: number };
type RouteInput = {
  name: string;
  vehicle: string;
  driver: string;
  capacity: number;
  stops: string[];
  feeStructureId?: string | null | undefined;
};
type ItemInput = {
  code: string;
  name: string;
  unit: string;
  quantity: number;
  reorderLevel: number;
};
export function createSchoolServicesService(db: Database, audit: AuditService) {
  return {
    async overview(schoolId: string): Promise<SchoolServicesOverviewDto> {
      return withSchoolScope(db, schoolId, async (tx) => {
        const [books, loans, meals, routes, inventory] = await Promise.all([
          tx.libraryBook.findMany({
            where: { schoolId },
            include: { _count: { select: { loans: { where: { returnedAt: null } } } } },
            orderBy: { title: 'asc' },
          }),
          tx.libraryLoan.findMany({
            where: { schoolId },
            include: { book: { select: { title: true } } },
            orderBy: { borrowedAt: 'desc' },
            take: 100,
          }),
          tx.canteenMeal.findMany({ where: { schoolId }, orderBy: { date: 'desc' }, take: 30 }),
          tx.transportRoute.findMany({ where: { schoolId }, orderBy: { name: 'asc' } }),
          tx.inventoryItem.findMany({ where: { schoolId }, orderBy: { name: 'asc' } }),
        ]);
        const enrollmentIds = [...new Set(loans.map((x) => x.enrollmentId))];
        const enrollments = await tx.enrollment.findMany({
          where: { id: { in: enrollmentIds }, schoolId },
          include: { student: { select: { firstName: true, lastName: true } } },
        });
        const names = new Map(
          enrollments.map((x) => [x.id, `${x.student.lastName} ${x.student.firstName}`]),
        );
        const today = day(new Date());
        return {
          books: books.map((x) => ({
            id: x.id,
            isbn: x.isbn,
            title: x.title,
            author: x.author,
            stock: x.stock,
            available: x.stock - x._count.loans,
          })),
          loans: loans.map((x) => ({
            id: x.id,
            bookId: x.bookId,
            bookTitle: x.book.title,
            enrollmentId: x.enrollmentId,
            studentName: names.get(x.enrollmentId) ?? 'Élève',
            borrowedAt: day(x.borrowedAt),
            dueAt: day(x.dueAt),
            returnedAt: x.returnedAt ? day(x.returnedAt) : null,
            status: x.returnedAt ? 'RETURNED' : day(x.dueAt) < today ? 'OVERDUE' : 'BORROWED',
          })),
          meals: meals.map((x) => ({ ...x, date: day(x.date) })),
          routes: routes.map((x) => ({
            id: x.id,
            name: x.name,
            vehicle: x.vehicle,
            driver: x.driver,
            capacity: x.capacity,
            enrolled: x.enrolled,
            stops: Array.isArray(x.stops) ? x.stops.map(String) : [],
            feeStructureId: x.feeStructureId,
            status: x.status,
          })),
          inventory: inventory.map((x) => {
            const quantity = Number(x.quantity),
              reorder = Number(x.reorderLevel);
            return {
              id: x.id,
              code: x.code,
              name: x.name,
              unit: x.unit,
              quantity,
              reorderLevel: reorder,
              status: quantity <= 0 ? 'OUT' : quantity <= reorder ? 'LOW' : 'OK',
            };
          }),
        };
      });
    },
    async book(schoolId: string, input: BookInput) {
      return withSchoolScope(db, schoolId, async (tx) => {
        const row = await tx.libraryBook.create({
          data: {
            schoolId,
            title: input.title,
            author: input.author,
            stock: input.stock,
            ...(input.isbn !== undefined && { isbn: input.isbn }),
          },
        });
        await audit.log(
          {
            action: AuditAction.LIBRARY_BOOK_CREATED,
            entityType: 'library_book',
            entityId: row.id,
            schoolId,
            after: input,
          },
          tx,
        );
        return { ...row, available: row.stock };
      });
    },
    async loan(schoolId: string, input: LoanInput) {
      return withSchoolScope(db, schoolId, async (tx) => {
        const [book, enrollment] = await Promise.all([
          tx.libraryBook.findFirst({
            where: { id: input.bookId, schoolId },
            include: { _count: { select: { loans: { where: { returnedAt: null } } } } },
          }),
          tx.enrollment.findFirst({
            where: { id: input.enrollmentId, schoolId },
            include: { student: { select: { firstName: true, lastName: true } } },
          }),
        ]);
        if (!book || !enrollment) throw errors.notFound('Livre ou élève introuvable.');
        if (book._count.loans >= book.stock) throw errors.conflict('Aucun exemplaire disponible.');
        const row = await tx.libraryLoan.create({
          data: {
            schoolId,
            bookId: book.id,
            enrollmentId: enrollment.id,
            dueAt: new Date(input.dueAt),
          },
        });
        await audit.log(
          {
            action: AuditAction.LIBRARY_LOAN_CREATED,
            entityType: 'library_loan',
            entityId: row.id,
            schoolId,
            after: input,
          },
          tx,
        );
        return {
          id: row.id,
          bookId: book.id,
          bookTitle: book.title,
          enrollmentId: enrollment.id,
          studentName: `${enrollment.student.lastName} ${enrollment.student.firstName}`,
          borrowedAt: day(row.borrowedAt),
          dueAt: day(row.dueAt),
          returnedAt: null,
          status: 'BORROWED' as const,
        };
      });
    },
    async returnLoan(schoolId: string, id: string) {
      return withSchoolScope(db, schoolId, async (tx) => {
        const row = await tx.libraryLoan.findFirst({ where: { id, schoolId } });
        if (!row) throw errors.notFound('Emprunt introuvable.');
        if (row.returnedAt) throw errors.conflict('Ce livre a déjà été rendu.');
        await tx.libraryLoan.update({ where: { id }, data: { returnedAt: new Date() } });
        await audit.log(
          {
            action: AuditAction.LIBRARY_LOAN_RETURNED,
            entityType: 'library_loan',
            entityId: id,
            schoolId,
          },
          tx,
        );
      });
    },
    async meal(schoolId: string, input: MealInput) {
      return withSchoolScope(db, schoolId, async (tx) => {
        const row = await tx.canteenMeal.upsert({
          where: { schoolId_date: { schoolId, date: new Date(input.date) } },
          create: { schoolId, ...input, date: new Date(input.date) },
          update: { menu: input.menu, planned: input.planned, served: input.served },
        });
        await audit.log(
          {
            action: AuditAction.CANTEEN_MEAL_SAVED,
            entityType: 'canteen_meal',
            entityId: row.id,
            schoolId,
            after: input,
          },
          tx,
        );
        return { ...row, date: day(row.date) };
      });
    },
    async route(schoolId: string, input: RouteInput) {
      return withSchoolScope(db, schoolId, async (tx) => {
        if (input.feeStructureId) {
          const fee = await tx.feeStructure.findFirst({
            where: { id: input.feeStructureId, schoolId, status: 'ACTIVE' },
          });
          if (!fee) throw errors.validation('La structure de frais liée est invalide ou inactive.');
        }
        const row = await tx.transportRoute.create({
          data: {
            schoolId,
            name: input.name,
            vehicle: input.vehicle,
            driver: input.driver,
            capacity: input.capacity,
            stops: input.stops,
            ...(input.feeStructureId !== undefined && { feeStructureId: input.feeStructureId }),
          },
        });
        await audit.log(
          {
            action: AuditAction.TRANSPORT_ROUTE_CREATED,
            entityType: 'transport_route',
            entityId: row.id,
            schoolId,
            after: input,
          },
          tx,
        );
        return {
          ...row,
          stops: input.stops,
          feeStructureId: row.feeStructureId,
          status: row.status,
        };
      });
    },
    async assignTransport(schoolId: string, input: { routeId: string; enrollmentId: string }) {
      return withSchoolScope(db, schoolId, async (tx) => {
        const [route, enrollment] = await Promise.all([
          tx.transportRoute.findFirst({
            where: { id: input.routeId, schoolId, status: 'ACTIVE' },
            include: {
              feeStructure: {
                include: {
                  installments: { where: { status: 'ACTIVE' }, orderBy: { orderIndex: 'asc' } },
                },
              },
            },
          }),
          tx.enrollment.findFirst({
            where: { id: input.enrollmentId, schoolId, status: 'ACTIVE' },
          }),
        ]);
        if (!route || !enrollment) throw errors.notFound('Ligne ou inscription introuvable.');
        if (route.enrolled >= route.capacity)
          throw errors.conflict('Cette ligne de transport est complète.');
        const duplicate = await tx.transportEnrollment.findUnique({
          where: { routeId_enrollmentId: { routeId: route.id, enrollmentId: enrollment.id } },
        });
        if (duplicate) throw errors.conflict('Cet élève est déjà inscrit sur cette ligne.');
        let feeAssignmentId: string | null = null;
        const fee = route.feeStructure;
        if (fee) {
          if (
            fee.academicYearId !== enrollment.academicYearId ||
            (fee.classId && fee.classId !== enrollment.classId) ||
            (fee.studentCategoryId && fee.studentCategoryId !== enrollment.studentCategoryId)
          )
            throw errors.validation('La structure de frais ne correspond pas à cette inscription.');
          const existing = await tx.studentFeeAssignment.findUnique({
            where: {
              enrollmentId_feeStructureId: { enrollmentId: enrollment.id, feeStructureId: fee.id },
            },
          });
          const assignment =
            existing ??
            (await tx.studentFeeAssignment.create({
              data: {
                schoolId,
                enrollmentId: enrollment.id,
                studentId: enrollment.studentId,
                feeStructureId: fee.id,
                feeTypeId: fee.feeTypeId,
                originalAmount: fee.amount,
                finalAmount: fee.amount,
                installments: {
                  create: fee.installments.map((x) => ({
                    feeInstallmentId: x.id,
                    name: x.name,
                    amount: x.amount,
                    dueDate: x.dueDate,
                    orderIndex: x.orderIndex,
                  })),
                },
              },
            }));
          feeAssignmentId = assignment.id;
        }
        await tx.transportEnrollment.create({
          data: {
            schoolId,
            routeId: route.id,
            enrollmentId: enrollment.id,
            studentFeeAssignmentId: feeAssignmentId,
          },
        });
        const updated = await tx.transportRoute.update({
          where: { id: route.id },
          data: { enrolled: { increment: 1 } },
        });
        await audit.log(
          {
            action: AuditAction.TRANSPORT_ENROLLMENT_CREATED,
            entityType: 'transport_enrollment',
            entityId: route.id,
            schoolId,
            after: { ...input, feeAssignmentId },
          },
          tx,
        );
        return {
          id: updated.id,
          name: updated.name,
          vehicle: updated.vehicle,
          driver: updated.driver,
          capacity: updated.capacity,
          enrolled: updated.enrolled,
          stops: Array.isArray(updated.stops) ? updated.stops.map(String) : [],
          feeStructureId: updated.feeStructureId,
          status: updated.status,
        };
      });
    },
    async item(schoolId: string, input: ItemInput) {
      return withSchoolScope(db, schoolId, async (tx) => {
        const row = await tx.inventoryItem.create({ data: { schoolId, ...input } });
        await audit.log(
          {
            action: AuditAction.INVENTORY_ITEM_CREATED,
            entityType: 'inventory_item',
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
          unit: row.unit,
          quantity: Number(row.quantity),
          reorderLevel: Number(row.reorderLevel),
          status:
            Number(row.quantity) <= Number(row.reorderLevel) ? ('LOW' as const) : ('OK' as const),
        };
      });
    },
    async movement(schoolId: string, id: string, input: { quantity: number; reason: string }) {
      return withSchoolScope(db, schoolId, async (tx) => {
        const row = await tx.inventoryItem.findFirst({ where: { id, schoolId } });
        if (!row) throw errors.notFound('Article introuvable.');
        const next = Number(row.quantity) + input.quantity;
        if (next < 0) throw errors.validation('Le mouvement rendrait le stock négatif.');
        const updated = await tx.inventoryItem.update({ where: { id }, data: { quantity: next } });
        await tx.inventoryMovement.create({ data: { schoolId, itemId: id, ...input } });
        await audit.log(
          {
            action: AuditAction.INVENTORY_MOVEMENT_CREATED,
            entityType: 'inventory_item',
            entityId: id,
            schoolId,
            before: row,
            after: updated,
          },
          tx,
        );
        const reorder = Number(updated.reorderLevel);
        return {
          id: updated.id,
          code: updated.code,
          name: updated.name,
          unit: updated.unit,
          quantity: next,
          reorderLevel: reorder,
          status:
            next <= 0 ? ('OUT' as const) : next <= reorder ? ('LOW' as const) : ('OK' as const),
        };
      });
    },
  };
}
export type SchoolServicesService = ReturnType<typeof createSchoolServicesService>;
