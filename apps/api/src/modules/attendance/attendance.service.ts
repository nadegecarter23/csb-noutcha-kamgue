import type { Prisma } from '@prisma/client';
import type {
  AttendanceSessionDto,
  OpenAttendanceSessionBody,
  SaveAttendanceBody,
  UpdateJustificationBody,
} from '@cplan/contracts';
import type { Database } from '../../platform/db.js';
import type { AuditService } from '../../platform/audit.js';
import { AuditAction } from '../../platform/audit.js';
import { errors } from '../../platform/errors.js';
import { withSchoolScope } from '../../platform/school-scope.js';
import type { NotificationsService } from '../notifications/notifications.service.js';

const sessionInclude = {
  class: { select: { name: true } },
  timetableEntry: {
    include: {
      teachingAssignment: {
        include: {
          subject: { select: { name: true } },
          teacher: { select: { firstName: true, lastName: true } },
        },
      },
    },
  },
  records: {
    include: {
      enrollment: {
        include: {
          student: { select: { id: true, studentNumber: true, firstName: true, lastName: true } },
        },
      },
    },
    orderBy: { enrollment: { student: { lastName: 'asc' as const } } },
  },
} satisfies Prisma.AttendanceSessionInclude;

type SessionRow = Prisma.AttendanceSessionGetPayload<{ include: typeof sessionInclude }>;
const dateValue = (value: string): Date => new Date(`${value}T00:00:00.000Z`);
const schoolDate = (value: Date): string => value.toISOString().slice(0, 10);
const schoolTime = (value: Date): string => value.toISOString().slice(11, 16);

function toDto(row: SessionRow): AttendanceSessionDto {
  const teacher = row.timetableEntry.teachingAssignment.teacher;
  const records = row.records.map((record) => ({
    id: record.id,
    enrollmentId: record.enrollmentId,
    studentId: record.enrollment.student.id,
    studentNumber: record.enrollment.student.studentNumber,
    studentName: `${record.enrollment.student.lastName} ${record.enrollment.student.firstName}`,
    mark: record.mark,
    minutesLate: record.minutesLate,
    note: record.note,
    justificationStatus: record.justificationStatus,
    justificationNote: record.justificationNote,
  }));
  return {
    id: row.id,
    academicYearId: row.academicYearId,
    timetableEntryId: row.timetableEntryId,
    classId: row.classId,
    className: row.class.name,
    subjectName: row.timetableEntry.teachingAssignment.subject.name,
    teacherName: teacher ? `${teacher.firstName} ${teacher.lastName}` : null,
    date: schoolDate(row.date),
    startTime: schoolTime(row.timetableEntry.startTime),
    endTime: schoolTime(row.timetableEntry.endTime),
    status: row.status,
    validatedAt: row.validatedAt?.toISOString() ?? null,
    records,
    summary: {
      present: records.filter((item) => item.mark === 'PRESENT').length,
      absent: records.filter((item) => item.mark === 'ABSENT').length,
      late: records.filter((item) => item.mark === 'LATE').length,
      excused: records.filter((item) => item.mark === 'EXCUSED').length,
    },
  };
}

