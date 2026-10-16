import type {
  GuardianRelationship,
  GuardianRequestKind,
  GuardianRequestStatus,
  Prisma,
} from '@prisma/client';
import type { GuardianDto, GuardianInviteDto, StudentGuardianDto } from '@cplan/contracts';
import { requirePhone } from '@cplan/domain';
import type { Database } from '../../platform/db.js';
import type { AuditService } from '../../platform/audit.js';
import { AuditAction } from '../../platform/audit.js';
import { errors } from '../../platform/errors.js';
import { generateOpaqueToken, generateShortCode, hashToken } from '../../platform/crypto.js';
import { withPlatformScope, withSchoolScope } from '../../platform/school-scope.js';
import { buildAssociationPdf, type AssociationSheetEntry } from './association-sheet.pdf.js';

const iso = (value: Date): string => value.toISOString();
const guardianSelect = {
  id: true,
  firstName: true,
  lastName: true,
  phone: true,
  phoneSecondary: true,
  email: true,
  occupation: true,
  address: true,
  status: true,
  userId: true,
} satisfies Prisma.GuardianSelect;
type GuardianRow = Prisma.GuardianGetPayload<{ select: typeof guardianSelect }>;
const linkInclude = {
  guardian: { select: guardianSelect },
} satisfies Prisma.StudentGuardianInclude;
type LinkRow = Prisma.StudentGuardianGetPayload<{ include: typeof linkInclude }>;

function guardianDto(row: GuardianRow): GuardianDto {
  return {
    id: row.id,
    firstName: row.firstName,
    lastName: row.lastName,
    phone: row.phone,
    phoneSecondary: row.phoneSecondary,
    email: row.email,
    occupation: row.occupation,
    address: row.address,
    status: row.status,
    hasAccount: row.userId !== null,
  };
}

function linkDto(row: LinkRow): StudentGuardianDto {
  return {
    id: row.id,
    studentId: row.studentId,
    guardian: guardianDto(row.guardian),
    relationship: row.relationship,
    isPrimary: row.isPrimary,
    isFinancialResponsible: row.isFinancialResponsible,
    canPay: row.canPay,
    canViewFinances: row.canViewFinances,
    canReceiveNotifications: row.canReceiveNotifications,
    status: row.status,
    acceptedAt: row.acceptedAt ? iso(row.acceptedAt) : null,
    revokedAt: row.revokedAt ? iso(row.revokedAt) : null,
  };
}

function inviteDto(
  row: {
    id: string;
    studentId: string;
    guardianId: string | null;
    shortCode: string;
    type: 'PHONE' | 'SMS' | 'CODE' | 'QR_CODE';
    expiresAt: Date;
    maxUses: number;
    usedCount: number;
    status: 'ACTIVE' | 'USED' | 'EXPIRED' | 'REVOKED';
  },
  token?: string,
): GuardianInviteDto {
  return {
    id: row.id,
    studentId: row.studentId,
    guardianId: row.guardianId,
    shortCode: row.shortCode,
    linkUrl: token ? `https://app.cplan.cm/link/${token}` : null,
    type: row.type,
    expiresAt: iso(row.expiresAt),
    maxUses: row.maxUses,
    usedCount: row.usedCount,
    status: row.status,
  };
}

