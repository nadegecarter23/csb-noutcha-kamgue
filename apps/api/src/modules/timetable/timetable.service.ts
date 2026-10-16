import type {
  CreateTimetableEntryBody,
  CreateTimetableRoomBody,
  TimetableEntryDto,
  TimetableRoomDto,
} from '@cplan/contracts';
import type { Database } from '../../platform/db.js';
import type { AuditService } from '../../platform/audit.js';
import { AuditAction } from '../../platform/audit.js';
import { errors } from '../../platform/errors.js';
import { withSchoolScope } from '../../platform/school-scope.js';

const timeDate = (value: string): Date => new Date(`1970-01-01T${value}:00.000Z`);
const timeText = (value: Date): string => value.toISOString().slice(11, 16);

const entryInclude = {
  class: { select: { name: true } },
  room: { select: { name: true } },
  teachingAssignment: {
    include: {
      subject: { select: { id: true, name: true, color: true } },
      teacher: { select: { id: true, firstName: true, lastName: true } },
    },
  },
} as const;

function entryDto(row: {
  id: string;
  academicYearId: string;
  teachingAssignmentId: string;
  classId: string;
  roomId: string | null;
  dayOfWeek: number;
  startTime: Date;
  endTime: Date;
  status: 'DRAFT' | 'PUBLISHED' | 'CANCELLED';
  class: { name: string };
  room: { name: string } | null;
  teachingAssignment: {
    subject: { id: string; name: string; color: string };
    teacher: { id: string; firstName: string; lastName: string } | null;
  };
}): TimetableEntryDto {
  const teacher = row.teachingAssignment.teacher;
  return {
    id: row.id,
    academicYearId: row.academicYearId,
    teachingAssignmentId: row.teachingAssignmentId,
    classId: row.classId,
    className: row.class.name,
    subjectId: row.teachingAssignment.subject.id,
    subjectName: row.teachingAssignment.subject.name,
    subjectColor: row.teachingAssignment.subject.color,
    teacherUserId: teacher?.id ?? null,
    teacherName: teacher ? `${teacher.firstName} ${teacher.lastName}` : null,
    roomId: row.roomId,
    roomName: row.room?.name ?? null,
    dayOfWeek: row.dayOfWeek,
    startTime: timeText(row.startTime),
    endTime: timeText(row.endTime),
    status: row.status,
  };
}

