import {
  SCHOOL_MODULES,
  resolveModuleToggle,
  type SchoolModuleCode,
  type SchoolModuleDto,
} from '@cplan/contracts';
import type { Database } from '../../platform/db.js';
import type { AuditService } from '../../platform/audit.js';
import { AuditAction } from '../../platform/audit.js';
import { withSchoolScope } from '../../platform/school-scope.js';

export function createSchoolModulesService(db: Database, audit: AuditService) {
  async function list(schoolId: string): Promise<SchoolModuleDto[]> {
    return withSchoolScope(db, schoolId, async (tx) => {
      const rows = await tx.schoolModuleSetting.findMany({ where: { schoolId } });
      const byCode = new Map(rows.map((row) => [row.moduleCode, row]));
      return SCHOOL_MODULES.map((definition) => {
        const row = byCode.get(definition.code);
        return {
          code: definition.code,
          label: definition.label,
          description: definition.description,
          dependencies: [...definition.dependencies],
          enabled: row?.enabled ?? true,
          updatedAt: row?.updatedAt.toISOString() ?? null,
        };
      });
    });
  }
  async function update(
    schoolId: string,
    actorId: string,
    code: SchoolModuleCode,
    enabled: boolean,
  ): Promise<SchoolModuleDto[]> {
    return withSchoolScope(db, schoolId, async (tx) => {
      const rows = await tx.schoolModuleSetting.findMany({ where: { schoolId } });
      const current = new Map<SchoolModuleCode, boolean>(
        SCHOOL_MODULES.map((definition) => [
          definition.code,
          rows.find((row) => row.moduleCode === definition.code)?.enabled ?? true,
        ]),
      );
      const state = resolveModuleToggle(current, code, enabled);
      const changed = SCHOOL_MODULES.filter(
        (item) =>
          (rows.find((row) => row.moduleCode === item.code)?.enabled ?? true) !==
          state.get(item.code),
      );
      for (const item of changed)
        await tx.schoolModuleSetting.upsert({
          where: { schoolId_moduleCode: { schoolId, moduleCode: item.code } },
          create: {
            schoolId,
            moduleCode: item.code,
            enabled: state.get(item.code) ?? true,
            updatedBy: actorId,
          },
          update: { enabled: state.get(item.code) ?? true, updatedBy: actorId },
        });
      await audit.log(
        {
          action: AuditAction.MODULE_SETTINGS_UPDATED,
          entityType: 'school_modules',
          entityId: schoolId,
          schoolId,
          before: Object.fromEntries(rows.map((row) => [row.moduleCode, row.enabled])),
          after: Object.fromEntries(state),
          metadata: {
            requestedModule: code,
            requestedState: enabled,
            changed: changed.map((item) => item.code),
          },
        },
        tx,
      );
      const updated = await tx.schoolModuleSetting.findMany({ where: { schoolId } }),
        byCode = new Map(updated.map((row) => [row.moduleCode, row]));
      return SCHOOL_MODULES.map((definition) => {
        const row = byCode.get(definition.code);
        return {
          code: definition.code,
          label: definition.label,
          description: definition.description,
          dependencies: [...definition.dependencies],
          enabled: row?.enabled ?? true,
          updatedAt: row?.updatedAt.toISOString() ?? null,
        };
      });
    });
  }
  return { list, update };
}
export type SchoolModulesService = ReturnType<typeof createSchoolModulesService>;
