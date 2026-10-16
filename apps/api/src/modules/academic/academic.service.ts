import type { AcademicYearStatus, Prisma } from '@prisma/client';
import type {
  AcademicYearDto,
  ClassDto,
  CreateAcademicYearBody,
  CreateClassBody,
  CreateGradeLevelBody,
  GradeLevelDto,
  OrganizationTree,
  SchoolSettingsDto,
  StudentCategoryDto,
  UpdateAcademicYearBody,
  UpdateClassBody,
  UpdateGradeLevelBody,
} from '@cplan/contracts';
import type { Database } from '../../platform/db.js';
import type { AuditService } from '../../platform/audit.js';
import { AuditAction } from '../../platform/audit.js';
import { errors } from '../../platform/errors.js';
import { withSchoolScope } from '../../platform/school-scope.js';

const dateOnly = (value: Date): string => value.toISOString().slice(0, 10);
const dbDate = (value: string): Date => new Date(`${value}T00:00:00.000Z`);
function required<T>(value: T | null | undefined, message: string): T {
  if (value == null) throw new Error(message);
  return value;
}

export function createAcademicService(db: Database, audit: AuditService) {
  function yearDto(row: {
    id: string;
    name: string;
    startDate: Date;
    endDate: Date;
    status: AcademicYearStatus;
    isCurrent: boolean;
    _count: { classes: number };
  }): AcademicYearDto {
    return {
      id: row.id,
      name: row.name,
      startDate: dateOnly(row.startDate),
      endDate: dateOnly(row.endDate),
      status: row.status,
      isCurrent: row.isCurrent,
      classCount: row._count.classes,
    };
  }

  async function requireWritableYear(tx: Prisma.TransactionClient, schoolId: string, id: string) {
    const year = await tx.academicYear.findFirst({ where: { id, schoolId } });
    if (!year) throw errors.notFound('Année scolaire introuvable.');
    if (year.status === 'CLOSED' || year.status === 'ARCHIVED')
      throw errors.validation('Cette année est en consultation uniquement.');
    return year;
  }

  function classDto(row: {
    id: string;
    academicYearId: string;
    gradeLevelId: string;
    name: string;
    capacity: number | null;
    headTeacherUserId: string | null;
    status: 'ACTIVE' | 'INACTIVE';
    gradeLevel: { name: string };
    organizationalUnitId: string | null;
    languageSectionId: string | null;
    educationTrackId: string | null;
    organizationalUnit: { name: string } | null;
    languageSection: { name: string } | null;
    educationTrack: { name: string } | null;
    headTeacher: { firstName: string; lastName: string } | null;
    _count?: { enrollments: number };
  }): ClassDto {
    const enrollmentCount = row._count?.enrollments ?? 0;
    const organizationalUnitId = required(
      row.organizationalUnitId,
      'Classe sans unité organisationnelle.',
    );
    const organizationalUnit = required(row.organizationalUnit, 'Relation unité absente.');
    const languageSectionId = required(row.languageSectionId, 'Classe sans section linguistique.');
    const languageSection = required(row.languageSection, 'Relation section absente.');
    return {
      id: row.id,
      academicYearId: row.academicYearId,
      gradeLevelId: row.gradeLevelId,
      gradeLevelName: row.gradeLevel.name,
      organizationalUnitId,
      organizationalUnitName: organizationalUnit.name,
      languageSectionId,
      languageSectionName: languageSection.name,
      educationTrackId: row.educationTrackId,
      educationTrackName: row.educationTrack?.name ?? null,
      name: row.name,
      capacity: row.capacity,
      headTeacherUserId: row.headTeacherUserId,
      headTeacherName: row.headTeacher
        ? `${row.headTeacher.firstName} ${row.headTeacher.lastName}`
        : null,
      status: row.status,
      enrollmentCount,
      fillRate: row.capacity ? enrollmentCount / row.capacity : null,
    };
  }

  return {
    async getOrganization(schoolId: string): Promise<OrganizationTree> {
      return withSchoolScope(db, schoolId, (tx) =>
        tx.organizationalUnit.findMany({
          where: { schoolId },
          select: {
            id: true,
            code: true,
            name: true,
            orderIndex: true,
            status: true,
            languageSections: {
              select: { id: true, code: true, name: true, status: true },
              orderBy: { code: 'asc' },
            },
            educationTracks: {
              select: { id: true, code: true, name: true, status: true },
              orderBy: { code: 'asc' },
            },
          },
          orderBy: { orderIndex: 'asc' },
        }),
      );
    },

    async updateOrganizationReference(
      schoolId: string,
      kind: 'units' | 'sections' | 'tracks',
      id: string,
      input: { name?: string | undefined; status?: 'ACTIVE' | 'INACTIVE' | undefined },
    ): Promise<OrganizationTree> {
      await withSchoolScope(db, schoolId, async (tx) => {
        const delegate =
          kind === 'units'
            ? tx.organizationalUnit
            : kind === 'sections'
              ? tx.languageSection
              : tx.educationTrack;
        const found = await (delegate as typeof tx.organizationalUnit).findFirst({
          where: { id, schoolId },
        });
        if (!found) throw errors.notFound('Référence organisationnelle introuvable.');
        const data = {
          ...(input.name !== undefined && { name: input.name }),
          ...(input.status !== undefined && { status: input.status }),
        };
        await (delegate as typeof tx.organizationalUnit).update({ where: { id }, data });
        await audit.log(
          {
            action: 'organization.update',
            entityType: `organization_${kind}`,
            entityId: id,
            schoolId,
            before: found,
            after: input,
          },
          tx,
        );
      });
      return this.getOrganization(schoolId);
    },
    async listYears(schoolId: string): Promise<AcademicYearDto[]> {
      return withSchoolScope(db, schoolId, async (tx) => {
        const rows = await tx.academicYear.findMany({
          where: { schoolId },
          include: { _count: { select: { classes: true } } },
          orderBy: { startDate: 'desc' },
        });
        return rows.map(yearDto);
      });
    },

    async createYear(schoolId: string, input: CreateAcademicYearBody): Promise<AcademicYearDto> {
      return withSchoolScope(db, schoolId, async (tx) => {
        const duplicate = await tx.academicYear.findFirst({
          where: { schoolId, name: { equals: input.name, mode: 'insensitive' } },
        });
        if (duplicate) throw errors.conflict('Une année scolaire porte déjà ce nom.');
        const overlaps = await tx.academicYear.count({
          where: {
            schoolId,
            startDate: { lte: dbDate(input.endDate) },
            endDate: { gte: dbDate(input.startDate) },
          },
        });
        const created = await tx.academicYear.create({
          data: {
            schoolId,
            name: input.name,
            startDate: dbDate(input.startDate),
            endDate: dbDate(input.endDate),
          },
          include: { _count: { select: { classes: true } } },
        });
        await audit.log(
          {
            action: AuditAction.ACADEMIC_YEAR_CREATED,
            entityType: 'academic_year',
            entityId: created.id,
            schoolId,
            after: input,
            ...(overlaps > 0 && {
              metadata: { warning: 'date_overlap', overlappingYears: overlaps },
            }),
          },
          tx,
        );
        return yearDto(created);
      });
    },

    async updateYear(
      schoolId: string,
      id: string,
      input: UpdateAcademicYearBody,
    ): Promise<AcademicYearDto> {
      return withSchoolScope(db, schoolId, async (tx) => {
        const before = await requireWritableYear(tx, schoolId, id);
        const startDate = input.startDate ? dbDate(input.startDate) : before.startDate;
        const endDate = input.endDate ? dbDate(input.endDate) : before.endDate;
        if (endDate <= startDate)
          throw errors.validation('La date de fin doit être postérieure à la date de début.');
        if (input.name) {
          const duplicate = await tx.academicYear.findFirst({
            where: { schoolId, id: { not: id }, name: { equals: input.name, mode: 'insensitive' } },
          });
          if (duplicate) throw errors.conflict('Une année scolaire porte déjà ce nom.');
        }
        const updated = await tx.academicYear.update({
          where: { id },
          data: { ...(input.name && { name: input.name }), startDate, endDate },
          include: { _count: { select: { classes: true } } },
        });
        await audit.log(
          {
            action: AuditAction.ACADEMIC_YEAR_UPDATED,
            entityType: 'academic_year',
            entityId: id,
            schoolId,
            before: {
              name: before.name,
              startDate: dateOnly(before.startDate),
              endDate: dateOnly(before.endDate),
            },
            after: input,
          },
          tx,
        );
        return yearDto(updated);
      });
    },

    async transitionYear(
      schoolId: string,
      id: string,
      target: 'ACTIVE' | 'CLOSED' | 'ARCHIVED',
      reason?: string,
    ): Promise<AcademicYearDto> {
      return withSchoolScope(db, schoolId, async (tx) => {
        const before = await tx.academicYear.findFirst({
          where: { id, schoolId },
          include: { _count: { select: { classes: { where: { status: 'ACTIVE' } } } } },
        });
        if (!before) throw errors.notFound('Année scolaire introuvable.');
        const expected: Record<typeof target, AcademicYearStatus> = {
          ACTIVE: 'DRAFT',
          CLOSED: 'ACTIVE',
          ARCHIVED: 'CLOSED',
        };
        if (before.status !== expected[target])
          throw errors.validation(`Transition ${before.status} → ${target} interdite.`);
        if (target === 'ACTIVE') {
          const gradeCount = await tx.gradeLevel.count({ where: { schoolId, status: 'ACTIVE' } });
          if (gradeCount === 0 || before._count.classes === 0)
            throw errors.validation(
              'Ajoutez au moins un niveau et une classe avant d’activer cette année.',
            );
          await tx.academicYear.updateMany({
            where: { schoolId, isCurrent: true },
            data: { isCurrent: false },
          });
        }
        const updated = await tx.academicYear.update({
          where: { id },
          data: { status: target, isCurrent: target === 'ACTIVE' },
          include: { _count: { select: { classes: true } } },
        });
        const action =
          target === 'ACTIVE'
            ? AuditAction.ACADEMIC_YEAR_ACTIVATED
            : target === 'CLOSED'
              ? AuditAction.ACADEMIC_YEAR_CLOSED
              : AuditAction.ACADEMIC_YEAR_ARCHIVED;
        await audit.log(
          {
            action,
            entityType: 'academic_year',
            entityId: id,
            schoolId,
            before: { status: before.status, isCurrent: before.isCurrent },
            after: { status: target, isCurrent: updated.isCurrent },
            ...(reason && { metadata: { reason } }),
          },
          tx,
        );
        return yearDto(updated);
      });
    },

    async duplicateStructure(
      schoolId: string,
      sourceYearId: string,
      targetYearId: string,
      preview: boolean,
    ) {
      return withSchoolScope(db, schoolId, async (tx) => {
        const [source, target] = await Promise.all([
          tx.academicYear.findFirst({
            where: { id: sourceYearId, schoolId },
            include: { classes: { where: { status: 'ACTIVE' } } },
          }),
          tx.academicYear.findFirst({ where: { id: targetYearId, schoolId } }),
        ]);
        if (!source || !target) throw errors.notFound('Année scolaire introuvable.');
        if (source.id === target.id)
          throw errors.validation('Les années source et cible doivent être différentes.');
        if (target.status !== 'DRAFT')
          throw errors.validation('La structure ne peut être copiée que vers une année brouillon.');
        const existing = await tx.class.findMany({
          where: { schoolId, academicYearId: target.id },
          select: { name: true },
        });
        const names = new Set(existing.map((item) => item.name.toLocaleLowerCase('fr')));
        const copies = source.classes.filter(
          (item) => !names.has(item.name.toLocaleLowerCase('fr')),
        );
        const gradeLevels = new Set(copies.map((item) => item.gradeLevelId)).size;
        if (!preview && copies.length) {
          await tx.class.createMany({
            data: copies.map((item) => ({
              schoolId,
              academicYearId: target.id,
              gradeLevelId: item.gradeLevelId,
              organizationalUnitId: item.organizationalUnitId,
              languageSectionId: item.languageSectionId,
              educationTrackId: item.educationTrackId,
              name: item.name,
              capacity: item.capacity,
              headTeacherUserId: item.headTeacherUserId,
            })),
          });
          await audit.log(
            {
              action: AuditAction.ACADEMIC_STRUCTURE_DUPLICATED,
              entityType: 'academic_year',
              entityId: target.id,
              schoolId,
              after: { sourceYearId, targetYearId, gradeLevels, classes: copies.length },
            },
            tx,
          );
        }
        return { sourceYearId, targetYearId, gradeLevels, classes: copies.length, preview };
      });
    },

    async listGradeLevels(schoolId: string): Promise<GradeLevelDto[]> {
      return withSchoolScope(db, schoolId, async (tx) =>
        (
          await tx.gradeLevel.findMany({
            where: { schoolId },
            include: {
              organizationalUnit: { select: { name: true } },
              _count: { select: { classes: { where: { status: 'ACTIVE' } } } },
            },
            orderBy: [{ orderIndex: 'asc' }, { name: 'asc' }],
          })
        ).map((row) => ({
          id: row.id,
          name: row.name,
          code: row.code,
          orderIndex: row.orderIndex,
          cycle: row.cycle,
          organizationalUnitId: required(row.organizationalUnitId, 'Niveau sans unité.'),
          organizationalUnitName: required(row.organizationalUnit, 'Relation unité absente.').name,
          status: row.status,
          classCount: row._count.classes,
        })),
      );
    },

    async createGradeLevel(schoolId: string, input: CreateGradeLevelBody): Promise<GradeLevelDto> {
      return withSchoolScope(db, schoolId, async (tx) => {
        const duplicate = await tx.gradeLevel.findFirst({
          where: { schoolId, code: { equals: input.code, mode: 'insensitive' } },
        });
        if (duplicate) throw errors.conflict('Un niveau utilise déjà ce code.');
        const unit = await tx.organizationalUnit.findFirst({
          where: input.organizationalUnitId
            ? { id: input.organizationalUnitId, schoolId, status: 'ACTIVE' }
            : { schoolId, code: input.cycle ?? 'PRIMAIRE', status: 'ACTIVE' },
        });
        if (!unit) throw errors.validation('Unité organisationnelle invalide ou inactive.');
        const row = await tx.gradeLevel.create({
          data: {
            schoolId,
            name: input.name,
            code: input.code.toUpperCase(),
            orderIndex: input.orderIndex,
            cycle: unit.code,
            organizationalUnitId: unit.id,
          },
          include: {
            organizationalUnit: { select: { name: true } },
            _count: { select: { classes: true } },
          },
        });
        await audit.log(
          {
            action: AuditAction.GRADE_LEVEL_CREATED,
            entityType: 'grade_level',
            entityId: row.id,
            schoolId,
            after: input,
          },
          tx,
        );
        return {
          id: row.id,
          name: row.name,
          code: row.code,
          orderIndex: row.orderIndex,
          cycle: row.cycle,
          organizationalUnitId: required(row.organizationalUnitId, 'Niveau sans unité.'),
          organizationalUnitName: required(row.organizationalUnit, 'Relation unité absente.').name,
          status: row.status,
          classCount: 0,
        };
      });
    },

    async updateGradeLevel(
      schoolId: string,
      id: string,
      input: UpdateGradeLevelBody,
    ): Promise<GradeLevelDto> {
      return withSchoolScope(db, schoolId, async (tx) => {
        const before = await tx.gradeLevel.findFirst({ where: { id, schoolId } });
        if (!before) throw errors.notFound('Niveau introuvable.');
        const unit = input.organizationalUnitId
          ? await tx.organizationalUnit.findFirst({
              where: { id: input.organizationalUnitId, schoolId, status: 'ACTIVE' },
            })
          : null;
        if (input.organizationalUnitId && !unit)
          throw errors.validation('Unité organisationnelle invalide ou inactive.');
        const data: Prisma.GradeLevelUncheckedUpdateInput = {
          ...(input.name !== undefined && { name: input.name }),
          ...(input.code !== undefined && { code: input.code.toUpperCase() }),
          ...(input.orderIndex !== undefined && { orderIndex: input.orderIndex }),
          ...(unit && { cycle: unit.code, organizationalUnitId: unit.id }),
        };
        const row = await tx.gradeLevel.update({
          where: { id },
          data,
          include: {
            organizationalUnit: { select: { name: true } },
            _count: { select: { classes: { where: { status: 'ACTIVE' } } } },
          },
        });
        await audit.log(
          {
            action: AuditAction.GRADE_LEVEL_UPDATED,
            entityType: 'grade_level',
            entityId: id,
            schoolId,
            before,
            after: input,
          },
          tx,
        );
        return {
          id: row.id,
          name: row.name,
          code: row.code,
          orderIndex: row.orderIndex,
          cycle: row.cycle,
          organizationalUnitId: required(row.organizationalUnitId, 'Niveau sans unité.'),
          organizationalUnitName: required(row.organizationalUnit, 'Relation unité absente.').name,
          status: row.status,
          classCount: row._count.classes,
        };
      });
    },

    async reorderGradeLevels(schoolId: string, orderedIds: string[]): Promise<void> {
      await withSchoolScope(db, schoolId, async (tx) => {
        const entityId = orderedIds[0];
        if (!entityId) throw errors.validation('La liste de niveaux est vide.');
        const count = await tx.gradeLevel.count({ where: { schoolId, id: { in: orderedIds } } });
        if (count !== orderedIds.length || new Set(orderedIds).size !== orderedIds.length)
          throw errors.validation('La liste de niveaux est invalide.');
        await Promise.all(
          orderedIds.map((id, orderIndex) =>
            tx.gradeLevel.update({ where: { id }, data: { orderIndex } }),
          ),
        );
        await audit.log(
          {
            action: AuditAction.GRADE_LEVEL_REORDERED,
            entityType: 'grade_level',
            entityId,
            schoolId,
            after: { orderedIds },
          },
          tx,
        );
      });
    },

    async deactivateGradeLevel(schoolId: string, id: string): Promise<GradeLevelDto> {
      return withSchoolScope(db, schoolId, async (tx) => {
        const before = await tx.gradeLevel.findFirst({
          where: { id, schoolId },
          include: { _count: { select: { classes: { where: { status: 'ACTIVE' } } } } },
        });
        if (!before) throw errors.notFound('Niveau introuvable.');
        if (before._count.classes > 0)
          throw errors.validation(
            'Ce niveau porte encore des classes actives. Désactivez-les d’abord.',
          );
        const row = await tx.gradeLevel.update({
          where: { id },
          data: { status: 'INACTIVE' },
          include: {
            organizationalUnit: { select: { name: true } },
            _count: { select: { classes: true } },
          },
        });
        await audit.log(
          {
            action: AuditAction.GRADE_LEVEL_DEACTIVATED,
            entityType: 'grade_level',
            entityId: id,
            schoolId,
            before: { status: before.status },
            after: { status: 'INACTIVE' },
          },
          tx,
        );
        return {
          id: row.id,
          name: row.name,
          code: row.code,
          orderIndex: row.orderIndex,
          cycle: row.cycle,
          organizationalUnitId: required(row.organizationalUnitId, 'Niveau sans unité.'),
          organizationalUnitName: required(row.organizationalUnit, 'Relation unité absente.').name,
          status: row.status,
          classCount: row._count.classes,
        };
      });
    },

    async listClasses(
      schoolId: string,
      query: {
        academic_year_id: string;
        grade_level_id?: string | undefined;
        organizational_unit_id?: string | undefined;
        language_section_id?: string | undefined;
        education_track_id?: string | undefined;
        status?: 'ACTIVE' | 'INACTIVE' | undefined;
      },
    ): Promise<ClassDto[]> {
      return withSchoolScope(db, schoolId, async (tx) =>
        (
          await tx.class.findMany({
            where: {
              schoolId,
              academicYearId: query.academic_year_id,
              ...(query.grade_level_id && { gradeLevelId: query.grade_level_id }),
              ...(query.organizational_unit_id && {
                organizationalUnitId: query.organizational_unit_id,
              }),
              ...(query.language_section_id && { languageSectionId: query.language_section_id }),
              ...(query.education_track_id && { educationTrackId: query.education_track_id }),
              ...(query.status && { status: query.status }),
            },
            include: {
              gradeLevel: { select: { name: true } },
              organizationalUnit: { select: { name: true } },
              languageSection: { select: { name: true } },
              educationTrack: { select: { name: true } },
              headTeacher: { select: { firstName: true, lastName: true } },
              _count: { select: { enrollments: { where: { status: 'ACTIVE' } } } },
            },
            orderBy: [{ gradeLevel: { orderIndex: 'asc' } }, { name: 'asc' }],
          })
        ).map(classDto),
      );
    },

    async getClassSummary(schoolId: string, id: string): Promise<ClassDto> {
      return withSchoolScope(db, schoolId, async (tx) => {
        const row = await tx.class.findFirst({
          where: { id, schoolId },
          include: {
            gradeLevel: { select: { name: true } },
            organizationalUnit: { select: { name: true } },
            languageSection: { select: { name: true } },
            educationTrack: { select: { name: true } },
            headTeacher: { select: { firstName: true, lastName: true } },
            _count: { select: { enrollments: { where: { status: 'ACTIVE' } } } },
          },
        });
        if (!row) throw errors.notFound('Classe introuvable.');
        return classDto(row);
      });
    },

    async createClasses(schoolId: string, inputs: CreateClassBody[]): Promise<ClassDto[]> {
      return withSchoolScope(db, schoolId, async (tx) => {
        const keys = new Set(
          inputs.map((item) => `${item.academicYearId}:${item.name.toLocaleLowerCase('fr')}`),
        );
        if (keys.size !== inputs.length)
          throw errors.conflict('Deux classes portent le même nom dans cette année.');
        const years = new Set(inputs.map((item) => item.academicYearId));
        for (const yearId of years) await requireWritableYear(tx, schoolId, yearId);
        const levelIds = [...new Set(inputs.map((item) => item.gradeLevelId))];
        const levelRows = await tx.gradeLevel.findMany({
          where: { schoolId, id: { in: levelIds }, status: 'ACTIVE' },
          include: { organizationalUnit: { select: { code: true } } },
        });
        if (levelRows.length !== levelIds.length)
          throw errors.validation('Un niveau est invalide ou inactif.');
        const [sections, tracks] = await Promise.all([
          tx.languageSection.findMany({ where: { schoolId, status: 'ACTIVE' } }),
          tx.educationTrack.findMany({ where: { schoolId, status: 'ACTIVE' } }),
        ]);
        for (const input of inputs) {
          const duplicate = await tx.class.findFirst({
            where: {
              schoolId,
              academicYearId: input.academicYearId,
              name: { equals: input.name, mode: 'insensitive' },
            },
          });
          if (duplicate)
            throw errors.conflict(`La classe « ${input.name} » existe déjà dans cette année.`);
        }
        const created = [];
        for (const input of inputs) {
          const level = required(
            levelRows.find((item) => item.id === input.gradeLevelId),
            'Niveau introuvable.',
          );
          const organizationalUnitId = input.organizationalUnitId ?? level.organizationalUnitId;
          if (!organizationalUnitId || organizationalUnitId !== level.organizationalUnitId)
            throw errors.validation('Le niveau et la classe doivent appartenir à la même unité.');
          const languageSectionId =
            input.languageSectionId ??
            sections.find(
              (item) =>
                item.organizationalUnitId === organizationalUnitId && item.code === 'FRANCOPHONE',
            )?.id;
          const educationTrackId =
            input.educationTrackId ??
            (level.organizationalUnit?.code === 'SECONDAIRE'
              ? tracks.find(
                  (item) =>
                    item.organizationalUnitId === organizationalUnitId && item.code === 'GENERAL',
                )?.id
              : null);
          if (
            !languageSectionId ||
            (level.organizationalUnit?.code === 'SECONDAIRE' && !educationTrackId)
          )
            throw errors.validation('Section linguistique ou filière manquante.');
          const row = await tx.class.create({
            data: {
              schoolId,
              academicYearId: input.academicYearId,
              gradeLevelId: input.gradeLevelId,
              organizationalUnitId,
              languageSectionId,
              educationTrackId: educationTrackId ?? null,
              name: input.name,
              capacity: input.capacity ?? null,
              headTeacherUserId: input.headTeacherUserId ?? null,
            },
            include: {
              gradeLevel: { select: { name: true } },
              organizationalUnit: { select: { name: true } },
              languageSection: { select: { name: true } },
              educationTrack: { select: { name: true } },
              headTeacher: { select: { firstName: true, lastName: true } },
              _count: { select: { enrollments: { where: { status: 'ACTIVE' } } } },
            },
          });
          created.push(classDto(row));
          await audit.log(
            {
              action: AuditAction.CLASS_CREATED,
              entityType: 'class',
              entityId: row.id,
              schoolId,
              after: input,
            },
            tx,
          );
        }
        return created;
      });
    },

    async updateClass(schoolId: string, id: string, input: UpdateClassBody): Promise<ClassDto> {
      return withSchoolScope(db, schoolId, async (tx) => {
        const before = await tx.class.findFirst({ where: { id, schoolId } });
        if (!before) throw errors.notFound('Classe introuvable.');
        await requireWritableYear(tx, schoolId, before.academicYearId);
        const data: Prisma.ClassUncheckedUpdateInput = {
          ...(input.gradeLevelId !== undefined && { gradeLevelId: input.gradeLevelId }),
          ...(input.organizationalUnitId !== undefined && {
            organizationalUnitId: input.organizationalUnitId,
          }),
          ...(input.languageSectionId !== undefined && {
            languageSectionId: input.languageSectionId,
          }),
          ...(input.educationTrackId !== undefined && { educationTrackId: input.educationTrackId }),
          ...(input.name !== undefined && { name: input.name }),
          ...(input.capacity !== undefined && { capacity: input.capacity }),
          ...(input.headTeacherUserId !== undefined && {
            headTeacherUserId: input.headTeacherUserId,
          }),
        };
        const row = await tx.class.update({
          where: { id },
          data,
          include: {
            gradeLevel: { select: { name: true } },
            organizationalUnit: { select: { name: true } },
            languageSection: { select: { name: true } },
            educationTrack: { select: { name: true } },
            headTeacher: { select: { firstName: true, lastName: true } },
            _count: { select: { enrollments: { where: { status: 'ACTIVE' } } } },
          },
        });
        await audit.log(
          {
            action: AuditAction.CLASS_UPDATED,
            entityType: 'class',
            entityId: id,
            schoolId,
            before,
            after: input,
          },
          tx,
        );
        return classDto(row);
      });
    },

    async deactivateClass(schoolId: string, id: string): Promise<ClassDto> {
      return withSchoolScope(db, schoolId, async (tx) => {
        const before = await tx.class.findFirst({ where: { id, schoolId } });
        if (!before) throw errors.notFound('Classe introuvable.');
        await requireWritableYear(tx, schoolId, before.academicYearId);
        const row = await tx.class.update({
          where: { id },
          data: { status: 'INACTIVE' },
          include: {
            gradeLevel: { select: { name: true } },
            organizationalUnit: { select: { name: true } },
            languageSection: { select: { name: true } },
            educationTrack: { select: { name: true } },
            headTeacher: { select: { firstName: true, lastName: true } },
            _count: { select: { enrollments: { where: { status: 'ACTIVE' } } } },
          },
        });
        await audit.log(
          {
            action: AuditAction.CLASS_DEACTIVATED,
            entityType: 'class',
            entityId: id,
            schoolId,
            before: { status: before.status },
            after: { status: 'INACTIVE' },
          },
          tx,
        );
        return classDto(row);
      });
    },

    async listCategories(schoolId: string): Promise<StudentCategoryDto[]> {
      return withSchoolScope(db, schoolId, async (tx) =>
        tx.studentCategory.findMany({
          where: { schoolId },
          select: { id: true, code: true, name: true, status: true },
          orderBy: { name: 'asc' },
        }),
      );
    },
    async createCategory(
      schoolId: string,
      input: { code: string; name: string },
    ): Promise<StudentCategoryDto> {
      return withSchoolScope(db, schoolId, async (tx) => {
        const row = await tx.studentCategory.create({
          data: { schoolId, code: input.code.toUpperCase(), name: input.name },
          select: { id: true, code: true, name: true, status: true },
        });
        await audit.log(
          {
            action: AuditAction.STUDENT_CATEGORY_CREATED,
            entityType: 'student_category',
            entityId: row.id,
            schoolId,
            after: input,
          },
          tx,
        );
        return row;
      });
    },
    async updateCategory(
      schoolId: string,
      id: string,
      input: {
        code?: string | undefined;
        name?: string | undefined;
        status?: 'ACTIVE' | 'INACTIVE' | undefined;
      },
    ): Promise<StudentCategoryDto> {
      return withSchoolScope(db, schoolId, async (tx) => {
        const before = await tx.studentCategory.findFirst({ where: { id, schoolId } });
        if (!before) throw errors.notFound('Catégorie introuvable.');
        const data: Prisma.StudentCategoryUncheckedUpdateInput = {
          ...(input.code !== undefined && { code: input.code.toUpperCase() }),
          ...(input.name !== undefined && { name: input.name }),
          ...(input.status !== undefined && { status: input.status }),
        };
        const row = await tx.studentCategory.update({
          where: { id },
          data,
          select: { id: true, code: true, name: true, status: true },
        });
        await audit.log(
          {
            action: AuditAction.STUDENT_CATEGORY_UPDATED,
            entityType: 'student_category',
            entityId: id,
            schoolId,
            before,
            after: input,
          },
          tx,
        );
        return row;
      });
    },

    async getSettings(schoolId: string): Promise<SchoolSettingsDto> {
      return withSchoolScope(db, schoolId, async (tx) => {
        const school = await tx.school.findUniqueOrThrow({
          where: { id: schoolId },
          include: { settings: true },
        });
        const settings =
          school.settings ?? (await tx.schoolSettings.create({ data: { schoolId } }));
        return {
          schoolId,
          schoolName: school.name,
          schoolCode: school.code,
          address: school.address,
          phone: school.phone,
          email: school.email,
          timezone: settings.timezone,
          currency: settings.currency,
          studentNumberPrefix: settings.studentNumberPrefix,
          studentNumberPadding: settings.studentNumberPadding,
          receiptNumberFormat: settings.receiptNumberFormat,
          paymentRefFormat: settings.paymentRefFormat,
          allocationStrategy: settings.allocationStrategy,
          allowOverpayment: settings.allowOverpayment,
          reminderDaysBefore: settings.reminderDaysBefore,
          reminderDaysAfter: settings.reminderDaysAfter,
          externalPaymentSlaHours: settings.externalPaymentSlaHours,
          smsEnabled: settings.smsEnabled,
          smsAllowedTypes: settings.smsAllowedTypes,
          smsMonthlyLimit: Number(settings.smsMonthlyLimit),
          notificationStartHour: settings.notificationStartHour,
          notificationEndHour: settings.notificationEndHour,
          balanceReminderEnabled: settings.balanceReminderEnabled,
          inviteTokenTtlDays: settings.inviteTokenTtlDays,
          discountApprovalThreshold: settings.discountApprovalThreshold,
        };
      });
    },
    async updateSettings(
      schoolId: string,
      input: Record<string, unknown>,
    ): Promise<SchoolSettingsDto> {
      await withSchoolScope(db, schoolId, async (tx) => {
        const { schoolName, address, phone, email, ...settings } = input;
        if (
          schoolName !== undefined ||
          address !== undefined ||
          phone !== undefined ||
          email !== undefined
        )
          await tx.school.update({
            where: { id: schoolId },
            data: {
              ...(schoolName !== undefined && { name: schoolName as string }),
              ...(address !== undefined && { address: address as string | null }),
              ...(phone !== undefined && { phone: phone as string | null }),
              ...(email !== undefined && { email: email as string | null }),
            },
          });
        if (Object.keys(settings).length)
          await tx.schoolSettings.upsert({
            where: { schoolId },
            create: {
              ...(settings as Omit<Prisma.SchoolSettingsUncheckedCreateInput, 'schoolId'>),
              schoolId,
            },
            update: settings as Prisma.SchoolSettingsUpdateInput,
          });
        await audit.log(
          {
            action: AuditAction.SETTINGS_UPDATED,
            entityType: 'school_settings',
            entityId: schoolId,
            schoolId,
            after: input,
          },
          tx,
        );
      });
      return this.getSettings(schoolId);
    },
  };
}

export type AcademicService = ReturnType<typeof createAcademicService>;
