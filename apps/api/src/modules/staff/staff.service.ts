import type {
  CreateLeaveBody,
  LeaveDecisionBody,
  StaffLeaveDto,
  StaffMemberDto,
  StaffOrganizationReferenceDto,
  UpdateStaffBody,
} from '@cplan/contracts';
import type { Database } from '../../platform/db.js';
import type { AuditService } from '../../platform/audit.js';
import { AuditAction } from '../../platform/audit.js';
import { errors } from '../../platform/errors.js';
import { withSchoolScope } from '../../platform/school-scope.js';

const day = (value: Date | null) => (value ? value.toISOString().slice(0, 10) : null);
const profileInclude = {
  user: { select: { firstName: true, lastName: true, phone: true, email: true } },
  department: true,
  position: true,
  supervisor: { include: { user: { select: { firstName: true, lastName: true } } } },
  assignments: {
    where: { status: 'ACTIVE' as const },
    include: { organizationalUnit: true, languageSection: true, educationTrack: true, class: true },
    orderBy: { isPrimary: 'desc' as const },
  },
} as const;

function leaveDto(row: {
  id: string;
  staffProfileId: string;
  type: string;
  startsAt: Date;
  endsAt: Date;
  reason: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  staff: { user: { firstName: string; lastName: string } };
}): StaffLeaveDto {
  return {
    id: row.id,
    staffProfileId: row.staffProfileId,
    staffName: `${row.staff.user.firstName} ${row.staff.user.lastName}`,
    type: row.type,
    startsAt: day(row.startsAt) ?? '',
    endsAt: day(row.endsAt) ?? '',
    reason: row.reason,
    status: row.status,
  };
}

