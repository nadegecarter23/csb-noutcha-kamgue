import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { AcademicYearDto } from '@cplan/contracts';
import { api } from '@/shared/api/client';
import { useAuthStore } from '@/features/auth/auth-store';
import { useAcademicYearStore } from './academic-year-store';

export function useAcademicYear() {
  const canRead = useAuthStore((state) =>
    Boolean(
      state.user &&
      !state.user.mustChangePassword &&
      state.user.currentSchoolId &&
      state.user.permissions.includes('academic_years.read'),
    ),
  );
  const { selectedYearId, selectYear } = useAcademicYearStore();
  const query = useQuery({
    queryKey: ['academic-years'],
    queryFn: () => api.get<AcademicYearDto[]>('/academic-years'),
    enabled: canRead,
  });
  const selectedYear =
    query.data?.find((year) => year.id === selectedYearId) ??
    query.data?.find((year) => year.isCurrent) ??
    query.data?.[0] ??
    null;
  useEffect(() => {
    if (selectedYear && selectedYear.id !== selectedYearId) selectYear(selectedYear.id);
  }, [selectYear, selectedYear, selectedYearId]);
  return {
    ...query,
    years: query.data ?? [],
    selectedYear,
    selectYear,
    isReadOnly: selectedYear?.status === 'CLOSED' || selectedYear?.status === 'ARCHIVED',
  };
}