export function createGuardiansService(db: Database, audit: AuditService) {
  async function createInvite(
    tx: Prisma.TransactionClient,
    schoolId: string,
    studentId: string,
    input: {
      guardianId?: string | null | undefined;
      type?: 'PHONE' | 'SMS' | 'CODE' | 'QR_CODE' | undefined;
      maxUses?: number | undefined;
      expiresAt?: string | undefined;
    },
  ) {
    const student = await tx.student.findFirst({ where: { id: studentId, schoolId } });
    if (!student) throw errors.notFound('Élève introuvable.');
    if (
      input.guardianId &&
      !(await tx.guardian.findFirst({ where: { id: input.guardianId, schoolId } }))
    )
      throw errors.notFound('Responsable introuvable.');
    const settings = await tx.schoolSettings.findUniqueOrThrow({ where: { schoolId } });
    if (input.guardianId) {
      await tx.guardianInvite.updateMany({
        where: { schoolId, studentId, guardianId: input.guardianId, status: 'ACTIVE' },
        data: { status: 'REVOKED' },
      });
    }
    const token = generateOpaqueToken();
    let shortCode = generateShortCode();
    while (await tx.guardianInvite.findUnique({ where: { shortCode } }))
      shortCode = generateShortCode();
    const row = await tx.guardianInvite.create({
      data: {
        schoolId,
        studentId,
        guardianId: input.guardianId ?? null,
        tokenHash: hashToken(token),
        shortCode,
        type: input.type ?? 'QR_CODE',
        maxUses: input.maxUses ?? 1,
        expiresAt: input.expiresAt
          ? new Date(input.expiresAt)
          : new Date(Date.now() + settings.inviteTokenTtlDays * 86_400_000),
      },
    });
    await audit.log(
      {
        action: AuditAction.GUARDIAN_INVITE_CREATED,
        entityType: 'guardian_invite',
        entityId: row.id,
        schoolId,
        after: {
          studentId,
          guardianId: input.guardianId ?? null,
          type: row.type,
          expiresAt: row.expiresAt,
        },
      },
      tx,
    );
    return inviteDto(row, token);
  }

  return {
    async list(
      schoolId: string,
      query: { q?: string | undefined; student_id?: string | undefined },
    ) {
      return withSchoolScope(db, schoolId, async (tx) => {
        const rows = await tx.guardian.findMany({
          where: {
            schoolId,
            ...(query.q && {
              OR: [
                { firstName: { contains: query.q, mode: 'insensitive' } },
                { lastName: { contains: query.q, mode: 'insensitive' } },
                { phone: { contains: query.q } },
              ],
            }),
            ...(query.student_id && { studentLinks: { some: { studentId: query.student_id } } }),
          },
          select: guardianSelect,
          orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
          take: 50,
        });
        return rows.map(guardianDto);
      });
    },

    async create(schoolId: string, input: Record<string, unknown>) {
      return withSchoolScope(db, schoolId, async (tx) => {
        const phone = requirePhone(input.phone as string).e164;
        if (await tx.guardian.findUnique({ where: { schoolId_phone: { schoolId, phone } } }))
          throw errors.conflict('Un responsable utilise déjà ce numéro.');
        const row = await tx.guardian.create({
          data: {
            schoolId,
            firstName: input.firstName as string,
            lastName: input.lastName as string,
            phone,
            phoneSecondary: input.phoneSecondary
              ? requirePhone(input.phoneSecondary as string).e164
              : null,
            email: (input.email as string | null | undefined) ?? null,
            occupation: (input.occupation as string | null | undefined) ?? null,
            address: (input.address as string | null | undefined) ?? null,
          },
          select: guardianSelect,
        });
        await audit.log(
          {
            action: AuditAction.GUARDIAN_CREATED,
            entityType: 'guardian',
            entityId: row.id,
            schoolId,
            after: input,
          },
          tx,
        );
        return guardianDto(row);
      });
    },

    async update(schoolId: string, id: string, input: Record<string, unknown>) {
      return withSchoolScope(db, schoolId, async (tx) => {
        const before = await tx.guardian.findFirst({ where: { id, schoolId } });
        if (!before) throw errors.notFound('Responsable introuvable.');
        const phone = input.phone ? requirePhone(input.phone as string).e164 : undefined;
        if (phone && (await tx.guardian.findFirst({ where: { schoolId, phone, id: { not: id } } })))
          throw errors.conflict('Un responsable utilise déjà ce numéro.');
        const row = await tx.guardian.update({
          where: { id },
          data: {
            ...(input.firstName !== undefined && { firstName: input.firstName as string }),
            ...(input.lastName !== undefined && { lastName: input.lastName as string }),
            ...(phone && { phone }),
            ...(input.phoneSecondary !== undefined && {
              phoneSecondary: input.phoneSecondary
                ? requirePhone(input.phoneSecondary as string).e164
                : null,
            }),
            ...(input.email !== undefined && { email: input.email as string | null }),
            ...(input.occupation !== undefined && {
              occupation: input.occupation as string | null,
            }),
            ...(input.address !== undefined && { address: input.address as string | null }),
          },
          select: guardianSelect,
        });
        await audit.log(
          {
            action: AuditAction.GUARDIAN_UPDATED,
            entityType: 'guardian',
            entityId: id,
            schoolId,
            before,
            after: input,
          },
          tx,
        );
        return guardianDto(row);
      });
    },

    async studentLinks(schoolId: string, studentId: string) {
      return withSchoolScope(db, schoolId, async (tx) => {
        if (!(await tx.student.findFirst({ where: { id: studentId, schoolId } })))
          throw errors.notFound('Élève introuvable.');
        return (
          await tx.studentGuardian.findMany({
            where: { studentId },
            include: linkInclude,
            orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }],
          })
        ).map(linkDto);
      });
    },

    async link(schoolId: string, studentId: string, input: Record<string, unknown>) {
      return withSchoolScope(db, schoolId, async (tx) => {
        if (!(await tx.student.findFirst({ where: { id: studentId, schoolId } })))
          throw errors.notFound('Élève introuvable.');
        let guardian = input.guardianId
          ? await tx.guardian.findFirst({
              where: { id: input.guardianId as string, schoolId },
              select: guardianSelect,
            })
          : null;
        if (!guardian) {
          const phone = requirePhone(input.phone as string).e164;
          guardian = await tx.guardian.upsert({
            where: { schoolId_phone: { schoolId, phone } },
            create: {
              schoolId,
              firstName: input.firstName as string,
              lastName: input.lastName as string,
              phone,
              phoneSecondary: (input.phoneSecondary as string | null | undefined) ?? null,
              email: (input.email as string | null | undefined) ?? null,
            },
            update: {},
            select: guardianSelect,
          });
        }
        const existing = await tx.studentGuardian.findUnique({
          where: { studentId_guardianId: { studentId, guardianId: guardian.id } },
        });
        if (existing && !['REJECTED', 'REVOKED', 'EXPIRED'].includes(existing.status))
          throw errors.conflict('Ce responsable est déjà rattaché à cet élève.');
        const row = existing
          ? await tx.studentGuardian.update({
              where: { id: existing.id },
              data: {
                status: 'PENDING',
                rejectedAt: null,
                revokedAt: null,
                revokeReason: null,
                relationship: input.relationship as never,
              },
              include: linkInclude,
            })
          : await tx.studentGuardian.create({
              data: {
                studentId,
                guardianId: guardian.id,
                relationship: input.relationship as never,
                isPrimary: input.isPrimary as boolean,
                isFinancialResponsible: input.isFinancialResponsible as boolean,
                canPay: input.canPay as boolean,
                canViewFinances: input.canViewFinances as boolean,
                canReceiveNotifications: input.canReceiveNotifications as boolean,
              },
              include: linkInclude,
            });
        await audit.log(
          {
            action: AuditAction.GUARDIAN_LINK_CREATED,
            entityType: 'student_guardian',
            entityId: row.id,
            schoolId,
            after: input,
          },
          tx,
        );
        return linkDto(row);
      });
    },

    async updateLink(schoolId: string, id: string, input: Record<string, unknown>) {
      return withSchoolScope(db, schoolId, async (tx) => {
        const before = await tx.studentGuardian.findFirst({ where: { id, student: { schoolId } } });
        if (!before) throw errors.notFound('Association introuvable.');
        if (input.isPrimary === true && before.status === 'ACCEPTED')
          await tx.studentGuardian.updateMany({
            where: {
              studentId: before.studentId,
              status: 'ACCEPTED',
              isPrimary: true,
              id: { not: id },
            },
            data: { isPrimary: false },
          });
        const row = await tx.studentGuardian.update({
          where: { id },
          data: input as Prisma.StudentGuardianUpdateInput,
          include: linkInclude,
        });
        await audit.log(
          {
            action: AuditAction.GUARDIAN_LINK_UPDATED,
            entityType: 'student_guardian',
            entityId: id,
            schoolId,
            before,
            after: input,
          },
          tx,
        );
        return linkDto(row);
      });
    },

    async revoke(schoolId: string, id: string, reason: string, actorId: string) {
      return withSchoolScope(db, schoolId, async (tx) => {
        const before = await tx.studentGuardian.findFirst({
          where: { id, student: { schoolId } },
          include: { guardian: true },
        });
        if (!before) throw errors.notFound('Association introuvable.');
        const row = await tx.studentGuardian.update({
          where: { id },
          data: {
            status: 'REVOKED',
            revokedAt: new Date(),
            revokedBy: actorId,
            revokeReason: reason,
            isPrimary: false,
          },
          include: linkInclude,
        });
        if (before.guardian.userId)
          await tx.session.updateMany({
            where: { userId: before.guardian.userId, revokedAt: null },
            data: { revokedAt: new Date() },
          });
        await audit.log(
          {
            action: AuditAction.GUARDIAN_LINK_REVOKED,
            entityType: 'student_guardian',
            entityId: id,
            schoolId,
            before: { status: before.status },
            after: { status: 'REVOKED' },
            metadata: { reason },
          },
          tx,
        );
        return linkDto(row);
      });
    },

    async resendInvite(schoolId: string, id: string) {
      return withSchoolScope(db, schoolId, async (tx) => {
        const link = await tx.studentGuardian.findFirst({ where: { id, student: { schoolId } } });
        if (!link) throw errors.notFound('Association introuvable.');
        if (link.status === 'ACCEPTED')
          throw errors.validation('Cette association est déjà acceptée.');
        return createInvite(tx, schoolId, link.studentId, {
          guardianId: link.guardianId,
          type: 'SMS',
        });
      });
    },

    async createInvite(
      schoolId: string,
      studentId: string,
      input: Parameters<typeof createInvite>[3],
    ) {
      return withSchoolScope(db, schoolId, (tx) => createInvite(tx, schoolId, studentId, input));
    },
    async listInvites(schoolId: string, studentId: string) {
      return withSchoolScope(db, schoolId, async (tx) => {
        if (!(await tx.student.findFirst({ where: { id: studentId, schoolId } })))
          throw errors.notFound('Élève introuvable.');
        return (
          await tx.guardianInvite.findMany({
            where: { schoolId, studentId },
            orderBy: { createdAt: 'desc' },
          })
        ).map((row) => inviteDto(row));
      });
    },
    async revokeInvite(schoolId: string, id: string) {
      return withSchoolScope(db, schoolId, async (tx) => {
        const before = await tx.guardianInvite.findFirst({ where: { id, schoolId } });
        if (!before) throw errors.notFound('Invitation introuvable.');
        const row = await tx.guardianInvite.update({ where: { id }, data: { status: 'REVOKED' } });
        await audit.log(
          {
            action: AuditAction.GUARDIAN_INVITE_REVOKED,
            entityType: 'guardian_invite',
            entityId: id,
            schoolId,
            before: { status: before.status },
            after: { status: 'REVOKED' },
          },
          tx,
        );
        return inviteDto(row);
      });
    },

    async printStudentInvites(schoolId: string, studentId: string) {
      const entries = await withSchoolScope(db, schoolId, async (tx) => {
        const student = await tx.student.findFirst({
          where: { id: studentId, schoolId },
          include: {
            school: true,
            enrollments: {
              where: { status: 'ACTIVE' },
              include: { class: true },
              orderBy: { enrollmentDate: 'desc' },
              take: 1,
            },
          },
        });
        if (!student) throw errors.notFound('Élève introuvable.');
        const invite = await createInvite(tx, schoolId, student.id, { type: 'QR_CODE' });
        if (!invite.linkUrl) throw errors.internal("Impossible de générer le lien d'association.");
        return [
          {
            schoolName: student.school.name,
            studentName: `${student.firstName} ${student.lastName}`,
            studentNumber: student.studentNumber,
            className: student.enrollments[0]?.class?.name ?? null,
            shortCode: invite.shortCode,
            linkUrl: invite.linkUrl,
            expiresAt: invite.expiresAt,
          } satisfies AssociationSheetEntry,
        ];
      });
      return buildAssociationPdf(entries);
    },

    async printClassInvites(schoolId: string, classId: string) {
      const entries = await withSchoolScope(db, schoolId, async (tx) => {
        const schoolClass = await tx.class.findFirst({
          where: { id: classId, schoolId },
          include: {
            school: true,
            enrollments: {
              where: { status: 'ACTIVE' },
              include: { student: true },
              orderBy: [{ student: { lastName: 'asc' } }, { student: { firstName: 'asc' } }],
            },
          },
        });
        if (!schoolClass) throw errors.notFound('Classe introuvable.');
        if (schoolClass.enrollments.length === 0)
          throw errors.validation('Cette classe ne contient aucun élève actif.');
        const sheets: AssociationSheetEntry[] = [];
        for (const enrollment of schoolClass.enrollments) {
          const invite = await createInvite(tx, schoolId, enrollment.studentId, {
            type: 'QR_CODE',
          });
          if (!invite.linkUrl)
            throw errors.internal("Impossible de générer le lien d'association.");
          sheets.push({
            schoolName: schoolClass.school.name,
            studentName: `${enrollment.student.firstName} ${enrollment.student.lastName}`,
            studentNumber: enrollment.student.studentNumber,
            className: schoolClass.name,
            shortCode: invite.shortCode,
            linkUrl: invite.linkUrl,
            expiresAt: invite.expiresAt,
          });
        }
        return sheets;
      });
      return buildAssociationPdf(entries);
    },

    async pendingLinks(userId: string) {
      return withPlatformScope(db, async (tx) => {
        const user = await tx.user.findUnique({ where: { id: userId } });
        if (!user) throw errors.notFound('Compte introuvable.');
        const guardians = await tx.guardian.findMany({
          where: { phone: user.phone, status: 'ACTIVE' },
        });
        for (const guardian of guardians) {
          if (guardian.userId && guardian.userId !== userId) continue;
          if (!guardian.userId)
            await tx.guardian.update({ where: { id: guardian.id }, data: { userId } });
        }
        const links = await tx.studentGuardian.findMany({
          where: { guardian: { phone: user.phone, userId }, status: 'PENDING' },
          include: {
            student: {
              include: {
                school: true,
                enrollments: {
                  include: { class: true },
                  orderBy: { enrollmentDate: 'desc' },
                  take: 1,
                },
              },
            },
          },
        });
        await audit.log(
          {
            action: AuditAction.GUARDIAN_AUTO_DETECTED,
            entityType: 'user',
            entityId: userId,
            after: { proposals: links.length },
            userId,
          },
          tx,
        );
        return links.map((link) => ({
          id: link.id,
          studentId: link.studentId,
          firstName: link.student.firstName,
          lastName: link.student.lastName,
          maskedStudentNumber: `${link.student.studentNumber.slice(0, -2)}••`,
          className: link.student.enrollments[0]?.class?.name ?? null,
          schoolName: link.student.school.name,
          relationship: link.relationship,
        }));
      });
    },

    async decideLink(userId: string, id: string, accept: boolean) {
      return withPlatformScope(db, async (tx) => {
        const link = await tx.studentGuardian.findFirst({
          where: { id, guardian: { userId }, status: 'PENDING' },
          include: { student: true },
        });
        if (!link) throw errors.notFound('Proposition introuvable.');
        if (accept && link.isPrimary) {
          await tx.studentGuardian.updateMany({
            where: {
              studentId: link.studentId,
              status: 'ACCEPTED',
              isPrimary: true,
              id: { not: id },
            },
            data: { isPrimary: false },
          });
        }
        const row = await tx.studentGuardian.update({
          where: { id },
          data: accept
            ? { status: 'ACCEPTED', acceptedAt: new Date() }
            : { status: 'REJECTED', rejectedAt: new Date(), isPrimary: false },
        });
        if (!accept)
          await tx.guardianLinkRequest.create({
            data: {
              schoolId: link.student.schoolId,
              requestedByUserId: userId,
              studentId: link.studentId,
              relationship: link.relationship,
              kind: 'DISPUTE',
              message: "Ce n'est pas mon enfant.",
            },
          });
        await audit.log(
          {
            action: accept
              ? AuditAction.GUARDIAN_LINK_ACCEPTED
              : AuditAction.GUARDIAN_LINK_REJECTED,
            entityType: 'student_guardian',
            entityId: id,
            schoolId: link.student.schoolId,
            before: { status: link.status },
            after: { status: row.status },
            userId,
          },
          tx,
        );
      });
    },

    async children(userId: string) {
      return withPlatformScope(db, async (tx) => {
        const links = await tx.studentGuardian.findMany({
          where: {
            guardian: { userId, status: 'ACTIVE' },
            status: 'ACCEPTED',
            student: { status: { not: 'ARCHIVED' } },
          },
          include: {
            student: {
              include: {
                school: true,
                enrollments: {
                  include: { class: true },
                  orderBy: { enrollmentDate: 'desc' },
                  take: 1,
                },
              },
            },
          },
        });
        return links.map((link) => ({
          studentId: link.studentId,
          firstName: link.student.firstName,
          lastName: link.student.lastName,
          studentNumber: link.student.studentNumber,
          schoolId: link.student.schoolId,
          schoolName: link.student.school.name,
          className: link.student.enrollments[0]?.class?.name ?? null,
          canPay: link.canPay,
          canViewFinances: link.canViewFinances,
        }));
      });
    },

    async redeem(
      userId: string,
      input: { token?: string; shortCode?: string },
      ipAddress?: string,
      userAgent?: string,
    ) {
      return withPlatformScope(db, async (tx) => {
        const invite = await tx.guardianInvite.findFirst({
          where: input.token
            ? { tokenHash: hashToken(input.token) }
            : { shortCode: input.shortCode ?? '' },
        });
        if (!invite) throw errors.notFound('Code d’association invalide.');
        const fail = async (result: 'EXPIRED' | 'REVOKED' | 'MAX_USES') => {
          await tx.guardianInviteUse.create({
            data: {
              inviteId: invite.id,
              userId,
              ipAddress: ipAddress ?? null,
              userAgent: userAgent ?? null,
              result,
            },
          });
          throw errors.validation(
            result === 'EXPIRED'
              ? 'Ce code a expiré.'
              : result === 'REVOKED'
                ? 'Ce code a été révoqué.'
                : 'Ce code a déjà été utilisé.',
          );
        };
        if (invite.status === 'REVOKED') return fail('REVOKED');
        if (invite.expiresAt <= new Date()) return fail('EXPIRED');
        if (invite.status === 'USED' || invite.usedCount >= invite.maxUses) return fail('MAX_USES');
        const user = await tx.user.findUniqueOrThrow({ where: { id: userId } });
        let guardian = invite.guardianId
          ? await tx.guardian.findUnique({ where: { id: invite.guardianId } })
          : null;
        guardian ??= await tx.guardian.findUnique({
          where: { schoolId_phone: { schoolId: invite.schoolId, phone: user.phone } },
        });
        guardian ??= await tx.guardian.create({
          data: {
            schoolId: invite.schoolId,
            userId,
            firstName: user.firstName,
            lastName: user.lastName,
            phone: user.phone,
          },
        });
        if (guardian.userId && guardian.userId !== userId)
          throw errors.conflict('Ce numéro est déjà associé à un autre compte.');
        if (!guardian.userId)
          guardian = await tx.guardian.update({ where: { id: guardian.id }, data: { userId } });
        const link = await tx.studentGuardian.upsert({
          where: { studentId_guardianId: { studentId: invite.studentId, guardianId: guardian.id } },
          create: {
            studentId: invite.studentId,
            guardianId: guardian.id,
            relationship: 'AUTRE',
            status: 'ACCEPTED',
            acceptedAt: new Date(),
          },
          update: {
            status: 'ACCEPTED',
            acceptedAt: new Date(),
            rejectedAt: null,
            revokedAt: null,
            revokeReason: null,
          },
        });
        const usedCount = invite.usedCount + 1;
        await tx.guardianInvite.update({
          where: { id: invite.id },
          data: { usedCount, status: usedCount >= invite.maxUses ? 'USED' : 'ACTIVE' },
        });
        await tx.guardianInviteUse.create({
          data: {
            inviteId: invite.id,
            userId,
            ipAddress: ipAddress ?? null,
            userAgent: userAgent ?? null,
            result: 'SUCCESS',
          },
        });
        await audit.log(
          {
            action: AuditAction.GUARDIAN_INVITE_REDEEMED,
            entityType: 'guardian_invite',
            entityId: invite.id,
            schoolId: invite.schoolId,
            userId,
            after: { studentGuardianId: link.id },
          },
          tx,
        );
        return { studentGuardianId: link.id };
      });
    },

    async createRequest(
      userId: string,
      input: {
        schoolId: string;
        claimedStudentNumber?: string | undefined;
        claimedStudentName?: string | undefined;
        relationship: GuardianRelationship;
        message?: string | undefined;
      },
    ) {
      return withPlatformScope(db, async (tx) => {
        const student = input.claimedStudentNumber
          ? await tx.student.findFirst({
              where: { schoolId: input.schoolId, studentNumber: input.claimedStudentNumber },
            })
          : null;
        const row = await tx.guardianLinkRequest.create({
          data: {
            schoolId: input.schoolId,
            requestedByUserId: userId,
            studentId: student?.id ?? null,
            claimedStudentNumber: input.claimedStudentNumber ?? null,
            claimedStudentName: input.claimedStudentName ?? null,
            relationship: input.relationship,
            kind: 'LINK_REQUEST',
            message: input.message ?? null,
          },
        });
        await audit.log(
          {
            action: AuditAction.GUARDIAN_REQUEST_CREATED,
            entityType: 'guardian_link_request',
            entityId: row.id,
            schoolId: input.schoolId,
            userId,
            after: input,
          },
          tx,
        );
        return { id: row.id };
      });
    },

    async listRequests(
      schoolId: string,
      query: { status?: GuardianRequestStatus | undefined; kind?: GuardianRequestKind | undefined },
    ) {
      return withSchoolScope(db, schoolId, async (tx) =>
        (
          await tx.guardianLinkRequest.findMany({
            where: {
              schoolId,
              ...(query.status && { status: query.status }),
              ...(query.kind && { kind: query.kind }),
            },
            include: { requester: true },
            orderBy: { createdAt: 'desc' },
          })
        ).map((row) => ({
          id: row.id,
          kind: row.kind,
          status: row.status,
          requesterName: `${row.requester.firstName} ${row.requester.lastName}`,
          studentId: row.studentId,
          claimedStudentNumber: row.claimedStudentNumber,
          claimedStudentName: row.claimedStudentName,
          relationship: row.relationship,
          message: row.message,
          createdAt: iso(row.createdAt),
        })),
      );
    },

    async handleRequest(
      schoolId: string,
      id: string,
      approve: boolean,
      actorId: string,
      reason: string,
      relationship?: GuardianRelationship,
    ) {
      return withSchoolScope(db, schoolId, async (tx) => {
        const request = await tx.guardianLinkRequest.findFirst({
          where: { id, schoolId, status: 'PENDING' },
          include: { requester: true },
        });
        if (!request) throw errors.notFound('Demande introuvable.');
        if (approve) {
          if (!request.studentId) throw errors.validation('Identifiez d’abord l’élève concerné.');
          const guardian = await tx.guardian.upsert({
            where: { schoolId_phone: { schoolId, phone: request.requester.phone } },
            create: {
              schoolId,
              userId: request.requestedByUserId,
              firstName: request.requester.firstName,
              lastName: request.requester.lastName,
              phone: request.requester.phone,
            },
            update: { userId: request.requestedByUserId },
          });
          await tx.studentGuardian.upsert({
            where: {
              studentId_guardianId: { studentId: request.studentId, guardianId: guardian.id },
            },
            create: {
              studentId: request.studentId,
              guardianId: guardian.id,
              relationship: relationship ?? request.relationship ?? 'AUTRE',
              status: 'ACCEPTED',
              acceptedAt: new Date(),
            },
            update: {
              status: 'ACCEPTED',
              acceptedAt: new Date(),
              relationship: relationship ?? request.relationship ?? 'AUTRE',
            },
          });
        }
        const row = await tx.guardianLinkRequest.update({
          where: { id },
          data: {
            status: approve ? 'APPROVED' : 'REJECTED',
            handledBy: actorId,
            handledAt: new Date(),
            resolutionNote: reason,
          },
        });
        await audit.log(
          {
            action: approve
              ? AuditAction.GUARDIAN_REQUEST_APPROVED
              : AuditAction.GUARDIAN_REQUEST_REJECTED,
            entityType: 'guardian_link_request',
            entityId: id,
            schoolId,
            before: { status: request.status },
            after: { status: row.status },
            metadata: { reason },
          },
          tx,
        );
      });
    },
  };
}

export type GuardiansService = ReturnType<typeof createGuardiansService>;
