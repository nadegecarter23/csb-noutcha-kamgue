import type { CurrentUser } from '@cplan/contracts';

/**
 * Choisit une page d'accueil utile sans donner de droit supplémentaire.
 * Les rôles départagent les profils qui partagent des permissions, puis les
 * capacités servent de repli pour les rôles personnalisés.
 */
export function homeRouteFor(user: CurrentUser | null): string {
  if (!user) return '/login';
  if (user.mustChangePassword) return '/profile';

  const roles = new Set(user.roles);
  const permissions = new Set(user.permissions);

  if (permissions.has('schools.manage') && !user.currentSchoolId) return '/platform';
  if (roles.has('PARENT') || roles.has('STUDENT') || roles.has('TEACHER')) return '/portal';
  if (roles.has('DIRECTOR') || roles.has('PROMOTER')) return '/direction';
  if (roles.has('ACCOUNTANT') || roles.has('BURSAR')) return '/accounting';
  if (roles.has('CASHIER')) return '/cashier';
  if (roles.has('HR_MANAGER')) return '/staff';
  if (roles.has('COMMUNICATION_OFFICER')) return '/communications';
  if (roles.has('REGISTRAR') || roles.has('SCHOOL_ADMIN') || roles.has('CYCLE_HEAD'))
    return '/school';

  if (permissions.has('portal.read')) return '/portal';
  if (permissions.has('reports.director.read')) return '/direction';
  if (permissions.has('reports.financial.read')) return '/accounting';
  if (permissions.has('payments.create_cash')) return '/cashier';
  if (permissions.has('academic_years.read')) return '/school';
  if (permissions.has('staff.read')) return '/staff';
  if (permissions.has('communications.read')) return '/communications';
  return '/profile';
}
