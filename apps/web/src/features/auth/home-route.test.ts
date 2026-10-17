import { describe, expect, it } from 'vitest';
import type { CurrentUser } from '@cplan/contracts';
import { homeRouteFor } from './home-route';

const user = (role: string, permissions: string[], currentSchoolId: string | null = 'school-1') =>
  ({
    id: 'user-1',
    firstName: 'Test',
    lastName: role,
    phone: '+237699000000',
    phoneVerified: true,
    email: null,
    status: 'ACTIVE',
    mustChangePassword: false,
    currentSchoolId,
    roles: [role],
    permissions,
    accessScopes: [],
    schools: [],
  }) as CurrentUser;

describe('homeRouteFor', () => {
  it.each([
    ['SUPER_ADMIN', ['schools.manage'], null, '/platform'],
    ['SCHOOL_ADMIN', ['academic_years.read'], 'school-1', '/school'],
    ['REGISTRAR', ['academic_years.read'], 'school-1', '/school'],
    ['DIRECTOR', ['reports.director.read'], 'school-1', '/direction'],
    ['ACCOUNTANT', ['reports.financial.read'], 'school-1', '/accounting'],
    ['CASHIER', ['payments.create_cash'], 'school-1', '/cashier'],
    ['TEACHER', ['academic_years.read', 'portal.read'], 'school-1', '/portal'],
    ['PARENT', ['portal.read'], 'school-1', '/portal'],
    ['STUDENT', ['portal.read'], 'school-1', '/portal'],
    ['PROMOTER', ['reports.director.read'], 'school-1', '/direction'],
    ['BURSAR', ['reports.financial.read'], 'school-1', '/accounting'],
    ['HR_MANAGER', ['academic_years.read', 'staff.read'], 'school-1', '/staff'],
    ['COMMUNICATION_OFFICER', ['academic_years.read'], 'school-1', '/communications'],
    ['CYCLE_HEAD', ['academic_years.read'], 'school-1', '/school'],
  ])('redirige %s vers %s', (role, permissions, schoolId, expected) => {
    expect(homeRouteFor(user(role, permissions as string[], schoolId))).toBe(expected);
  });

  it('renvoie le profil pour un rôle personnalisé sans espace métier', () => {
    expect(homeRouteFor(user('CUSTOM', []))).toBe('/profile');
  });
});
