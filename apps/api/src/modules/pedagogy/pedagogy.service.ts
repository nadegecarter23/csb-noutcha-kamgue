import type {
  CreateSubjectBody,
  CreateTeachingAssignmentBody,
  PedagogyOverviewDto,
  SubjectDto,
  TeachingAssignmentDto,
  UpdateSubjectBody,
} from '@cplan/contracts';
import type { Database } from '../../platform/db.js';
import type { AuditService } from '../../platform/audit.js';
import { AuditAction } from '../../platform/audit.js';
import { errors } from '../../platform/errors.js';
import { withSchoolScope } from '../../platform/school-scope.js';

const assignmentInclude = {
  class: { select: { name: true } },
  subject: { select: { name: true, color: true } },
  teacher: { select: { firstName: true, lastName: true } },
} as const;

function assignmentDto(row: {
  id: string;
  academicYearId: string;
  classId: string;
  subjectId: string;
  teacherUserId: string | null;
  weeklyHours: number;
  coefficient: number;
  status: 'PLANNED' | 'ACTIVE' | 'INACTIVE';
  class: { name: string };
  subject: { name: string; color: string };
  teacher: { firstName: string; lastName: string } | null;
}): TeachingAssignmentDto {
  return {
    id: row.id,
    academicYearId: row.academicYearId,
    classId: row.classId,
    className: row.class.name,
    subjectId: row.subjectId,
    subjectName: row.subject.name,
    subjectColor: row.subject.color,
    teacherUserId: row.teacherUserId,
    teacherName: row.teacher ? `${row.teacher.firstName} ${row.teacher.lastName}` : null,
    weeklyHours: row.weeklyHours,
    coefficient: row.coefficient / 100,
    status: row.status,
  };
}

