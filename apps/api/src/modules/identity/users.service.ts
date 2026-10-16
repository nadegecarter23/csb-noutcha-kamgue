import type { Prisma, UserStatus } from '@prisma/client';
import type {
  CreateUserBody,
  CreateRoleBody,
  Paginated,
  RoleDetail,
  UpdateUserBody,
  UpdateRoleBody,
  ReplaceAccessScopesBody,
  UserSummary,
} from '@cplan/contracts';
import { buildPaginationMeta, parseSort } from '@cplan/contracts';
import { normalizePhone } from '@cplan/domain';
import type { Database } from '../../platform/db.js';
import type { AppConfig } from '../../platform/config.js';
import type { SmsProvider } from '../../platform/sms.js';
import type { AuditService } from '../../platform/audit.js';
import { AuditAction } from '../../platform/audit.js';
import { errors } from '../../platform/errors.js';
import { maskPhone } from '../../platform/logger.js';
import type { IdentityRepository } from './identity.repository.js';
import type { AuthService } from './auth.service.js';

/**
 * Administration des comptes internes (§55, §56).
 *
 * Trois règles structurantes :
 *
 *  1. L'établissement ne définit jamais le mot de passe d'un employé. Il crée
 *     le compte, l'employé reçoit une invitation par SMS et choisit lui-même
 *     son mot de passe. Un secret transmis par un tiers n'en est plus un.
 *
 *  2. Toute modification de rôle révoque les sessions de l'utilisateur. Les
 *     permissions étant embarquées dans un jeton de 15 minutes, sans cela un
 *     droit retiré resterait actif un quart d'heure.
 *
 *  3. Aucune suppression de compte : désactivation seulement. Un compte
 *     supprimé rendrait le journal d'audit illisible.
 */

const SORTABLE = ['createdAt', 'lastName', 'lastLoginAt', 'status'] as const;

export interface UsersServiceDeps {
  db: Database;
  repository: IdentityRepository;
  auth: AuthService;
  audit: AuditService;
  sms: SmsProvider;
  config: AppConfig;
}

