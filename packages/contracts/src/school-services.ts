import { z } from 'zod';
import { idSchema } from './primitives.js';
export const libraryBookSchema = z.object({
  id: idSchema,
  isbn: z.string().nullable(),
  title: z.string(),
  author: z.string(),
  stock: z.number().int(),
  available: z.number().int(),
});
export const libraryLoanSchema = z.object({
  id: idSchema,
  bookId: idSchema,
  bookTitle: z.string(),
  enrollmentId: idSchema,
  studentName: z.string(),
  borrowedAt: z.string().date(),
  dueAt: z.string().date(),
  returnedAt: z.string().date().nullable(),
  status: z.enum(['BORROWED', 'RETURNED', 'OVERDUE']),
});
export const canteenMealSchema = z.object({
  id: idSchema,
  date: z.string().date(),
  menu: z.string(),
  planned: z.number().int(),
  served: z.number().int(),
});
export const transportRouteSchema = z.object({
  id: idSchema,
  name: z.string(),
  vehicle: z.string(),
  driver: z.string(),
  capacity: z.number().int(),
  enrolled: z.number().int(),
  stops: z.string().array(),
  feeStructureId: idSchema.nullable(),
  status: z.enum(['ACTIVE', 'INACTIVE']),
});
export const inventoryItemSchema = z.object({
  id: idSchema,
  code: z.string(),
  name: z.string(),
  unit: z.string(),
  quantity: z.number(),
  reorderLevel: z.number(),
  status: z.enum(['OK', 'LOW', 'OUT']),
});
export const schoolServicesOverviewSchema = z.object({
  books: libraryBookSchema.array(),
  loans: libraryLoanSchema.array(),
  meals: canteenMealSchema.array(),
  routes: transportRouteSchema.array(),
  inventory: inventoryItemSchema.array(),
});
export const createBookBodySchema = z
  .object({
    isbn: z.string().trim().max(30).nullable().optional(),
    title: z.string().trim().min(2).max(200),
    author: z.string().trim().min(2).max(160),
    stock: z.number().int().min(1).max(10000),
  })
  .strict();
export const createLoanBodySchema = z
  .object({ bookId: idSchema, enrollmentId: idSchema, dueAt: z.string().date() })
  .strict();
export const createMealBodySchema = z
  .object({
    date: z.string().date(),
    menu: z.string().trim().min(3).max(1000),
    planned: z.number().int().nonnegative(),
    served: z.number().int().nonnegative(),
  })
  .strict()
  .refine((v) => v.served <= v.planned, {
    message: 'Le nombre servi dépasse le nombre planifié.',
    path: ['served'],
  });
export const createTransportRouteBodySchema = z
  .object({
    name: z.string().trim().min(2).max(120),
    vehicle: z.string().trim().min(2).max(120),
    driver: z.string().trim().min(2).max(120),
    capacity: z.number().int().min(1).max(500),
    stops: z.array(z.string().trim().min(1)).min(1),
  })
  .strict();
export const createInventoryItemBodySchema = z
  .object({
    code: z.string().trim().min(1).max(30),
    name: z.string().trim().min(2).max(160),
    unit: z.string().trim().min(1).max(30),
    quantity: z.number().nonnegative(),
    reorderLevel: z.number().nonnegative(),
  })
  .strict();
export const inventoryMovementBodySchema = z
  .object({
    quantity: z.number().refine((v) => v !== 0),
    reason: z.string().trim().min(2).max(500),
  })
  .strict();
export const assignTransportBodySchema = z
  .object({ routeId: idSchema, enrollmentId: idSchema })
  .strict();
export const createTransportRouteWithFinanceBodySchema = createTransportRouteBodySchema
  .extend({ feeStructureId: idSchema.nullable().optional() })
  .strict();
export type SchoolServicesOverviewDto = z.infer<typeof schoolServicesOverviewSchema>;
