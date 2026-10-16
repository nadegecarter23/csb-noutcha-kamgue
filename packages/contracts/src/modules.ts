import { z } from 'zod';
import type { PermissionCode } from './permissions.js';

export const SCHOOL_MODULE_CODES = [
  'ACADEMIC',
  'STUDENTS',
  'PEDAGOGY',
  'ATTENDANCE',
  'ASSESSMENTS',
  'BILLING',
  'PAYMENTS',
  'PROCUREMENT',
  'STUDENT_LIFE',
  'STAFF',
  'COMMUNICATIONS',
  'SERVICES',
  'PORTALS',
  'REPORTING',
] as const;
export type SchoolModuleCode = (typeof SCHOOL_MODULE_CODES)[number];
export const schoolModuleCodeSchema = z.enum(SCHOOL_MODULE_CODES);

export interface SchoolModuleDefinition {
  code: SchoolModuleCode;
  label: string;
  description: string;
  dependencies: readonly SchoolModuleCode[];
}
export const SCHOOL_MODULES: readonly SchoolModuleDefinition[] = [
  {
    code: 'ACADEMIC',
    label: 'Référentiel scolaire',
    description: 'Années scolaires, niveaux et classes.',
    dependencies: [],
  },
  {
    code: 'STUDENTS',
    label: 'Élèves et inscriptions',
    description: 'Dossiers élèves, responsables, inscriptions et imports.',
    dependencies: ['ACADEMIC'],
  },
  {
    code: 'PEDAGOGY',
    label: 'Pédagogie et emplois du temps',
    description: 'Matières, enseignants, affectations, salles et cours.',
    dependencies: ['ACADEMIC'],
  },
  {
    code: 'ATTENDANCE',
    label: 'Présences et assiduité',
    description: 'Appels, absences, retards et justificatifs.',
    dependencies: ['STUDENTS', 'PEDAGOGY'],
  },
  {
    code: 'ASSESSMENTS',
    label: 'Évaluations et bulletins',
    description: 'Notes, compétences, moyennes, décisions et bulletins.',
    dependencies: ['STUDENTS', 'PEDAGOGY'],
  },
  {
    code: 'BILLING',
    label: 'Frais scolaires',
    description: 'Tarifs, tranches, remises et dettes des élèves.',
    dependencies: ['STUDENTS'],
  },
  {
    code: 'PAYMENTS',
    label: 'Paiements et caisse',
    description: 'Encaissements, reçus, Mobile Money, validations externes et caisse.',
    dependencies: ['BILLING'],
  },
  {
    code: 'PROCUREMENT',
    label: 'Dépenses et achats',
    description: 'Fournisseurs, bons d’achat, dépenses et règlements.',
    dependencies: [],
  },
  {
    code: 'STUDENT_LIFE',
    label: 'Vie scolaire',
    description: 'Incidents, sanctions et infirmerie.',
    dependencies: ['STUDENTS'],
  },
  {
    code: 'STAFF',
    label: 'Personnel',
    description: 'Dossiers, contrats, charges et congés du personnel.',
    dependencies: [],
  },
  {
    code: 'COMMUNICATIONS',
    label: 'Communication',
    description: 'Annonces, événements, devoirs et messages.',
    dependencies: ['STUDENTS'],
  },
  {
    code: 'SERVICES',
    label: 'Services de l’établissement',
    description: 'Bibliothèque, cantine, transport et stocks.',
    dependencies: ['STUDENTS'],
  },
  {
    code: 'PORTALS',
    label: 'Portails des acteurs',
    description: 'Espaces enseignant, famille et élève.',
    dependencies: ['STUDENTS'],
  },
  {
    code: 'REPORTING',
    label: 'Pilotage et exports',
    description: 'Tableaux de bord, rapports, exports et impressions.',
    dependencies: [],
  },
] as const;

export const schoolModuleSchema = z.object({
  code: schoolModuleCodeSchema,
  label: z.string(),
  description: z.string(),
  enabled: z.boolean(),
  dependencies: z.array(schoolModuleCodeSchema),
  updatedAt: z.string().datetime().nullable(),
});
export const schoolModulesSchema = z.array(schoolModuleSchema);
export const updateSchoolModuleBodySchema = z.object({ enabled: z.boolean() }).strict();
export type SchoolModuleDto = z.infer<typeof schoolModuleSchema>;

export function resolveModuleToggle(
  current: ReadonlyMap<SchoolModuleCode, boolean>,
  code: SchoolModuleCode,
  enabled: boolean,
): Map<SchoolModuleCode, boolean> {
  const state = new Map<SchoolModuleCode, boolean>(
    SCHOOL_MODULES.map((module) => [module.code, current.get(module.code) ?? true]),
  );
  const enable = (value: SchoolModuleCode) => {
    state.set(value, true);
    for (const dependency of SCHOOL_MODULES.find((module) => module.code === value)?.dependencies ??
      [])
      enable(dependency);
  };
  const disable = (value: SchoolModuleCode) => {
    state.set(value, false);
    for (const dependent of SCHOOL_MODULES.filter((module) => module.dependencies.includes(value)))
      disable(dependent.code);
  };
  if (enabled) enable(code);
  else disable(code);
  return state;
}

const starts = (permission: PermissionCode, prefixes: readonly string[]) =>
  prefixes.some((prefix) => permission.startsWith(prefix));
export function moduleForPermission(permission: PermissionCode): SchoolModuleCode | null {
  if (starts(permission, ['academic_years.', 'grade_levels.', 'classes.'])) return 'ACADEMIC';
  if (
    starts(permission, [
      'students.',
      'enrollments.',
      'imports.students.',
      'guardians.',
      'guardian_',
    ])
  )
    return 'STUDENTS';
  if (starts(permission, ['pedagogy.', 'subjects.', 'teaching_assignments.', 'timetable.']))
    return 'PEDAGOGY';
  if (permission.startsWith('attendance.')) return 'ATTENDANCE';
  if (starts(permission, ['assessments.', 'grading_policies.', 'report_cards.']))
    return 'ASSESSMENTS';
  if (starts(permission, ['fee_types.', 'fee_structures.', 'student_fees.', 'discounts.']))
    return 'BILLING';
  if (starts(permission, ['payments.', 'cash_sessions.', 'receipts.'])) return 'PAYMENTS';
  if (starts(permission, ['suppliers.', 'purchases.', 'expenses.'])) return 'PROCUREMENT';
  if (starts(permission, ['student_life.', 'health_records.'])) return 'STUDENT_LIFE';
  if (starts(permission, ['staff.', 'staff_leaves.'])) return 'STAFF';
  if (starts(permission, ['communications.', 'messages.'])) return 'COMMUNICATIONS';
  if (permission.startsWith('school_services.')) return 'SERVICES';
  if (permission.startsWith('portal.')) return 'PORTALS';
  if (permission.startsWith('reports.')) return 'REPORTING';
  return null;
}