export function createUsersService(deps: UsersServiceDeps) {
  const { db, repository, auth, audit, sms, config } = deps;

  const USER_INCLUDE = {
    userRoles: { include: { role: { select: { code: true } } } },
    staffProfiles: true,
    accessScopes: {
      include: {
        organizationalUnit: { select: { name: true } },
        languageSection: { select: { name: true } },
        educationTrack: { select: { name: true } },
        class: { select: { name: true } },
      },
    },
  } satisfies Prisma.UserInclude;

  type UserRow = Prisma.UserGetPayload<{ include: typeof USER_INCLUDE }>;

  function toSummary(user: UserRow, schoolId: string): UserSummary {
    const profile = user.staffProfiles.find((p) => p.schoolId === schoolId);
    return {
      id: user.id,
      firstName: user.firstName,
      lastName: user.lastName,
      phone: user.phone,
      email: user.email,
      status: user.status,
      phoneVerified: user.phoneVerifiedAt !== null,
      jobTitle: profile?.jobTitle ?? null,
      roles: user.userRoles
        .filter((link) => link.schoolId === schoolId)
        .map((link) => link.role.code)
        .sort(),
      accessScopes: user.accessScopes
        .filter((scope) => scope.schoolId === schoolId)
        .map((scope) => ({
          id: scope.id,
          type: scope.scopeType,
          organizationalUnitId: scope.organizationalUnitId,
          languageSectionId: scope.languageSectionId,
          educationTrackId: scope.educationTrackId,
          classId: scope.classId,
          label:
            scope.organizationalUnit?.name ??
            scope.languageSection?.name ??
            scope.educationTrack?.name ??
            scope.class?.name ??
            (scope.scopeType === 'SCHOOL' ? "Tout l'établissement" : 'Mes affectations'),
        })),
      lastLoginAt: user.lastLoginAt?.toISOString() ?? null,
      createdAt: user.createdAt.toISOString(),
    };
  }

  /** Résout les rôles natifs par code. Échoue si l'un est inconnu. */
  async function resolveRoles(
    schoolId: string,
    codes: readonly string[],
  ): Promise<{ id: string; code: string }[]> {
    const roles = await db.role.findMany({
      where: {
        code: { in: [...codes] },
        OR: [{ schoolId: null }, { schoolId }],
      },
      select: { id: true, code: true },
    });

    const missing = codes.filter((code) => !roles.some((role) => role.code === code));
    if (missing.length > 0) {
      throw errors.validation(`Rôle inconnu : ${missing.join(', ')}.`);
    }
    return roles;
  }

  return {
    /* --- Liste ------------------------------------------------------------ */

    async list(
      schoolId: string,
      query: {
        page: number;
        page_size: number;
        sort?: string | undefined;
        q?: string | undefined;
        status?: UserStatus | undefined;
        role?: string | undefined;
      },
    ): Promise<Paginated<UserSummary>> {
      const { field, direction } = parseSort(query.sort, SORTABLE, {
        field: 'lastName',
        direction: 'asc',
      });

      // Seuls les comptes rattachés à CET établissement sont visibles :
      // première barrière d'isolation (ADR-011).
      const where: Prisma.UserWhereInput = {
        userRoles: {
          some: {
            schoolId,
            ...(query.role && { role: { code: query.role } }),
          },
        },
        ...(query.status && { status: query.status }),
        ...(query.q && {
          OR: [
            { firstName: { contains: query.q, mode: 'insensitive' } },
            { lastName: { contains: query.q, mode: 'insensitive' } },
            { email: { contains: query.q, mode: 'insensitive' } },
            { phone: { contains: query.q } },
          ],
        }),
      };

      const [rows, total] = await Promise.all([
        db.user.findMany({
          where,
          include: USER_INCLUDE,
          orderBy: { [field]: direction },
          skip: (query.page - 1) * query.page_size,
          take: query.page_size,
        }),
        db.user.count({ where }),
      ]);

      return {
        data: rows.map((row) => toSummary(row, schoolId)),
        meta: buildPaginationMeta(query.page, query.page_size, total),
      };
    },

    async getById(schoolId: string, id: string): Promise<UserSummary> {
      const user = await db.user.findFirst({
        where: { id, userRoles: { some: { schoolId } } },
        include: USER_INCLUDE,
      });
      // 404 et non 403 : on ne révèle pas l'existence d'un compte rattaché à
      // un autre établissement.
      if (!user) throw errors.notFound('Utilisateur introuvable.');
      return toSummary(user, schoolId);
    },

    /* --- Création --------------------------------------------------------- */

    async create(schoolId: string, input: CreateUserBody): Promise<UserSummary> {
      const normalized = normalizePhone(input.phone, config.DEFAULT_COUNTRY_CODE as 'CM');
      if (!normalized) {
        throw errors.validation('Numéro de téléphone invalide.', [
          { field: 'phone', message: 'Vérifiez le numéro saisi.' },
        ]);
      }
      const phone = normalized.e164;

      const roles = await resolveRoles(schoolId, input.roles);

      const existing = await repository.findUserByPhone(phone);
      if (existing) {
        // Cas réel : un parent déjà inscrit est recruté comme surveillant.
        // On ne crée pas un second compte — on rattache le compte existant.
        const alreadyHere = existing.userRoles.some((link) => link.schoolId === schoolId);
        if (alreadyHere) {
          throw errors.conflict('Un compte existe déjà pour ce numéro dans cet établissement.');
        }
      }

      if (input.email) {
        const byEmail = await repository.findUserByEmail(input.email);
        if (byEmail && byEmail.id !== existing?.id) {
          throw errors.conflict('Cette adresse e-mail est déjà utilisée.');
        }
      }

      const created = await db.$transaction(async (tx) => {
        const user =
          existing ??
          (await tx.user.create({
            data: {
              firstName: input.firstName,
              lastName: input.lastName,
              phone,
              ...(input.email && { email: input.email }),
              // Pas de mot de passe : il sera choisi par l'employé via
              // l'invitation. `PENDING_VERIFICATION` jusque-là.
              status: 'PENDING_VERIFICATION',
            },
          }));

        const staffProfile = await tx.staffProfile.upsert({
          where: { userId_schoolId: { userId: user.id, schoolId } },
          update: {
            jobTitle: input.jobTitle ?? null,
            employeeNumber: input.employeeNumber ?? null,
          },
          create: {
            userId: user.id,
            schoolId,
            jobTitle: input.jobTitle ?? null,
            employeeNumber: input.employeeNumber ?? null,
          },
        });

        await tx.userRole.createMany({
          data: roles.map((role) => ({ userId: user.id, roleId: role.id, schoolId })),
          skipDuplicates: true,
        });

        const defaultScope = input.roles.every((code) => code === 'TEACHER')
          ? ('OWN_ASSIGNMENTS' as const)
          : ('SCHOOL' as const);
        await tx.userAccessScope.create({
          data: { schoolId, userId: user.id, scopeType: defaultScope },
        });
        await tx.staffAssignment.create({
          data: {
            schoolId,
            staffProfileId: staffProfile.id,
            scopeType: defaultScope,
            isPrimary: true,
          },
        });

        await audit.log(
          {
            action: AuditAction.USER_CREATED,
            entityType: 'user',
            entityId: user.id,
            schoolId,
            after: {
              firstName: input.firstName,
              lastName: input.lastName,
              phone: maskPhone(phone),
              roles: input.roles,
            },
            metadata: { reusedExistingAccount: Boolean(existing) },
          },
          tx,
        );

        return tx.user.findUniqueOrThrow({ where: { id: user.id }, include: USER_INCLUDE });
      });

      if (input.sendInvitation) {
        // L'invitation réutilise le mécanisme de réinitialisation : l'employé
        // reçoit un code, choisit son mot de passe, et son numéro se trouve
        // vérifié par la même occasion.
        await auth.sendOtp(phone, 'PASSWORD_RESET', {});
        await sms.send({
          to: phone,
          kind: 'STAFF_INVITATION',
          body: `CSB Noutcha KAMGUE : un compte a ete cree pour vous. Utilisez le code recu pour definir votre mot de passe.`,
        });
      }

      return toSummary(created, schoolId);
    },

    /* --- Modification ------------------------------------------------------ */

    async update(schoolId: string, id: string, input: UpdateUserBody): Promise<UserSummary> {
      const before = await db.user.findFirst({
        where: { id, userRoles: { some: { schoolId } } },
        include: USER_INCLUDE,
      });
      if (!before) throw errors.notFound('Utilisateur introuvable.');

      const updated = await db.$transaction(async (tx) => {
        if (
          input.firstName !== undefined ||
          input.lastName !== undefined ||
          input.email !== undefined
        ) {
          await tx.user.update({
            where: { id },
            data: {
              ...(input.firstName !== undefined && { firstName: input.firstName }),
              ...(input.lastName !== undefined && { lastName: input.lastName }),
              ...(input.email !== undefined && { email: input.email }),
            },
          });
        }

        if (input.jobTitle !== undefined || input.employeeNumber !== undefined) {
          await tx.staffProfile.update({
            where: { userId_schoolId: { userId: id, schoolId } },
            data: {
              ...(input.jobTitle !== undefined && { jobTitle: input.jobTitle }),
              ...(input.employeeNumber !== undefined && { employeeNumber: input.employeeNumber }),
            },
          });
        }

        const after = await tx.user.findUniqueOrThrow({ where: { id }, include: USER_INCLUDE });

        await audit.log(
          {
            action: AuditAction.USER_UPDATED,
            entityType: 'user',
            entityId: id,
            schoolId,
            before: { firstName: before.firstName, lastName: before.lastName, email: before.email },
            after: { firstName: after.firstName, lastName: after.lastName, email: after.email },
          },
          tx,
        );

        return after;
      });

      return toSummary(updated, schoolId);
    },

    /* --- Rôles -------------------------------------------------------------- */

    async assignRoles(
      schoolId: string,
      id: string,
      codes: readonly string[],
      reason: string | undefined,
      actorId: string,
    ): Promise<UserSummary> {
      if (id === actorId) {
        // Se retirer soi-même ses droits d'administration verrouillerait
        // l'établissement hors de son propre outil.
        throw errors.validation('Vous ne pouvez pas modifier vos propres rôles.');
      }

      const before = await db.user.findFirst({
        where: { id, userRoles: { some: { schoolId } } },
        include: USER_INCLUDE,
      });
      if (!before) throw errors.notFound('Utilisateur introuvable.');

      const roles = await resolveRoles(schoolId, codes);
      const previous = before.userRoles
        .filter((link) => link.schoolId === schoolId)
        .map((link) => link.role.code)
        .sort();

      const updated = await db.$transaction(async (tx) => {
        await tx.userRole.deleteMany({ where: { userId: id, schoolId } });
        await tx.userRole.createMany({
          data: roles.map((role) => ({
            userId: id,
            roleId: role.id,
            schoolId,
            grantedBy: actorId,
          })),
        });

        await audit.log(
          {
            action: AuditAction.USER_ROLES_ASSIGNED,
            entityType: 'user',
            entityId: id,
            schoolId,
            before: { roles: previous },
            after: { roles: [...codes].sort() },
            ...(reason && { metadata: { reason } }),
          },
          tx,
        );

        return tx.user.findUniqueOrThrow({ where: { id }, include: USER_INCLUDE });
      });

      // Sans cette révocation, l'utilisateur conserverait ses anciennes
      // permissions jusqu'à l'expiration de son jeton d'accès.
      await repository.revokeAllUserSessions(id);

      return toSummary(updated, schoolId);
    },

    async replaceAccessScopes(
      schoolId: string,
      id: string,
      input: ReplaceAccessScopesBody,
      actorId: string,
    ): Promise<UserSummary> {
      if (id === actorId)
        throw errors.validation('Vous ne pouvez pas modifier votre propre périmètre.');
      const before = await db.user.findFirst({
        where: { id, userRoles: { some: { schoolId } } },
        include: USER_INCLUDE,
      });
      if (!before) throw errors.notFound('Utilisateur introuvable.');

      const targetIds = {
        units: input.scopes.flatMap((scope) =>
          scope.organizationalUnitId ? [scope.organizationalUnitId] : [],
        ),
        sections: input.scopes.flatMap((scope) =>
          scope.languageSectionId ? [scope.languageSectionId] : [],
        ),
        tracks: input.scopes.flatMap((scope) =>
          scope.educationTrackId ? [scope.educationTrackId] : [],
        ),
        classes: input.scopes.flatMap((scope) => (scope.classId ? [scope.classId] : [])),
      };
      const [units, sections, tracks, classes] = await Promise.all([
        db.organizationalUnit.count({ where: { schoolId, id: { in: targetIds.units } } }),
        db.languageSection.count({ where: { schoolId, id: { in: targetIds.sections } } }),
        db.educationTrack.count({ where: { schoolId, id: { in: targetIds.tracks } } }),
        db.class.count({ where: { schoolId, id: { in: targetIds.classes } } }),
      ]);
      if (
        units !== new Set(targetIds.units).size ||
        sections !== new Set(targetIds.sections).size ||
        tracks !== new Set(targetIds.tracks).size ||
        classes !== new Set(targetIds.classes).size
      ) {
        throw errors.validation(
          'Un périmètre appartient à un autre établissement ou n’existe pas.',
        );
      }

      const updated = await db.$transaction(async (tx) => {
        await tx.userAccessScope.deleteMany({ where: { schoolId, userId: id } });
        await tx.userAccessScope.createMany({
          data: input.scopes.map((scope) => ({
            schoolId,
            userId: id,
            scopeType: scope.type,
            organizationalUnitId: scope.organizationalUnitId ?? null,
            languageSectionId: scope.languageSectionId ?? null,
            educationTrackId: scope.educationTrackId ?? null,
            classId: scope.classId ?? null,
            grantedBy: actorId,
          })),
        });
        await audit.log(
          {
            action: AuditAction.USER_SCOPES_ASSIGNED,
            entityType: 'user',
            entityId: id,
            schoolId,
            before: { scopes: before.accessScopes.map((scope) => scope.scopeType) },
            after: { scopes: input.scopes },
            ...(input.reason && { metadata: { reason: input.reason } }),
          },
          tx,
        );
        return tx.user.findUniqueOrThrow({ where: { id }, include: USER_INCLUDE });
      });
      await repository.revokeAllUserSessions(id);
      return toSummary(updated, schoolId);
    },

    /* --- Activation / désactivation ---------------------------------------- */

    async setActive(
      schoolId: string,
      id: string,
      active: boolean,
      reason: string,
      actorId: string,
    ): Promise<UserSummary> {
      if (id === actorId) {
        throw errors.validation('Vous ne pouvez pas désactiver votre propre compte.');
      }

      const before = await db.user.findFirst({
        where: { id, userRoles: { some: { schoolId } } },
        include: USER_INCLUDE,
      });
      if (!before) throw errors.notFound('Utilisateur introuvable.');

      const nextStatus: UserStatus = active
        ? before.phoneVerifiedAt
          ? 'ACTIVE'
          : 'PENDING_VERIFICATION'
        : 'DISABLED';

      const updated = await db.$transaction(async (tx) => {
        await tx.user.update({ where: { id }, data: { status: nextStatus } });
        await tx.staffProfile.updateMany({
          where: { userId: id, schoolId },
          data: { status: active ? 'ACTIVE' : 'SUSPENDED' },
        });

        await audit.log(
          {
            action: AuditAction.USER_DEACTIVATED,
            entityType: 'user',
            entityId: id,
            schoolId,
            before: { status: before.status },
            after: { status: nextStatus },
            metadata: { reason, active },
          },
          tx,
        );

        return tx.user.findUniqueOrThrow({ where: { id }, include: USER_INCLUDE });
      });

      if (!active) {
        await repository.revokeAllUserSessions(id);
      }

      return toSummary(updated, schoolId);
    },

    /* --- Rôles & permissions (lecture) -------------------------------------- */

    async listRoles(schoolId: string): Promise<RoleDetail[]> {
      const roles = await db.role.findMany({
        where: { OR: [{ schoolId: null }, { schoolId }] },
        include: {
          permissions: { include: { permission: { select: { code: true } } } },
          _count: { select: { userRoles: { where: { schoolId } } } },
        },
        orderBy: { code: 'asc' },
      });

      return roles.map((role) => ({
        id: role.id,
        code: role.code,
        name: role.name,
        description: role.description,
        isSystem: role.isSystem,
        permissions: role.permissions.map((link) => link.permission.code).sort(),
        userCount: role._count.userRoles,
      }));
    },

    async listPermissions() {
      return db.permission.findMany({
        select: { code: true, description: true, group: true },
        orderBy: [{ group: 'asc' }, { code: 'asc' }],
      });
    },

    async createRole(
      schoolId: string,
      input: CreateRoleBody,
      actorId: string,
    ): Promise<RoleDetail> {
      const duplicate = await db.role.findFirst({
        where: { code: input.code, OR: [{ schoolId: null }, { schoolId }] },
      });
      if (duplicate) throw errors.conflict('Un rôle utilise déjà ce code.');

      const permissions = await db.permission.findMany({
        where: { code: { in: input.permissions } },
        select: { id: true, code: true },
      });
      const unknown = input.permissions.filter(
        (code) => !permissions.some((permission) => permission.code === code),
      );
      if (unknown.length > 0)
        throw errors.validation(`Permission inconnue : ${unknown.join(', ')}.`);

      const role = await db.$transaction(async (tx) => {
        const created = await tx.role.create({
          data: {
            code: input.code,
            name: input.name,
            description: input.description ?? null,
            schoolId,
            permissions: {
              create: permissions.map((permission) => ({ permissionId: permission.id })),
            },
          },
          include: { permissions: { include: { permission: true } } },
        });
        await audit.log(
          {
            action: AuditAction.ROLE_CREATED,
            entityType: 'role',
            entityId: created.id,
            schoolId,
            userId: actorId,
            after: { code: created.code, name: created.name, permissions: input.permissions },
          },
          tx,
        );
        return created;
      });

      return {
        id: role.id,
        code: role.code,
        name: role.name,
        description: role.description,
        isSystem: role.isSystem,
        permissions: role.permissions.map((link) => link.permission.code).sort(),
        userCount: 0,
      };
    },

    async updateRole(
      schoolId: string,
      id: string,
      input: UpdateRoleBody,
      actorId: string,
    ): Promise<RoleDetail> {
      const before = await db.role.findFirst({
        where: { id, schoolId },
        include: {
          permissions: { include: { permission: true } },
          _count: { select: { userRoles: { where: { schoolId } } } },
        },
      });
      if (!before) throw errors.notFound('Rôle personnalisé introuvable.');
      if (before.isSystem) throw errors.validation('Un rôle système est en lecture seule.');

      const permissions = input.permissions
        ? await db.permission.findMany({
            where: { code: { in: input.permissions } },
            select: { id: true, code: true },
          })
        : null;
      const unknown = input.permissions?.filter(
        (code) => !permissions?.some((permission) => permission.code === code),
      );
      if (unknown?.length) throw errors.validation(`Permission inconnue : ${unknown.join(', ')}.`);

      const role = await db.$transaction(async (tx) => {
        if (permissions) {
          await tx.rolePermission.deleteMany({ where: { roleId: id } });
          await tx.rolePermission.createMany({
            data: permissions.map((permission) => ({ roleId: id, permissionId: permission.id })),
          });
        }
        const updated = await tx.role.update({
          where: { id },
          data: {
            ...(input.name !== undefined && { name: input.name }),
            ...(input.description !== undefined && { description: input.description }),
          },
          include: {
            permissions: { include: { permission: true } },
            _count: { select: { userRoles: { where: { schoolId } } } },
          },
        });
        await audit.log(
          {
            action: AuditAction.ROLE_UPDATED,
            entityType: 'role',
            entityId: id,
            schoolId,
            userId: actorId,
            before: {
              name: before.name,
              description: before.description,
              permissions: before.permissions.map((link) => link.permission.code).sort(),
            },
            after: {
              name: updated.name,
              description: updated.description,
              permissions: updated.permissions.map((link) => link.permission.code).sort(),
            },
          },
          tx,
        );
        return updated;
      });

      const assignedUsers = await db.userRole.findMany({
        where: { roleId: id, schoolId },
        select: { userId: true },
        distinct: ['userId'],
      });
      await Promise.all(
        assignedUsers.map(({ userId }) => repository.revokeAllUserSessions(userId)),
      );

      return {
        id: role.id,
        code: role.code,
        name: role.name,
        description: role.description,
        isSystem: role.isSystem,
        permissions: role.permissions.map((link) => link.permission.code).sort(),
        userCount: role._count.userRoles,
      };
    },
  };
}

export type UsersService = ReturnType<typeof createUsersService>;
