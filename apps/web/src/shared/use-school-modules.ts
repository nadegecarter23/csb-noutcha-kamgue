import { useQuery } from '@tanstack/react-query';
import type { SchoolModuleCode, SchoolModuleDto } from '@cplan/contracts';
import { api } from '@/shared/api/client';

export function useSchoolModules(enabled = true) {
  return useQuery({
    queryKey: ['school-modules'],
    queryFn: () => api.get<SchoolModuleDto[]>('/modules'),
    staleTime: 30_000,
    enabled,
  });
}

export function moduleForPath(path: string): SchoolModuleCode | null {
  if (
    path === '/school' ||
    path.startsWith('/academic-years') ||
    path.startsWith('/grade-levels') ||
    path.startsWith('/classes')
  )
    return 'ACADEMIC';
  if (path.startsWith('/students') || path.startsWith('/guardian-requests')) return 'STUDENTS';
  if (path.startsWith('/pedagogy') || path.startsWith('/timetable')) return 'PEDAGOGY';
  if (path.startsWith('/attendance')) return 'ATTENDANCE';
  if (path.startsWith('/assessments') || path.startsWith('/report-cards')) return 'ASSESSMENTS';
  if (path.startsWith('/student-life')) return 'STUDENT_LIFE';
  if (path.startsWith('/staff')) return 'STAFF';
  if (path.startsWith('/communications')) return 'COMMUNICATIONS';
  if (path.startsWith('/services')) return 'SERVICES';
  if (path.startsWith('/portal')) return 'PORTALS';
  if (path.startsWith('/fees')) return 'BILLING';
  if (
    path.startsWith('/payments') ||
    path.startsWith('/mobile-money') ||
    path.startsWith('/external-payments') ||
    path.startsWith('/cashier')
  )
    return 'PAYMENTS';
  if (path.startsWith('/procurement')) return 'PROCUREMENT';
  if (
    path.startsWith('/accounting') ||
    path.startsWith('/direction') ||
    path.startsWith('/reports') ||
    path.startsWith('/exports')
  )
    return 'REPORTING';
  return null;
}
