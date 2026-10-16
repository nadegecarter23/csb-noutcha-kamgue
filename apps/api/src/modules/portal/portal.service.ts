import type { PortalOverviewDto } from '@cplan/contracts';
import type { Database } from '../../platform/db.js';
import { withSchoolScope } from '../../platform/school-scope.js';
const iso = (v: Date) => v.toISOString();
const clock = (v: Date) => v.toISOString().slice(11, 16);
function nextLesson(day: number, time: Date) {
  const now = new Date(),
    result = new Date(now);
  const delta = (day - now.getDay() + 7) % 7;
  result.setDate(now.getDate() + delta);
  result.setHours(time.getUTCHours(), time.getUTCMinutes(), 0, 0);
  if (result <= now) result.setDate(result.getDate() + 7);
  return result;
}
export function createPortalService(db: Database) {
  return {
    async overview(
      schoolId: string,
      userId: string,
      academicYearId: string,
    ): Promise<PortalOverviewDto> {
      return withSchoolScope(db, schoolId, async (tx) => {
        const [user, staff, guardian, student] = await Promise.all([
          tx.user.findUniqueOrThrow({
            where: { id: userId },
            select: { firstName: true, lastName: true },
          }),
          tx.staffProfile.findFirst({
            where: { schoolId, userId, status: { in: ['ACTIVE', 'ON_LEAVE'] } },
          }),
          tx.guardian.findFirst({ where: { schoolId, userId, status: 'ACTIVE' } }),
          tx.student.findFirst({ where: { schoolId, portalUserId: userId, status: 'ACTIVE' } }),
        ]);
        let mode: 'TEACHER' | 'PARENT' | 'STUDENT' | 'STAFF' = staff
          ? 'STAFF'
          : guardian
            ? 'PARENT'
            : student
              ? 'STUDENT'
              : 'STAFF';
        const assignments = staff
          ? await tx.teachingAssignment.findMany({
              where: { schoolId, academicYearId, teacherUserId: userId, status: 'ACTIVE' },
              select: {
                id: true,
                classId: true,
                class: { select: { organizationalUnitId: true } },
              },
            })
          : [];
        if (assignments.length) mode = 'TEACHER';
        const studentIds = guardian
          ? (
              await tx.studentGuardian.findMany({
                where: { guardianId: guardian.id, status: 'ACCEPTED' },
                select: { studentId: true },
              })
            ).map((x) => x.studentId)
          : student
            ? [student.id]
            : [];
        const enrollments = studentIds.length
          ? await tx.enrollment.findMany({
              where: { schoolId, academicYearId, studentId: { in: studentIds }, status: 'ACTIVE' },
              include: {
                student: { select: { firstName: true, lastName: true } },
                class: { select: { name: true, organizationalUnitId: true } },
                attendanceRecords: { select: { mark: true } },
                reportCards: {
                  where: { status: 'PUBLISHED' },
                  select: { overallAverage: true },
                  orderBy: { publishedAt: 'desc' },
                  take: 1,
                },
              },
            })
          : [];
        const learners = enrollments.map((x) => {
          // Un élève en retard est présent en classe ; seules les absences
          // (justifiées ou non) réduisent le taux de présence.
          const counted = x.attendanceRecords.length,
            present = x.attendanceRecords.filter(
              (a) => a.mark === 'PRESENT' || a.mark === 'LATE',
            ).length;
          // Les moyennes sont stockées en centièmes de point (1436 = 14,36/20).
          const storedAverage = x.reportCards[0]?.overallAverage;
          return {
            id: x.studentId,
            name: `${x.student.firstName} ${x.student.lastName}`,
            className: x.class?.name ?? null,
            attendanceRate: counted ? Math.round((present * 10000) / counted) / 100 : null,
            average:
              storedAverage === null || storedAverage === undefined ? null : storedAverage / 100,
          };
        });
        const classIds = [
          ...new Set(
            mode === 'TEACHER'
              ? assignments.map((x) => x.classId)
              : enrollments.flatMap((x) => (x.classId ? [x.classId] : [])),
          ),
        ];
        const audience =
          mode === 'PARENT'
            ? (['ALL', 'FAMILIES'] as const)
            : mode === 'STUDENT'
              ? (['ALL', 'STUDENTS'] as const)
              : (['ALL', 'STAFF'] as const);
        // Annonces du complexe et des cycles fréquentés. La RLS applique la même
        // règle ; ce filtre la double pour les familles, élèves et enseignants.
        const memberUnitIds = [
          ...new Set(
            (mode === 'TEACHER'
              ? assignments.map((x) => x.class.organizationalUnitId)
              : enrollments.map((x) => x.class?.organizationalUnitId)
            ).filter((id): id is string => Boolean(id)),
          ),
        ];
        const unitFilter =
          mode === 'STAFF'
            ? {}
            : {
                OR: [
                  { organizationalUnitId: null },
                  { organizationalUnitId: { in: memberUnitIds } },
                ],
              };
        const [announcements, homework, timetable] = await Promise.all([
          tx.announcement.findMany({
            where: {
              schoolId,
              audience: { in: [...audience] },
              AND: [{ OR: [{ expiresAt: null }, { expiresAt: { gte: new Date() } }] }, unitFilter],
            },
            include: { organizationalUnit: { select: { name: true } } },
            orderBy: { publishedAt: 'desc' },
            take: 8,
          }),
          classIds.length
            ? tx.homework.findMany({
                where: { schoolId, academicYearId, classId: { in: classIds }, status: 'PUBLISHED' },
                include: { class: { select: { name: true } }, subject: { select: { name: true } } },
                orderBy: { dueAt: 'asc' },
                take: 20,
              })
            : [],
          mode === 'TEACHER'
            ? tx.timetableEntry.findMany({
                where: {
                  schoolId,
                  academicYearId,
                  teachingAssignment: { teacherUserId: userId },
                  status: 'PUBLISHED',
                },
                include: {
                  class: { select: { name: true } },
                  teachingAssignment: { include: { subject: { select: { name: true } } } },
                },
                take: 20,
              })
            : classIds.length
              ? tx.timetableEntry.findMany({
                  where: {
                    schoolId,
                    academicYearId,
                    classId: { in: classIds },
                    status: 'PUBLISHED',
                  },
                  include: {
                    class: { select: { name: true } },
                    teachingAssignment: { include: { subject: { select: { name: true } } } },
                  },
                  take: 20,
                })
              : [],
        ]);
        const schedule = timetable
          .map((x) => ({
            id: x.id,
            title: x.teachingAssignment.subject.name,
            detail: `${x.class.name} · ${clock(x.startTime)}-${clock(x.endTime)}`,
            startsAt: iso(nextLesson(x.dayOfWeek, x.startTime)),
          }))
          .sort((a, b) => a.startsAt.localeCompare(b.startsAt))
          .slice(0, 8);
        const cards =
          mode === 'TEACHER'
            ? [
                {
                  label: 'Classes suivies',
                  value: String(new Set(assignments.map((x) => x.classId)).size),
                  hint: 'affectations actives',
                },
                {
                  label: 'Enseignements',
                  value: String(assignments.length),
                  hint: 'matières et classes',
                },
                {
                  label: 'Prochains cours',
                  value: String(schedule.length),
                  hint: 'emploi du temps publié',
                },
              ]
            : [
                {
                  label: mode === 'PARENT' ? 'Enfants associés' : 'Ma classe',
                  value:
                    mode === 'PARENT'
                      ? String(learners.length)
                      : (learners[0]?.className ?? 'À affecter'),
                  hint: 'année scolaire active',
                },
                {
                  label: 'Devoirs à venir',
                  value: String(homework.length),
                  hint: 'devoirs publiés',
                },
                {
                  label: 'Informations',
                  value: String(announcements.length),
                  hint: 'annonces en cours',
                },
              ];
        return {
          mode,
          displayName: `${user.firstName} ${user.lastName}`,
          cards,
          schedule,
          learners,
          announcements: announcements.map((x) => ({
            id: x.id,
            title: x.title,
            body: x.body,
            audience: x.audience,
            organizationalUnitId: x.organizationalUnitId,
            organizationalUnitName: x.organizationalUnit?.name ?? null,
            publishedAt: iso(x.publishedAt),
            expiresAt: x.expiresAt ? iso(x.expiresAt) : null,
          })),
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
        };
      });
    },
  };
}
export type PortalService = ReturnType<typeof createPortalService>;
