import type { Prisma } from '@prisma/client';
import type { AuditLogDto, AuditLogQuery } from '@cplan/contracts';
import { buildPaginationMeta } from '@cplan/contracts';
import type { Database } from '../../platform/db.js';
import { withSchoolScope } from '../../platform/school-scope.js';

const FINANCIAL_ENTITY_TYPES = [
  'payment',
  'payment_allocation',
  'receipt',
  'cash_session',
  'external_payment',
  'fee_structure',
  'fee_type',
  'student_fee_assignment',
  'discount',
  'export',
  'report',
];

function dto(row: {
  id: string;
  userId: string | null;
  actorType: string;
  action: string;
  entityType: string;
  entityId: string;
  oldValues: unknown;
  newValues: unknown;
  metadata: unknown;
  ipAddress: string | null;
  requestId: string | null;
  createdAt: Date;
  user: { firstName: string; lastName: string } | null;
}): AuditLogDto {
  return {
    id: row.id,
    userId: row.userId,
    actorName: row.user ? `${row.user.firstName} ${row.user.lastName}` : null,
    actorType: row.actorType as AuditLogDto['actorType'],
    action: row.action,
    entityType: row.entityType,
    entityId: row.entityId,
    oldValues: row.oldValues as AuditLogDto['oldValues'],
    newValues: row.newValues as AuditLogDto['newValues'],
    metadata: row.metadata as AuditLogDto['metadata'],
    ipAddress: row.ipAddress,
    requestId: row.requestId,
    createdAt: row.createdAt.toISOString(),
  };
}

export function createAuditQueryService(db: Database) {
  return {
    async list(schoolId: string, query: AuditLogQuery, financialOnly: boolean) {
      return withSchoolScope(db, schoolId, async (tx) => {
        const searchConditions: Prisma.AuditLogWhereInput[] = [];
        if (query.q)
          searchConditions.push({
            OR: [
              { action: { contains: query.q, mode: 'insensitive' } },
              { entityType: { contains: query.q, mode: 'insensitive' } },
              { entityId: { contains: query.q, mode: 'insensitive' } },
            ],
          });
        if (financialOnly)
          searchConditions.push({
            OR: [
              { entityType: { in: FINANCIAL_ENTITY_TYPES, mode: 'insensitive' } },
              { action: { startsWith: 'payment.' } },
              { action: { startsWith: 'cash_' } },
              { action: { startsWith: 'external_payment.' } },
              { action: { startsWith: 'receipt.' } },
            ],
          });
        const where: Prisma.AuditLogWhereInput = {
          schoolId,
          ...(query.from || query.to
            ? {
                createdAt: {
                  ...(query.from && { gte: new Date(query.from) }),
                  ...(query.to && { lte: new Date(query.to) }),
                },
              }
            : {}),
          ...(query.user_id && { userId: query.user_id }),
          ...(query.action && { action: { contains: query.action, mode: 'insensitive' } }),
          ...(query.entity_type && {
            entityType: { equals: query.entity_type, mode: 'insensitive' },
          }),
          ...(query.entity_id && { entityId: query.entity_id }),
          ...(query.ip && { ipAddress: query.ip }),
          ...(searchConditions.length && { AND: searchConditions }),
        };
        const skip = (query.page - 1) * query.page_size;
        const [rows, total] = await Promise.all([
          tx.auditLog.findMany({
            where,
            include: { user: { select: { firstName: true, lastName: true } } },
            orderBy: { createdAt: 'desc' },
            skip,
            take: query.page_size,
          }),
          tx.auditLog.count({ where }),
        ]);
        return {
          data: rows.map(dto),
          meta: buildPaginationMeta(query.page, query.page_size, total),
        };
      });
    },
  };
}
