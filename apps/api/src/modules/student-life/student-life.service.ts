import type { Prisma } from '@prisma/client';
import type {
  CreateHealthVisitBody,
  CreateIncidentBody,
  CreateSanctionBody,
} from '@cplan/contracts';
import type { Database } from '../../platform/db.js';
import type { AuditService } from '../../platform/audit.js';
import { AuditAction } from '../../platform/audit.js';
import { errors } from '../../platform/errors.js';
import { withSchoolScope } from '../../platform/school-scope.js';
const enrollment = { include: { student: true, class: true } } as const;
const incidentInclude = {
  enrollment,
  sanctions: { orderBy: { startsAt: 'desc' as const } },
} satisfies Prisma.StudentIncidentInclude;
type IncidentRow = Prisma.StudentIncidentGetPayload<{ include: typeof incidentInclude }>;
type HealthRow = Prisma.HealthVisitGetPayload<{ include: { enrollment: typeof enrollment } }>;
const incidentDto = (row: IncidentRow) => ({
  id: row.id,
  enrollmentId: row.enrollmentId,
  studentNumber: row.enrollment.student.studentNumber,
  studentName: `${row.enrollment.student.lastName} ${row.enrollment.student.firstName}`,
  className: row.enrollment.class?.name ?? null,
  occurredAt: row.occurredAt.toISOString(),
  category: row.category,
  severity: row.severity,
  description: row.description,
  status: row.status,
  sanctions: row.sanctions.map((item) => ({
    id: item.id,
    type: item.type,
    description: item.description,
    startsAt: item.startsAt.toISOString().slice(0, 10),
    endsAt: item.endsAt?.toISOString().slice(0, 10) ?? null,
  })),
});
const healthDto = (row: HealthRow) => ({
  id: row.id,
  enrollmentId: row.enrollmentId,
  studentNumber: row.enrollment.student.studentNumber,
  studentName: `${row.enrollment.student.lastName} ${row.enrollment.student.firstName}`,
  visitedAt: row.visitedAt.toISOString(),
  symptoms: row.symptoms,
  actionTaken: row.actionTaken,
  guardianNotified: row.guardianNotified,
  followUpAt: row.followUpAt?.toISOString() ?? null,
});
export function createStudentLifeService(db: Database, audit: AuditService) {
  return {
    async incidents(
      schoolId: string,
      input: { academicYearId: string; classId?: string; status?: 'OPEN' | 'CLOSED' },
    ) {
      return withSchoolScope(db, schoolId, async (tx) =>
        (
          await tx.studentIncident.findMany({
            where: {
              schoolId,
              ...(input.status && { status: input.status }),
              enrollment: {
                academicYearId: input.academicYearId,
                ...(input.classId && { classId: input.classId }),
              },
            },
            include: incidentInclude,
            orderBy: { occurredAt: 'desc' },
          })
        ).map(incidentDto),
      );
    },
    async createIncident(schoolId: string, input: CreateIncidentBody) {
      return withSchoolScope(db, schoolId, async (tx) => {
        const enrollmentRow = await tx.enrollment.findFirst({
          where: { id: input.enrollmentId, schoolId, status: 'ACTIVE' },
        });
        if (!enrollmentRow) throw errors.notFound('Inscription introuvable.');
        const row = await tx.studentIncident.create({
          data: {
            schoolId,
            enrollmentId: input.enrollmentId,
            occurredAt: new Date(input.occurredAt),
            category: input.category,
            severity: input.severity,
            description: input.description,
          },
          include: incidentInclude,
        });
        await audit.log(
          {
            action: AuditAction.STUDENT_INCIDENT_CREATED,
            entityType: 'student_incident',
            entityId: row.id,
            schoolId,
            after: input,
          },
          tx,
        );
        return incidentDto(row);
      });
    },
    async sanction(schoolId: string, id: string, input: CreateSanctionBody) {
      return withSchoolScope(db, schoolId, async (tx) => {
        const incident = await tx.studentIncident.findFirst({ where: { id, schoolId } });
        if (!incident) throw errors.notFound('Incident introuvable.');
        await tx.disciplinaryAction.create({
          data: {
            incidentId: id,
            type: input.type,
            description: input.description,
            startsAt: new Date(`${input.startsAt}T00:00:00Z`),
            endsAt: input.endsAt ? new Date(`${input.endsAt}T00:00:00Z`) : null,
          },
        });
        await audit.log(
          {
            action: AuditAction.DISCIPLINARY_ACTION_CREATED,
            entityType: 'student_incident',
            entityId: id,
            schoolId,
            after: input,
          },
          tx,
        );
        return incidentDto(
          await tx.studentIncident.findUniqueOrThrow({ where: { id }, include: incidentInclude }),
        );
      });
    },
    async close(schoolId: string, id: string) {
      return withSchoolScope(db, schoolId, async (tx) => {
        const result = await tx.studentIncident.updateMany({
          where: { id, schoolId, status: 'OPEN' },
          data: { status: 'CLOSED', closedAt: new Date() },
        });
        if (!result.count) throw errors.notFound('Incident ouvert introuvable.');
        await audit.log(
          {
            action: AuditAction.STUDENT_INCIDENT_CLOSED,
            entityType: 'student_incident',
            entityId: id,
            schoolId,
          },
          tx,
        );
      });
    },
    async health(schoolId: string, academicYearId: string) {
      return withSchoolScope(db, schoolId, async (tx) =>
        (
          await tx.healthVisit.findMany({
            where: { schoolId, enrollment: { academicYearId } },
            include: { enrollment },
            orderBy: { visitedAt: 'desc' },
          })
        ).map(healthDto),
      );
    },
    async createHealth(schoolId: string, input: CreateHealthVisitBody) {
      return withSchoolScope(db, schoolId, async (tx) => {
        const enrollmentRow = await tx.enrollment.findFirst({
          where: { id: input.enrollmentId, schoolId, status: 'ACTIVE' },
        });
        if (!enrollmentRow) throw errors.notFound('Inscription introuvable.');
        const row = await tx.healthVisit.create({
          data: {
            schoolId,
            enrollmentId: input.enrollmentId,
            visitedAt: new Date(input.visitedAt),
            symptoms: input.symptoms,
            actionTaken: input.actionTaken,
            guardianNotified: input.guardianNotified,
            followUpAt: input.followUpAt ? new Date(input.followUpAt) : null,
          },
          include: { enrollment },
        });
        await audit.log(
          {
            action: AuditAction.HEALTH_VISIT_CREATED,
            entityType: 'health_visit',
            entityId: row.id,
            schoolId,
            metadata: { enrollmentId: input.enrollmentId },
          },
          tx,
        );
        return healthDto(row);
      });
    },
  };
}
export type StudentLifeService = ReturnType<typeof createStudentLifeService>;
