import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import {
  academicYearSchema,
  classListQuerySchema,
  classSchema,
  createAcademicYearBodySchema,
  createClassesBodySchema,
  createGradeLevelBodySchema,
  createStudentCategoryBodySchema,
  duplicateStructureBodySchema,
  duplicateStructureResultSchema,
  gradeLevelSchema,
  idSchema,
  lifecycleBodySchema,
  reorderGradeLevelsBodySchema,
  schoolSettingsSchema,
  studentCategorySchema,
  updateAcademicYearBodySchema,
  updateClassBodySchema,
  updateGradeLevelBodySchema,
  updateSettingsBodySchema,
  updateStudentCategoryBodySchema,
  organizationTreeSchema,
  updateOrganizationReferenceBodySchema,
} from '@cplan/contracts';
import { requireSchool } from '../../platform/plugins/auth.plugin.js';
import type { AcademicService } from './academic.service.js';

const params = z.object({ id: idSchema });

export function academicRoutes(service: AcademicService): FastifyPluginAsyncZod {
  return async (app) => {
    app.get(
      '/organization',
      {
        preHandler: [
          app.authenticate,
          app.requireSchoolContext,
          app.requirePermission('grade_levels.read'),
        ],
        schema: {
          tags: ['Référentiel scolaire'],
          security: [{ bearerAuth: [] }],
          response: { 200: organizationTreeSchema },
        },
      },
      (request) => service.getOrganization(requireSchool(request)),
    );
    app.patch(
      '/organization/:kind/:id',
      {
        preHandler: [
          app.authenticate,
          app.requireSchoolContext,
          app.requirePermission('grade_levels.manage'),
        ],
        schema: {
          tags: ['Référentiel scolaire'],
          security: [{ bearerAuth: [] }],
          params: z.object({ kind: z.enum(['units', 'sections', 'tracks']), id: idSchema }),
          body: updateOrganizationReferenceBodySchema,
          response: { 200: organizationTreeSchema },
        },
      },
      (request) =>
        service.updateOrganizationReference(
          requireSchool(request),
          request.params.kind,
          request.params.id,
          request.body,
        ),
    );
    app.get(
      '/academic-years',
      {
        preHandler: [
          app.authenticate,
          app.requireSchoolContext,
          app.requirePermission('academic_years.read'),
        ],
        schema: {
          tags: ['Référentiel scolaire'],
          security: [{ bearerAuth: [] }],
          response: { 200: z.array(academicYearSchema) },
        },
      },
      (request) => service.listYears(requireSchool(request)),
    );
    app.post(
      '/academic-years',
      {
        preHandler: [
          app.authenticate,
          app.requireSchoolContext,
          app.requirePermission('academic_years.create'),
        ],
        schema: {
          tags: ['Référentiel scolaire'],
          security: [{ bearerAuth: [] }],
          body: createAcademicYearBodySchema,
          response: { 201: academicYearSchema },
        },
      },
      async (request, reply) =>
        reply.status(201).send(await service.createYear(requireSchool(request), request.body)),
    );
    app.patch(
      '/academic-years/:id',
      {
        preHandler: [
          app.authenticate,
          app.requireSchoolContext,
          app.requirePermission('academic_years.update'),
        ],
        schema: {
          tags: ['Référentiel scolaire'],
          security: [{ bearerAuth: [] }],
          params,
          body: updateAcademicYearBodySchema,
          response: { 200: academicYearSchema },
        },
      },
      (request) => service.updateYear(requireSchool(request), request.params.id, request.body),
    );
    for (const transition of ['activate', 'close', 'archive'] as const) {
      app.post(
        `/academic-years/:id/${transition}`,
        {
          preHandler: [
            app.authenticate,
            app.requireSchoolContext,
            app.requirePermission(
              transition === 'activate' ? 'academic_years.update' : 'academic_years.close',
            ),
          ],
          schema: {
            tags: ['Référentiel scolaire'],
            security: [{ bearerAuth: [] }],
            params,
            body: lifecycleBodySchema,
            response: { 200: academicYearSchema },
          },
        },
        (request) =>
          service.transitionYear(
            requireSchool(request),
            request.params.id,
            transition === 'activate' ? 'ACTIVE' : transition === 'close' ? 'CLOSED' : 'ARCHIVED',
            request.body.reason,
          ),
      );
    }
    app.post(
      '/academic-years/:id/duplicate-structure',
      {
        preHandler: [
          app.authenticate,
          app.requireSchoolContext,
          app.requirePermission('academic_years.create'),
        ],
        schema: {
          tags: ['Référentiel scolaire'],
          security: [{ bearerAuth: [] }],
          params,
          body: duplicateStructureBodySchema,
          response: { 200: duplicateStructureResultSchema },
        },
      },
      (request) =>
        service.duplicateStructure(
          requireSchool(request),
          request.params.id,
          request.body.targetYearId,
          request.body.preview,
        ),
    );

    app.get(
      '/grade-levels',
      {
        preHandler: [
          app.authenticate,
          app.requireSchoolContext,
          app.requirePermission('grade_levels.read'),
        ],
        schema: {
          tags: ['Référentiel scolaire'],
          security: [{ bearerAuth: [] }],
          response: { 200: z.array(gradeLevelSchema) },
        },
      },
      (request) => service.listGradeLevels(requireSchool(request)),
    );
    app.post(
      '/grade-levels',
      {
        preHandler: [
          app.authenticate,
          app.requireSchoolContext,
          app.requirePermission('grade_levels.manage'),
        ],
        schema: {
          tags: ['Référentiel scolaire'],
          security: [{ bearerAuth: [] }],
          body: createGradeLevelBodySchema,
          response: { 201: gradeLevelSchema },
        },
      },
      async (request, reply) =>
        reply
          .status(201)
          .send(await service.createGradeLevel(requireSchool(request), request.body)),
    );
    app.patch(
      '/grade-levels/:id',
      {
        preHandler: [
          app.authenticate,
          app.requireSchoolContext,
          app.requirePermission('grade_levels.manage'),
        ],
        schema: {
          tags: ['Référentiel scolaire'],
          security: [{ bearerAuth: [] }],
          params,
          body: updateGradeLevelBodySchema,
          response: { 200: gradeLevelSchema },
        },
      },
      (request) =>
        service.updateGradeLevel(requireSchool(request), request.params.id, request.body),
    );
    app.post(
      '/grade-levels/reorder',
      {
        preHandler: [
          app.authenticate,
          app.requireSchoolContext,
          app.requirePermission('grade_levels.manage'),
        ],
        schema: {
          tags: ['Référentiel scolaire'],
          security: [{ bearerAuth: [] }],
          body: reorderGradeLevelsBodySchema,
          response: { 204: z.null() },
        },
      },
      async (request, reply) => {
        await service.reorderGradeLevels(requireSchool(request), request.body.orderedIds);
        return reply.status(204).send(null);
      },
    );
    app.post(
      '/grade-levels/:id/deactivate',
      {
        preHandler: [
          app.authenticate,
          app.requireSchoolContext,
          app.requirePermission('grade_levels.manage'),
        ],
        schema: {
          tags: ['Référentiel scolaire'],
          security: [{ bearerAuth: [] }],
          params,
          response: { 200: gradeLevelSchema },
        },
      },
      (request) => service.deactivateGradeLevel(requireSchool(request), request.params.id),
    );

    app.get(
      '/classes',
      {
        preHandler: [
          app.authenticate,
          app.requireSchoolContext,
          app.requirePermission('classes.read'),
        ],
        schema: {
          tags: ['Référentiel scolaire'],
          security: [{ bearerAuth: [] }],
          querystring: classListQuerySchema,
          response: { 200: z.array(classSchema) },
        },
      },
      (request) => service.listClasses(requireSchool(request), request.query),
    );
    app.post(
      '/classes',
      {
        preHandler: [
          app.authenticate,
          app.requireSchoolContext,
          app.requirePermission('classes.manage'),
        ],
        schema: {
          tags: ['Référentiel scolaire'],
          security: [{ bearerAuth: [] }],
          body: createClassesBodySchema,
          response: { 201: z.array(classSchema) },
        },
      },
      async (request, reply) =>
        reply
          .status(201)
          .send(await service.createClasses(requireSchool(request), request.body.classes)),
    );
    app.patch(
      '/classes/:id',
      {
        preHandler: [
          app.authenticate,
          app.requireSchoolContext,
          app.requirePermission('classes.manage'),
        ],
        schema: {
          tags: ['Référentiel scolaire'],
          security: [{ bearerAuth: [] }],
          params,
          body: updateClassBodySchema,
          response: { 200: classSchema },
        },
      },
      (request) => service.updateClass(requireSchool(request), request.params.id, request.body),
    );
    app.post(
      '/classes/:id/deactivate',
      {
        preHandler: [
          app.authenticate,
          app.requireSchoolContext,
          app.requirePermission('classes.manage'),
        ],
        schema: {
          tags: ['Référentiel scolaire'],
          security: [{ bearerAuth: [] }],
          params,
          response: { 200: classSchema },
        },
      },
      (request) => service.deactivateClass(requireSchool(request), request.params.id),
    );
    app.get(
      '/classes/:id/summary',
      {
        preHandler: [
          app.authenticate,
          app.requireSchoolContext,
          app.requirePermission('classes.read'),
        ],
        schema: {
          tags: ['Référentiel scolaire'],
          security: [{ bearerAuth: [] }],
          params,
          response: { 200: classSchema },
        },
      },
      (request) => service.getClassSummary(requireSchool(request), request.params.id),
    );

    app.get(
      '/student-categories',
      {
        preHandler: [
          app.authenticate,
          app.requireSchoolContext,
          app.requirePermission('grade_levels.read'),
        ],
        schema: {
          tags: ['Référentiel scolaire'],
          security: [{ bearerAuth: [] }],
          response: { 200: z.array(studentCategorySchema) },
        },
      },
      (request) => service.listCategories(requireSchool(request)),
    );
    app.post(
      '/student-categories',
      {
        preHandler: [
          app.authenticate,
          app.requireSchoolContext,
          app.requirePermission('grade_levels.manage'),
        ],
        schema: {
          tags: ['Référentiel scolaire'],
          security: [{ bearerAuth: [] }],
          body: createStudentCategoryBodySchema,
          response: { 201: studentCategorySchema },
        },
      },
      async (request, reply) =>
        reply.status(201).send(await service.createCategory(requireSchool(request), request.body)),
    );
    app.patch(
      '/student-categories/:id',
      {
        preHandler: [
          app.authenticate,
          app.requireSchoolContext,
          app.requirePermission('grade_levels.manage'),
        ],
        schema: {
          tags: ['Référentiel scolaire'],
          security: [{ bearerAuth: [] }],
          params,
          body: updateStudentCategoryBodySchema,
          response: { 200: studentCategorySchema },
        },
      },
      (request) => service.updateCategory(requireSchool(request), request.params.id, request.body),
    );

    app.get(
      '/settings',
      {
        preHandler: [
          app.authenticate,
          app.requireSchoolContext,
          app.requirePermission('settings.read'),
        ],
        schema: {
          tags: ['Paramètres'],
          security: [{ bearerAuth: [] }],
          response: { 200: schoolSettingsSchema },
        },
      },
      (request) => service.getSettings(requireSchool(request)),
    );
    app.patch(
      '/settings',
      {
        preHandler: [
          app.authenticate,
          app.requireSchoolContext,
          app.requirePermission('settings.update'),
        ],
        schema: {
          tags: ['Paramètres'],
          security: [{ bearerAuth: [] }],
          body: updateSettingsBodySchema,
          response: { 200: schoolSettingsSchema },
        },
      },
      (request) => service.updateSettings(requireSchool(request), request.body),
    );
  };
}
