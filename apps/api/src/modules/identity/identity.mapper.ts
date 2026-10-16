import type { CurrentUser } from '@cplan/contracts';
import type { UserWithAccess } from './identity.repository.js';

/**
 * Conversion entité → DTO.
 *
 * Seul endroit où l'on décide de ce qui sort du serveur. Aucun champ sensible
 * (`passwordHash`, compteurs d'échec, dates de verrouillage) n'est exposé.
 */

export interface ResolvedAccess {
  roles: string[];
  permissions: string[];
  schools: Array<{ schoolId: string; schoolName: string; roles: string[] }>;
}

/**
 * Résout les rôles et permissions effectifs d'un utilisateur.
 *
 * Un utilisateur peut cumuler plusieurs rôles, y compris dans plusieurs
 * établissements. Quand un `schoolId` est fourni, seules les permissions
 * valables dans cet établissement sont retenues, plus celles des rôles de
 * plateforme (`schoolId` NULL), qui s'appliquent partout.
 */
export function resolveAccess(
  user: UserWithAccess,
  currentSchoolId?: string | null,
): ResolvedAccess {
  const roles = new Set<string>();
  const permissions = new Set<string>();
  const schools = new Map<string, { schoolId: string; schoolName: string; roles: string[] }>();

  for (const userRole of user.userRoles) {
    const isPlatformRole = userRole.schoolId === null;
    const matchesCurrentSchool = currentSchoolId != null && userRole.schoolId === currentSchoolId;

    // Sans contexte d'établissement, on expose l'union — c'est le cas d'un
    // parent, dont le périmètre réel sera restreint par la garde parentScope.
    const applies = currentSchoolId == null || isPlatformRole || matchesCurrentSchool;

    if (applies) {
      roles.add(userRole.role.code);
      for (const link of userRole.role.permissions) {
        permissions.add(link.permission.code);
      }
    }

    if (userRole.school) {
      const entry = schools.get(userRole.school.id) ?? {
        schoolId: userRole.school.id,
        schoolName: userRole.school.name,
        roles: [],
      };
      entry.roles.push(userRole.role.code);
      schools.set(userRole.school.id, entry);
    }
  }

  return {
    roles: [...roles].sort(),
    permissions: [...permissions].sort(),
    schools: [...schools.values()],
  };
}

export function toCurrentUser(user: UserWithAccess, currentSchoolId: string | null): CurrentUser {
  const access = resolveAccess(user, currentSchoolId);

  return {
    id: user.id,
    firstName: user.firstName,
    lastName: user.lastName,
    phone: user.phone,
    phoneVerified: user.phoneVerifiedAt !== null,
    email: user.email,
    status: user.status,
    mustChangePassword: user.mustChangePassword,
    currentSchoolId,
    roles: access.roles,
    permissions: access.permissions,
    accessScopes: user.accessScopes
      .filter((scope) => scope.schoolId === currentSchoolId)
      .map((scope) => ({
        id: scope.id,
        type: scope.scopeType,
        organizationalUnitId: scope.organizationalUnitId,
        languageSectionId: scope.languageSectionId,
        educationTrackId: scope.educationTrackId,
        classId: scope.classId,
      })),
    schools: access.schools,
  };
}

/**
 * Établissement à retenir par défaut à la connexion.
 *
 * Un membre du personnel rattaché à un seul établissement n'a pas à le choisir.
 * Rattaché à plusieurs, il devra basculer explicitement.
 */
export function defaultSchoolId(user: UserWithAccess): string | null {
  const schoolIds = [
    ...new Set(
      user.userRoles.map((userRole) => userRole.schoolId).filter((id): id is string => id !== null),
    ),
  ];
  return schoolIds.length === 1 ? (schoolIds[0] ?? null) : null;
}
