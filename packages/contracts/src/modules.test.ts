import { describe, expect, it } from 'vitest';
import {
  SCHOOL_MODULES,
  moduleForPermission,
  resolveModuleToggle,
  schoolModuleCodeSchema,
} from './modules.js';

describe('catalogue des modules', () => {
  it('utilise des codes uniques', () => {
    expect(new Set(SCHOOL_MODULES.map((module) => module.code)).size).toBe(SCHOOL_MODULES.length);
  });
  it('ne référence que des dépendances existantes', () => {
    const codes = new Set(SCHOOL_MODULES.map((module) => module.code));
    expect(
      SCHOOL_MODULES.flatMap((module) => module.dependencies).every((code) => codes.has(code)),
    ).toBe(true);
  });
  it('associe les permissions métier à leur module', () => {
    expect(moduleForPermission('expenses.pay')).toBe('PROCUREMENT');
    expect(moduleForPermission('attendance.take')).toBe('ATTENDANCE');
    expect(moduleForPermission('settings.update')).toBeNull();
  });
  it('refuse un code arbitraire', () => {
    expect(schoolModuleCodeSchema.safeParse('UNKNOWN_MODULE').success).toBe(false);
  });
  it('désactive les dépendants et réactive les prérequis', () => {
    const allOn = new Map(SCHOOL_MODULES.map((module) => [module.code, true]));
    const disabled = resolveModuleToggle(allOn, 'STUDENTS', false);
    expect(disabled.get('ATTENDANCE')).toBe(false);
    expect(disabled.get('BILLING')).toBe(false);
    const restored = resolveModuleToggle(disabled, 'PAYMENTS', true);
    expect(restored.get('PAYMENTS')).toBe(true);
    expect(restored.get('BILLING')).toBe(true);
    expect(restored.get('STUDENTS')).toBe(true);
    expect(restored.get('ACADEMIC')).toBe(true);
  });
});