export function createTimetableService(db: Database, audit: AuditService) {
  return {
    async listRooms(schoolId: string): Promise<TimetableRoomDto[]> {
      return withSchoolScope(db, schoolId, (tx) =>
        tx.timetableRoom.findMany({
          where: { schoolId },
          select: { id: true, code: true, name: true, capacity: true, status: true },
          orderBy: [{ status: 'asc' }, { name: 'asc' }],
        }),
      );
    },

    async createRoom(schoolId: string, input: CreateTimetableRoomBody): Promise<TimetableRoomDto> {
      return withSchoolScope(db, schoolId, async (tx) => {
        const duplicate = await tx.timetableRoom.findFirst({
          where: { schoolId, code: { equals: input.code, mode: 'insensitive' } },
        });
        if (duplicate) throw errors.conflict('Une salle porte déjà ce code.');
        const room = await tx.timetableRoom.create({
          data: { schoolId, ...input, capacity: input.capacity ?? null },
        });
        await audit.log(
          {
            action: AuditAction.TIMETABLE_ROOM_CREATED,
            entityType: 'timetable_room',
            entityId: room.id,
            schoolId,
            after: input,
          },
          tx,
        );
        return room;
      });
    },

    async listEntries(
      schoolId: string,
      input: { academicYearId: string; classId?: string; teacherUserId?: string },
    ): Promise<TimetableEntryDto[]> {
      return withSchoolScope(db, schoolId, async (tx) => {
        const rows = await tx.timetableEntry.findMany({
          where: {
            schoolId,
            academicYearId: input.academicYearId,
            status: { not: 'CANCELLED' },
            ...(input.classId && { classId: input.classId }),
            ...(input.teacherUserId && {
              teachingAssignment: { teacherUserId: input.teacherUserId },
            }),
          },
          include: entryInclude,
          orderBy: [{ dayOfWeek: 'asc' }, { startTime: 'asc' }],
        });
        return rows.map(entryDto);
      });
    },

    async createEntry(
      schoolId: string,
      input: CreateTimetableEntryBody,
    ): Promise<TimetableEntryDto> {
      return withSchoolScope(db, schoolId, async (tx) => {
        const assignment = await tx.teachingAssignment.findFirst({
          where: {
            id: input.teachingAssignmentId,
            schoolId,
            academicYearId: input.academicYearId,
            status: { not: 'INACTIVE' },
          },
          include: { teacher: { select: { id: true } } },
        });
        if (!assignment) throw errors.notFound('Affectation pédagogique introuvable.');
        if (input.roomId) {
          const room = await tx.timetableRoom.findFirst({
            where: { id: input.roomId, schoolId, status: 'ACTIVE' },
          });
          if (!room) throw errors.notFound('Salle introuvable ou inactive.');
        }
        const startTime = timeDate(input.startTime);
        const endTime = timeDate(input.endTime);
        const conflicts = await tx.timetableEntry.findMany({
          where: {
            schoolId,
            academicYearId: input.academicYearId,
            dayOfWeek: input.dayOfWeek,
            status: { not: 'CANCELLED' },
            startTime: { lt: endTime },
            endTime: { gt: startTime },
            OR: [
              { classId: assignment.classId },
              ...(input.roomId ? [{ roomId: input.roomId }] : []),
              ...(assignment.teacherUserId
                ? [{ teachingAssignment: { teacherUserId: assignment.teacherUserId } }]
                : []),
            ],
          },
          include: {
            class: { select: { name: true } },
            room: { select: { name: true } },
            teachingAssignment: {
              include: { teacher: { select: { firstName: true, lastName: true } } },
            },
          },
        });
        if (conflicts.length) {
          const conflict = conflicts[0];
          const resource =
            conflict?.classId === assignment.classId
              ? `la classe ${conflict.class.name}`
              : input.roomId && conflict?.roomId === input.roomId
                ? `la salle ${conflict.room?.name ?? ''}`
                : `l’enseignant ${conflict?.teachingAssignment.teacher ? `${conflict.teachingAssignment.teacher.firstName} ${conflict.teachingAssignment.teacher.lastName}` : ''}`;
          throw errors.conflict(`Ce créneau chevauche déjà un cours pour ${resource}.`);
        }
        const created = await tx.timetableEntry.create({
          data: {
            schoolId,
            academicYearId: input.academicYearId,
            teachingAssignmentId: assignment.id,
            classId: assignment.classId,
            roomId: input.roomId ?? null,
            dayOfWeek: input.dayOfWeek,
            startTime,
            endTime,
          },
          include: entryInclude,
        });
        await audit.log(
          {
            action: AuditAction.TIMETABLE_ENTRY_CREATED,
            entityType: 'timetable_entry',
            entityId: created.id,
            schoolId,
            after: input,
          },
          tx,
        );
        return entryDto(created);
      });
    },

    async cancelEntry(schoolId: string, id: string): Promise<void> {
      return withSchoolScope(db, schoolId, async (tx) => {
        const entry = await tx.timetableEntry.findFirst({
          where: { id, schoolId, status: { not: 'CANCELLED' } },
        });
        if (!entry) throw errors.notFound('Créneau introuvable.');
        await tx.timetableEntry.update({ where: { id }, data: { status: 'CANCELLED' } });
        await audit.log(
          {
            action: AuditAction.TIMETABLE_ENTRY_CANCELLED,
            entityType: 'timetable_entry',
            entityId: id,
            schoolId,
            before: { status: entry.status },
            after: { status: 'CANCELLED' },
          },
          tx,
        );
      });
    },

    async publish(schoolId: string, academicYearId: string): Promise<{ published: number }> {
      return withSchoolScope(db, schoolId, async (tx) => {
        const year = await tx.academicYear.findFirst({ where: { id: academicYearId, schoolId } });
        if (!year) throw errors.notFound('Année scolaire introuvable.');
        const result = await tx.timetableEntry.updateMany({
          where: { schoolId, academicYearId, status: 'DRAFT' },
          data: { status: 'PUBLISHED' },
        });
        await audit.log(
          {
            action: AuditAction.TIMETABLE_PUBLISHED,
            entityType: 'academic_year',
            entityId: academicYearId,
            schoolId,
            metadata: { publishedEntries: result.count },
          },
          tx,
        );
        return { published: result.count };
      });
    },
  };
}

export type TimetableService = ReturnType<typeof createTimetableService>;
