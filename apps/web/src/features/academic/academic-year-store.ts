import { create } from 'zustand';

const STORAGE_KEY = 'cplan.academic-year';

interface AcademicYearState {
  selectedYearId: string | null;
  selectYear(id: string): void;
}

export const useAcademicYearStore = create<AcademicYearState>((set) => ({
  selectedYearId: localStorage.getItem(STORAGE_KEY),
  selectYear(id) {
    localStorage.setItem(STORAGE_KEY, id);
    set({ selectedYearId: id });
  },
}));
