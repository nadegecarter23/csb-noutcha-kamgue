import type {
  CommunicationsOverviewDto,
  CreateAnnouncementBody,
  CreateHomeworkBody,
  CreateSchoolEventBody,
  CreateSchoolMessageBody,
} from '@cplan/contracts';
import type { Database } from '../../platform/db.js';
import type { AuditService } from '../../platform/audit.js';
import { AuditAction } from '../../platform/audit.js';
import { errors } from '../../platform/errors.js';
import { withSchoolScope } from '../../platform/school-scope.js';
import { assertWritableUnit, writableUnits } from '../../platform/writable-units.js';
const iso = (v: Date) => v.toISOString();
const announcementInclude = { organizationalUnit: { select: { name: true } } } as const;
function announcementDto(row: {
  id: string;
  title: string;
  body: string;
  audience: 'ALL' | 'STAFF' | 'FAMILIES' | 'STUDENTS';
  organizationalUnitId: string | null;
  organizationalUnit: { name: string } | null;
  publishedAt: Date;
  expiresAt: Date | null;
}) {
  return {
    id: row.id,
    title: row.title,
    body: row.body,
    audience: row.audience,
    organizationalUnitId: row.organizationalUnitId,
    organizationalUnitName: row.organizationalUnit?.name ?? null,
    publishedAt: iso(row.publishedAt),
    expiresAt: row.expiresAt ? iso(row.expiresAt) : null,
  };
}
export function createCommunicationsService(db: Database, audit: AuditService) {
  return {
    async overview(
      schoolId: string,
      userId: string,
      academicYearId: string,
    ): Promise<CommunicationsOverviewDto> {
      return withSchoolScope(db, schoolId, async (tx) => {
        const [announcements, events, homework, messages, writable] = await Promise.all([
          // La RLS ne laisse voir que les annonces du complexe et des cycles autorisés.
          tx.announcement.findMany({
            where: { schoolId, OR: [{ expiresAt: null }, { expiresAt: { gte: new Date() } }] },
            include: announcementInclude,
            orderBy: { publishedAt: 'desc' },
            take: 30,
          }),
          tx.schoolEvent.findMany({
            where: { schoolId, endsAt: { gte: new Date() } },
            orderBy: { startsAt: 'asc' },
            take: 50,
          }),
          tx.homework.findMany({
            where: { schoolId, academicYearId },
            include: { class: { select: { name: true } }, subject: { select: { name: true } } },
            orderBy: { dueAt: 'asc' },
            take: 100,
          }),
          tx.schoolMessage.findMany({
            where: { schoolId, OR: [{ senderUserId: userId }, { recipientUserId: userId }] },
            orderBy: { sentAt: 'desc' },
            take: 100,
          }),
          writableUnits(tx, schoolId),
        ]);
        const ids = [...new Set(messages.flatMap((x) => [x.senderUserId, x.recipientUserId]))];
        const users = await tx.user.findMany({
          where: { id: { in: ids } },
          select: { id: true, firstName: true, lastName: true },
        });
        const names = new Map(users.map((x) => [x.id, `${x.firstName} ${x.lastName}`]));
        return {
          announcements: announcements.map(announcementDto),
          events: events.map((x) => ({ ...x, startsAt: iso(x.startsAt), endsAt: iso(x.endsAt) })),
          homework: homework.map((x) => ({
            id: x.id,
            academicYearId: x.academicYearId,
            classId: x.classId,
            className: x.class.name,
            subjectId: x.subjectId,
            subjectName: x.subject.name,
            title: x.title,
            instructions: x.instructions,
            dueAt: iso(x.dueAt),
            status: x.status,
          })),
          messages: messages.map((x) => ({
            ...x,
            senderName: names.get(x.senderUserId) ?? 'Utilisateur',
            recipientName: names.get(x.recipientUserId) ?? 'Utilisateur',
            sentAt: iso(x.sentAt),
            readAt: x.readAt ? iso(x.readAt) : null,
          })),
          writable,
        };
      });
    },
    async announce(schoolId: string, userId: string, input: CreateAnnouncementBody) {
      return withSchoolScope(db, schoolId, async (tx) => {
        const organizationalUnitId = input.organizationalUnitId ?? null;
        if (organizationalUnitId) await assertWritableUnit(tx, schoolId, organizationalUnitId);
        else if (!(await writableUnits(tx, schoolId)).schoolWide)
          throw errors.forbidden(
            'Seul un périmètre global peut publier pour tout le complexe. Choisissez un cycle.',
          );
        const row = await tx.announcement.create({
          data: {
            schoolId,
            createdByUserId: userId,
            organizationalUnitId,
            title: input.title,
            body: input.body,
            audience: input.audience,
            ...(input.expiresAt && { expiresAt: new Date(input.expiresAt) }),
          },
          include: announcementInclude,
        });
        await audit.log(
          {
            action: AuditAction.ANNOUNCEMENT_CREATED,
            entityType: 'announcement',
            entityId: row.id,
            schoolId,
            after: input,
          },
          tx,
        );
        return announcementDto(row);
      });
    },
    async event(schoolId: string, input: CreateSchoolEventBody) {
      return withSchoolScope(db, schoolId, async (tx) => {
        const row = await tx.schoolEvent.create({
          data: {
            schoolId,
            title: input.title,
            audience: input.audience,
            startsAt: new Date(input.startsAt),
            endsAt: new Date(input.endsAt),
            ...(input.description !== undefined && { description: input.description }),
            ...(input.location !== undefined && { location: input.location }),
          },
        });
        await audit.log(
          {
            action: AuditAction.SCHOOL_EVENT_CREATED,
            entityType: 'school_event',
            entityId: row.id,
            schoolId,
            after: input,
          },
          tx,
        );
        return { ...row, startsAt: iso(row.startsAt), endsAt: iso(row.endsAt) };
      });
    },
    async homework(schoolId: string, input: CreateHomeworkBody) {
      return withSchoolScope(db, schoolId, async (tx) => {
        const [classroom, subject] = await Promise.all([
          tx.class.findFirst({
            where: { id: input.classId, schoolId, academicYearId: input.academicYearId },
          }),
          tx.subject.findFirst({ where: { id: input.subjectId, schoolId } }),
        ]);
        if (!classroom || !subject) throw errors.validation('Classe ou matière invalide.');
        const row = await tx.homework.create({
          data: { schoolId, ...input, dueAt: new Date(input.dueAt) },
        });
        await audit.log(
          {
            action: AuditAction.HOMEWORK_CREATED,
            entityType: 'homework',
            entityId: row.id,
            schoolId,
            after: input,
          },
          tx,
        );
        return {
          ...row,
          className: classroom.name,
          subjectName: subject.name,
          dueAt: iso(row.dueAt),
        };
      });
    },
    async message(schoolId: string, userId: string, input: CreateSchoolMessageBody) {
      return withSchoolScope(db, schoolId, async (tx) => {
        const recipient = await tx.user.findFirst({
          where: { id: input.recipientUserId, userRoles: { some: { schoolId } } },
          select: { firstName: true, lastName: true },
        });
        const sender = await tx.user.findUnique({
          where: { id: userId },
          select: { firstName: true, lastName: true },
        });
        if (!recipient) throw errors.notFound('Destinataire introuvable dans cet établissement.');
        const row = await tx.schoolMessage.create({
          data: { schoolId, senderUserId: userId, ...input },
        });
        await audit.log(
          {
            action: AuditAction.SCHOOL_MESSAGE_SENT,
            entityType: 'school_message',
            entityId: row.id,
            schoolId,
            after: { recipientUserId: input.recipientUserId, subject: input.subject },
          },
          tx,
        );
        return {
          ...row,
          senderName: sender ? `${sender.firstName} ${sender.lastName}` : 'Utilisateur',
          recipientName: `${recipient.firstName} ${recipient.lastName}`,
          sentAt: iso(row.sentAt),
          readAt: null,
        };
      });
    },
  };
}
export type CommunicationsService = ReturnType<typeof createCommunicationsService>;