export function createPedagogyService(db: Database, audit: AuditService) {
  return {
    async listSubjects(schoolId: string): Promise<SubjectDto[]> {
      return withSchoolScope(db, schoolId, (tx) =>
        tx.subject.findMany({
          where: { schoolId },
          select: {
            id: true,
            code: true,
            name: true,
            color: true,
            status: true,
            organizationalUnitId: true,
            languageSectionId: true,
            educationTrackId: true,
          },
          orderBy: [{ status: 'asc' }, { name: 'asc' }],
        }),
      );
    },

    async createSubject(schoolId: string, input: CreateSubjectBody): Promise<SubjectDto> {
      return withSchoolScope(db, schoolId, async (tx) => {
        const duplicate = await tx.subject.findFirst({
          where: { schoolId, code: { equals: input.code, mode: 'insensitive' } },
        });
        if (duplicate) throw errors.conflict('Une matière porte déjà ce code.');
        const created = await tx.subject.create({
          data: {
            schoolId,
            code: input.code,
            name: input.name,
            color: input.color,
            organizationalUnitId: input.organizationalUnitId ?? null,
            languageSectionId: input.languageSectionId ?? null,
            educationTrackId: input.educationTrackId ?? null,
          },
        });
        await audit.log(
          {
            action: AuditAction.SUBJECT_CREATED,
            entityType: 'subject',
            entityId: created.id,
            schoolId,
            after: input,
          },
          tx,
        );
        return created;
      });
    },

    async updateSubject(
      schoolId: string,
      id: string,
      input: UpdateSubjectBody,
    ): Promise<SubjectDto> {
      return withSchoolScope(db, schoolId, async (tx) => {
        const subject = await tx.subject.findFirst({ where: { id, schoolId } });
        if (!subject) throw errors.notFound('Matière introuvable.');
        if (input.code && input.code !== subject.code) {
          const duplicate = await tx.subject.findFirst({
            where: { schoolId, id: { not: id }, code: { equals: input.code, mode: 'insensitive' } },
          });
          if (duplicate) throw errors.conflict('Une matière porte déjà ce code.');
        }
        const updated = await tx.subject.update({
          where: { id },
          data: {
            ...(input.code !== undefined && { code: input.code }),
            ...(input.name !== undefined && { name: input.name }),
            ...(input.color !== undefined && { color: input.color }),
            ...(input.status !== undefined && { status: input.status }),
            ...(input.organizationalUnitId !== undefined && {
              organizationalUnitId: input.organizationalUnitId,
            }),
            ...(input.languageSectionId !== undefined && {
              languageSectionId: input.languageSectionId,
            }),
            ...(input.educationTrackId !== undefined && {
              educationTrackId: input.educationTrackId,
            }),
          },
        });
        if (input.status === 'INACTIVE') {
          await tx.teachingAssignment.updateMany({
            where: { schoolId, subjectId: id, status: { not: 'INACTIVE' } },
            data: { status: 'INACTIVE' },
          });
        }
        await audit.log(
          {
            action: AuditAction.SUBJECT_UPDATED,
            entityType: 'subject',
            entityId: id,
            schoolId,
            before: subject,
            after: input,
          },
          tx,
        );
        return updated;
      });
    },

    async createAssignment(
      schoolId: string,
      input: CreateTeachingAssignmentBody,
    ): Promise<TeachingAssignmentDto> {
      return withSchoolScope(db, schoolId, async (tx) => {
        const [year, classRoom, subject, teacher] = await Promise.all([
          tx.academicYear.findFirst({
            where: { id: input.academicYearId, schoolId, status: { in: ['DRAFT', 'ACTIVE'] } },
          }),
          tx.class.findFirst({ where: { id: input.classId, schoolId, status: 'ACTIVE' } }),
          tx.subject.findFirst({ where: { id: input.subjectId, schoolId, status: 'ACTIVE' } }),
          input.teacherUserId
            ? tx.staffProfile.findFirst({
                where: { userId: input.teacherUserId, schoolId, status: 'ACTIVE' },
              })
            : Promise.resolve(null),
        ]);
        if (!year) throw errors.notFound('Année scolaire introuvable.');
        if (!classRoom || classRoom.academicYearId !== year.id)
          throw errors.validation('La classe ne correspond pas à cette année scolaire.');
        if (!subject) throw errors.notFound('Matière introuvable ou inactive.');
        if (
          (subject?.organizationalUnitId &&
            subject.organizationalUnitId !== classRoom?.organizationalUnitId) ||
          (subject?.languageSectionId &&
            subject.languageSectionId !== classRoom?.languageSectionId) ||
          (subject?.educationTrackId && subject.educationTrackId !== classRoom?.educationTrackId)
        )
          throw errors.validation(
            'Cette matière ne s’applique pas à la section ou à la filière de la classe.',
          );
        if (input.teacherUserId && !teacher)
          throw errors.validation(
            'L’enseignant sélectionné n’est pas un membre actif du personnel.',
          );

        const existing = await tx.teachingAssignment.findFirst({
          where: { academicYearId: year.id, classId: classRoom.id, subjectId: subject.id },
        });
        const saved = existing
          ? await tx.teachingAssignment.update({
              where: { id: existing.id },
              data: {
                teacherUserId: input.teacherUserId ?? null,
                weeklyHours: input.weeklyHours,
                coefficient: Math.round(input.coefficient * 100),
                status: input.teacherUserId ? 'ACTIVE' : 'PLANNED',
              },
              include: assignmentInclude,
            })
          : await tx.teachingAssignment.create({
              data: {
                schoolId,
                ...input,
                teacherUserId: input.teacherUserId ?? null,
                coefficient: Math.round(input.coefficient * 100),
                status: input.teacherUserId ? 'ACTIVE' : 'PLANNED',
              },
              include: assignmentInclude,
            });
        await audit.log(
          {
            action: AuditAction.TEACHING_ASSIGNMENT_SAVED,
            entityType: 'teaching_assignment',
            entityId: saved.id,
            schoolId,
            before: existing,
            after: input,
          },
          tx,
        );
        return assignmentDto(saved);
      });
    },

    async overview(schoolId: string, academicYearId: string): Promise<PedagogyOverviewDto> {
      return withSchoolScope(db, schoolId, async (tx) => {
        const [subjectCount, totalClassCount, assignments, staff] = await Promise.all([
          tx.subject.count({ where: { schoolId, status: 'ACTIVE' } }),
          tx.class.count({ where: { schoolId, academicYearId, status: 'ACTIVE' } }),
          tx.teachingAssignment.findMany({
            where: { schoolId, academicYearId, status: { not: 'INACTIVE' } },
            include: assignmentInclude,
            orderBy: [{ class: { name: 'asc' } }, { subject: { name: 'asc' } }],
          }),
          tx.staffProfile.findMany({
            where: { schoolId, status: 'ACTIVE' },
            include: { user: { select: { id: true, firstName: true, lastName: true } } },
            orderBy: { user: { lastName: 'asc' } },
          }),
        ]);
        const coveredClasses = new Set(assignments.map((item) => item.classId));
        const assignedTeachers = new Set(
          assignments.flatMap((item) => (item.teacherUserId ? [item.teacherUserId] : [])),
        );
        return {
          subjectCount,
          teacherCount: assignedTeachers.size,
          coveredClassCount: coveredClasses.size,
          totalClassCount,
          weeklyHours: assignments.reduce((total, item) => total + item.weeklyHours, 0),
          assignments: assignments.map(assignmentDto),
          teachers: staff.map((profile) => ({
            id: profile.user.id,
            name: `${profile.user.firstName} ${profile.user.lastName}`,
            jobTitle: profile.jobTitle,
          })),
        };
      });
    },
  };
}

export type PedagogyService = ReturnType<typeof createPedagogyService>;