export function createAttendanceService(
  db: Database,
  audit: AuditService,
  notifications: NotificationsService,
) {
  const load = (schoolId: string, id: string) =>
    withSchoolScope(db, schoolId, (tx) =>
      tx.attendanceSession.findFirst({ where: { id, schoolId }, include: sessionInclude }),
    );

  return {
    async list(
      schoolId: string,
      input: { academicYearId: string; classId?: string; date: string },
    ): Promise<AttendanceSessionDto[]> {
      return withSchoolScope(db, schoolId, async (tx) => {
        const rows = await tx.attendanceSession.findMany({
          where: {
            schoolId,
            academicYearId: input.academicYearId,
            date: dateValue(input.date),
            ...(input.classId && { classId: input.classId }),
          },
          include: sessionInclude,
          orderBy: { timetableEntry: { startTime: 'asc' } },
        });
        return rows.map(toDto);
      });
    },

    async open(
      schoolId: string,
      userId: string,
      input: OpenAttendanceSessionBody,
    ): Promise<AttendanceSessionDto> {
      const row = await withSchoolScope(db, schoolId, async (tx) => {
        const date = dateValue(input.date);
        const entry = await tx.timetableEntry.findFirst({
          where: { id: input.timetableEntryId, schoolId, status: 'PUBLISHED' },
          include: { academicYear: true },
        });
        if (!entry) throw errors.notFound('Cours publié introuvable.');
        if (date < entry.academicYear.startDate || date > entry.academicYear.endDate)
          throw errors.validation('La date est hors de l’année scolaire.');
        if (date.getUTCDay() !== entry.dayOfWeek)
          throw errors.validation('La date ne correspond pas au jour planifié pour ce cours.');
        const existing = await tx.attendanceSession.findUnique({
          where: { timetableEntryId_date: { timetableEntryId: entry.id, date } },
          include: sessionInclude,
        });
        if (existing) return existing;
        const enrollments = await tx.enrollment.findMany({
          where: {
            schoolId,
            academicYearId: entry.academicYearId,
            classId: entry.classId,
            status: 'ACTIVE',
          },
          select: { id: true },
        });
        if (!enrollments.length)
          throw errors.validation('Cette classe ne contient aucune inscription active.');
        const created = await tx.attendanceSession.create({
          data: {
            schoolId,
            academicYearId: entry.academicYearId,
            timetableEntryId: entry.id,
            classId: entry.classId,
            date,
            recordedBy: userId,
            records: {
              create: enrollments.map((enrollment) => ({ schoolId, enrollmentId: enrollment.id })),
            },
          },
          include: sessionInclude,
        });
        await audit.log(
          {
            action: AuditAction.ATTENDANCE_SESSION_OPENED,
            entityType: 'attendance_session',
            entityId: created.id,
            schoolId,
            after: {
              timetableEntryId: entry.id,
              date: input.date,
              enrollmentCount: enrollments.length,
            },
          },
          tx,
        );
        return created;
      });
      return toDto(row);
    },

    async save(
      schoolId: string,
      sessionId: string,
      input: SaveAttendanceBody,
    ): Promise<AttendanceSessionDto> {
      await withSchoolScope(db, schoolId, async (tx) => {
        const session = await tx.attendanceSession.findFirst({
          where: { id: sessionId, schoolId },
        });
        if (!session) throw errors.notFound('Appel introuvable.');
        if (session.status !== 'DRAFT')
          throw errors.conflict('Un appel validé ne peut plus être modifié.');
        const valid = await tx.enrollment.count({
          where: {
            id: { in: input.records.map((item) => item.enrollmentId) },
            schoolId,
            academicYearId: session.academicYearId,
            classId: session.classId,
            status: 'ACTIVE',
          },
        });
        if (valid !== new Set(input.records.map((item) => item.enrollmentId)).size)
          throw errors.validation('Un élève ne fait pas partie de cette classe.');
        await Promise.all(
          input.records.map((record) =>
            tx.attendanceRecord.update({
              where: { sessionId_enrollmentId: { sessionId, enrollmentId: record.enrollmentId } },
              data: {
                mark: record.mark,
                minutesLate: record.mark === 'LATE' ? record.minutesLate : 0,
                note: record.note ?? null,
              },
            }),
          ),
        );
        await audit.log(
          {
            action: AuditAction.ATTENDANCE_SAVED,
            entityType: 'attendance_session',
            entityId: sessionId,
            schoolId,
            metadata: { recordCount: input.records.length },
          },
          tx,
        );
      });
      const row = await load(schoolId, sessionId);
      if (!row) throw errors.notFound('Appel introuvable.');
      return toDto(row);
    },

    async validate(
      schoolId: string,
      userId: string,
      sessionId: string,
    ): Promise<{ session: AttendanceSessionDto; alertsQueued: number }> {
      const recipients = await withSchoolScope(db, schoolId, async (tx) => {
        const session = await tx.attendanceSession.findFirst({
          where: { id: sessionId, schoolId },
          include: {
            records: {
              include: {
                enrollment: {
                  include: {
                    student: {
                      include: {
                        guardianLinks: {
                          where: { status: 'ACCEPTED', canReceiveNotifications: true },
                          include: { guardian: true },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        });
        if (!session) throw errors.notFound('Appel introuvable.');
        if (session.status === 'VALIDATED') throw errors.conflict('Cet appel est déjà validé.');
        const flagged = session.records.filter(
          (record) => record.mark === 'ABSENT' || record.mark === 'LATE',
        );
        await tx.attendanceSession.update({
          where: { id: sessionId },
          data: { status: 'VALIDATED', validatedBy: userId, validatedAt: new Date() },
        });
        await audit.log(
          {
            action: AuditAction.ATTENDANCE_VALIDATED,
            entityType: 'attendance_session',
            entityId: sessionId,
            schoolId,
            metadata: {
              absent: flagged.filter((item) => item.mark === 'ABSENT').length,
              late: flagged.filter((item) => item.mark === 'LATE').length,
            },
          },
          tx,
        );
        return flagged.map((record) => ({
          recordId: record.id,
          studentName: `${record.enrollment.student.firstName} ${record.enrollment.student.lastName}`,
          mark: record.mark,
          userIds: record.enrollment.student.guardianLinks.flatMap((link) =>
            link.guardian.userId ? [link.guardian.userId] : [],
          ),
        }));
      });
      let alertsQueued = 0;
      for (const recipient of recipients) {
        const created = await notifications.emit({
          schoolId,
          userIds: recipient.userIds,
          type: 'ATTENDANCE_ALERT',
          title: recipient.mark === 'ABSENT' ? 'Absence enregistrée' : 'Retard enregistré',
          body: `${recipient.studentName} a été marqué(e) ${recipient.mark === 'ABSENT' ? 'absent(e)' : 'en retard'}.`,
          data: { screen: 'attendance', sessionId, recordId: recipient.recordId },
          channels: ['IN_APP', 'PUSH', 'SMS'],
          critical: true,
          dedupKey: `attendance:${recipient.recordId}`,
        });
        alertsQueued += created.length;
        if (created.length)
          await withSchoolScope(db, schoolId, (tx) =>
            tx.attendanceRecord.update({
              where: { id: recipient.recordId },
              data: { alertedAt: new Date() },
            }),
          );
      }
      const row = await load(schoolId, sessionId);
      if (!row) throw errors.notFound('Appel introuvable.');
      return { session: toDto(row), alertsQueued };
    },

    async updateJustification(
      schoolId: string,
      recordId: string,
      input: UpdateJustificationBody,
    ): Promise<AttendanceSessionDto> {
      const sessionId = await withSchoolScope(db, schoolId, async (tx) => {
        const record = await tx.attendanceRecord.findFirst({
          where: { id: recordId, schoolId },
          include: { session: true },
        });
        if (!record) throw errors.notFound('Absence ou retard introuvable.');
        if (record.session.status !== 'VALIDATED')
          throw errors.conflict('Validez l’appel avant de traiter un justificatif.');
        await tx.attendanceRecord.update({
          where: { id: recordId },
          data: {
            justificationStatus: input.status,
            justificationNote: input.note,
            ...(input.status === 'ACCEPTED' && record.mark === 'ABSENT'
              ? { mark: 'EXCUSED' as const }
              : {}),
          },
        });
        await audit.log(
          {
            action: AuditAction.ATTENDANCE_JUSTIFICATION_UPDATED,
            entityType: 'attendance_record',
            entityId: recordId,
            schoolId,
            before: { status: record.justificationStatus },
            after: input,
          },
          tx,
        );
        return record.sessionId;
      });
      const row = await load(schoolId, sessionId);
      if (!row) throw errors.notFound('Appel introuvable.');
      return toDto(row);
    },
  };
}

export type AttendanceService = ReturnType<typeof createAttendanceService>;