export function createStaffService(db: Database, audit: AuditService) {
  async function list(schoolId: string, academicYearId?: string): Promise<StaffMemberDto[]> {
    return withSchoolScope(db, schoolId, async (tx) => {
      const [profiles, assignments] = await Promise.all([
        tx.staffProfile.findMany({
          where: { schoolId },
          include: profileInclude,
          orderBy: { user: { lastName: 'asc' } },
        }),
        tx.teachingAssignment.findMany({
          where: {
            schoolId,
            status: { not: 'INACTIVE' },
            ...(academicYearId && { academicYearId }),
          },
          select: { teacherUserId: true, weeklyHours: true },
        }),
      ]);
      const hours = new Map<string, number>();
      for (const item of assignments)
        if (item.teacherUserId)
          hours.set(item.teacherUserId, (hours.get(item.teacherUserId) ?? 0) + item.weeklyHours);
      return profiles.map((row) => ({
        id: row.id,
        userId: row.userId,
        employeeNumber: row.employeeNumber,
        fullName: `${row.user.firstName} ${row.user.lastName}`,
        phone: row.user.phone,
        email: row.user.email,
        jobTitle: row.jobTitle,
        employmentType: row.employmentType,
        hiredAt: day(row.hiredAt),
        contractEnd: day(row.contractEnd),
        weeklyWorkload: row.weeklyWorkload,
        status: row.status,
        teachingHours: hours.get(row.userId) ?? 0,
        departmentId: row.departmentId,
        departmentName: row.department?.name ?? null,
        positionId: row.positionId,
        positionName: row.position?.name ?? null,
        supervisorId: row.supervisorId,
        supervisorName: row.supervisor
          ? `${row.supervisor.user.firstName} ${row.supervisor.user.lastName}`
          : null,
        isStaffDelegate: row.isStaffDelegate,
        assignments: row.assignments.map((item) => ({
          id: item.id,
          scopeType: item.scopeType,
          label:
            item.organizationalUnit?.name ??
            item.languageSection?.name ??
            item.educationTrack?.name ??
            item.class?.name ??
            'Établissement',
          isPrimary: item.isPrimary,
        })),
      }));
    });
  }
  return {
    list,
    async organization(schoolId: string, actorId: string): Promise<StaffOrganizationReferenceDto> {
      return withSchoolScope(db, schoolId, async (tx) => {
        const [departments, positions] = await Promise.all([
          tx.staffDepartment.findMany({
            where: { schoolId, status: 'ACTIVE' },
            include: { organizationalUnit: { select: { name: true } } },
            orderBy: { name: 'asc' },
          }),
          tx.staffPosition.findMany({
            where: { schoolId, status: 'ACTIVE' },
            orderBy: [{ rank: 'asc' }, { name: 'asc' }],
          }),
        ]);
        await audit.log(
          {
            action: AuditAction.STAFF_DIRECTORY_READ,
            entityType: 'staff_directory',
            entityId: schoolId,
            schoolId,
            after: { actorId },
          },
          tx,
        );
        return {
          departments: departments.map((x) => ({
            id: x.id,
            code: x.code,
            name: x.name,
            organizationalUnitId: x.organizationalUnitId,
            organizationalUnitName: x.organizationalUnit?.name ?? null,
          })),
          positions: positions.map((x) => ({
            id: x.id,
            code: x.code,
            name: x.name,
            departmentId: x.departmentId,
            rank: x.rank,
            isManagement: x.isManagement,
          })),
        };
      });
    },
    async update(schoolId: string, id: string, input: UpdateStaffBody): Promise<StaffMemberDto> {
      await withSchoolScope(db, schoolId, async (tx) => {
        const before = await tx.staffProfile.findFirst({ where: { id, schoolId } });
        if (!before) throw errors.notFound('Membre du personnel introuvable.');
        if (input.supervisorId === id)
          throw errors.validation('Un collaborateur ne peut pas être son propre supérieur.');
        const refs = [
          input.departmentId
            ? tx.staffDepartment.count({ where: { id: input.departmentId, schoolId } })
            : Promise.resolve(1),
          input.positionId
            ? tx.staffPosition.count({ where: { id: input.positionId, schoolId } })
            : Promise.resolve(1),
          input.supervisorId
            ? tx.staffProfile.count({ where: { id: input.supervisorId, schoolId } })
            : Promise.resolve(1),
        ];
        if ((await Promise.all(refs)).some((x) => x === 0))
          throw errors.validation('Référence organisationnelle hors établissement.');
        const data = {
          ...(input.employeeNumber !== undefined && { employeeNumber: input.employeeNumber }),
          ...(input.jobTitle !== undefined && { jobTitle: input.jobTitle }),
          ...(input.employmentType !== undefined && { employmentType: input.employmentType }),
          ...(input.weeklyWorkload !== undefined && { weeklyWorkload: input.weeklyWorkload }),
          ...(input.status !== undefined && { status: input.status }),
          ...(input.hiredAt !== undefined && {
            hiredAt: input.hiredAt ? new Date(input.hiredAt) : null,
          }),
          ...(input.contractEnd !== undefined && {
            contractEnd: input.contractEnd ? new Date(input.contractEnd) : null,
          }),
          ...(input.departmentId !== undefined && { departmentId: input.departmentId }),
          ...(input.positionId !== undefined && { positionId: input.positionId }),
          ...(input.supervisorId !== undefined && { supervisorId: input.supervisorId }),
          ...(input.isStaffDelegate !== undefined && { isStaffDelegate: input.isStaffDelegate }),
        };
        const after = await tx.staffProfile.update({ where: { id }, data });
        await audit.log(
          {
            action: AuditAction.STAFF_PROFILE_UPDATED,
            entityType: 'staff_profile',
            entityId: id,
            schoolId,
            before,
            after,
          },
          tx,
        );
      });
      const rows = await list(schoolId);
      const result = rows.find((row) => row.id === id);
      if (!result) throw errors.notFound('Membre du personnel introuvable.');
      return result;
    },
    async leaves(schoolId: string): Promise<StaffLeaveDto[]> {
      return withSchoolScope(db, schoolId, async (tx) =>
        (
          await tx.staffLeave.findMany({
            where: { schoolId },
            include: { staff: { include: profileInclude } },
            orderBy: { startsAt: 'desc' },
          })
        ).map(leaveDto),
      );
    },
    async createLeave(schoolId: string, input: CreateLeaveBody): Promise<StaffLeaveDto> {
      return withSchoolScope(db, schoolId, async (tx) => {
        const staff = await tx.staffProfile.findFirst({
          where: { id: input.staffProfileId, schoolId },
        });
        if (!staff) throw errors.notFound('Membre du personnel introuvable.');
        const overlap = await tx.staffLeave.findFirst({
          where: {
            schoolId,
            staffProfileId: staff.id,
            status: { in: ['PENDING', 'APPROVED'] },
            startsAt: { lte: new Date(input.endsAt) },
            endsAt: { gte: new Date(input.startsAt) },
          },
        });
        if (overlap) throw errors.conflict('Une demande de congé chevauche déjà cette période.');
        const created = await tx.staffLeave.create({
          data: {
            schoolId,
            staffProfileId: staff.id,
            type: input.type,
            startsAt: new Date(input.startsAt),
            endsAt: new Date(input.endsAt),
            reason: input.reason,
          },
          include: { staff: { include: profileInclude } },
        });
        await audit.log(
          {
            action: AuditAction.STAFF_LEAVE_CREATED,
            entityType: 'staff_leave',
            entityId: created.id,
            schoolId,
            after: input,
          },
          tx,
        );
        return leaveDto(created);
      });
    },
    async decideLeave(
      schoolId: string,
      id: string,
      input: LeaveDecisionBody,
    ): Promise<StaffLeaveDto> {
      return withSchoolScope(db, schoolId, async (tx) => {
        const before = await tx.staffLeave.findFirst({
          where: { id, schoolId },
          include: { staff: { include: profileInclude } },
        });
        if (!before) throw errors.notFound('Demande de congé introuvable.');
        if (before.status !== 'PENDING') throw errors.conflict('Cette demande a déjà été traitée.');
        const updated = await tx.staffLeave.update({
          where: { id },
          data: { status: input.status, decidedAt: new Date() },
          include: { staff: { include: profileInclude } },
        });
        const today = new Date();
        today.setUTCHours(0, 0, 0, 0);
        if (input.status === 'APPROVED' && updated.startsAt <= today && updated.endsAt >= today)
          await tx.staffProfile.update({
            where: { id: updated.staffProfileId },
            data: { status: 'ON_LEAVE' },
          });
        await audit.log(
          {
            action: AuditAction.STAFF_LEAVE_DECIDED,
            entityType: 'staff_leave',
            entityId: id,
            schoolId,
            before,
            after: updated,
          },
          tx,
        );
        return leaveDto(updated);
      });
    },
  };
}
export type StaffService = ReturnType<typeof createStaffService>;
