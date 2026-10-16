import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import {
  academicPeriodSchema,
  assessmentOverviewSchema,
  assessmentQuerySchema,
  assessmentSchema,
  assessmentTypeSchema,
  competencySchema,
  createAcademicPeriodBodySchema,
  createAssessmentBodySchema,
  createAssessmentTypeBodySchema,
  createCompetencyBodySchema,
  createGradingPolicyBodySchema,
  gradingPolicySchema,
  idSchema,
  saveGradesBodySchema,
  updateAcademicPeriodStatusBodySchema,
} from '@cplan/contracts';
import { requireSchool } from '../../platform/plugins/auth.plugin.js';
import type { AssessmentsService } from './assessments.service.js';

export function assessmentsRoutes(service: AssessmentsService): FastifyPluginAsyncZod {
  return async (app) => {
    const security = [{ bearerAuth: [] }];
    app.get(
      '/assessments/overview',
      {
        preHandler: [
          app.authenticate,
          app.requireSchoolContext,
          app.requirePermission('assessments.read'),
        ],
        schema: {
          tags: ['Évaluations'],
          security,
          querystring: assessmentQuerySchema,
          response: { 200: assessmentOverviewSchema },
        },
      },
      (request) =>
        service.overview(requireSchool(request), {
          academicYearId: request.query.academic_year_id,
          ...(request.query.class_id && { classId: request.query.class_id }),
          ...(request.query.period_id && { periodId: request.query.period_id }),
        }),
    );
    app.post(
      '/academic-periods',
      {
        preHandler: [
          app.authenticate,
          app.requireSchoolContext,
          app.requirePermission('assessments.manage'),
        ],
        schema: {
          tags: ['Évaluations'],
          security,
          body: createAcademicPeriodBodySchema,
          response: { 201: academicPeriodSchema },
        },
      },
      async (request, reply) =>
        reply.code(201).send(await service.createPeriod(requireSchool(request), request.body)),
    );
    app.patch(
      '/academic-periods/:id/status',
      {
        preHandler: [
          app.authenticate,
          app.requireSchoolContext,
          app.requirePermission('assessments.manage'),
        ],
        schema: {
          tags: ['Évaluations'],
          security,
          params: z.object({ id: idSchema }),
          body: updateAcademicPeriodStatusBodySchema,
          response: { 200: academicPeriodSchema },
        },
      },
      (request) =>
        service.updatePeriodStatus(requireSchool(request), request.params.id, request.body),
    );
    app.post(
      '/assessment-types',
      {
        preHandler: [
          app.authenticate,
          app.requireSchoolContext,
          app.requirePermission('assessments.manage'),
        ],
        schema: {
          tags: ['Évaluations'],
          security,
          body: createAssessmentTypeBodySchema,
          response: { 201: assessmentTypeSchema },
        },
      },
      async (request, reply) =>
        reply.code(201).send(await service.createType(requireSchool(request), request.body)),
    );
    app.post(
      '/competencies',
      {
        preHandler: [
          app.authenticate,
          app.requireSchoolContext,
          app.requirePermission('assessments.manage'),
        ],
        schema: {
          tags: ['Évaluations'],
          security,
          body: createCompetencyBodySchema,
          response: { 201: competencySchema },
        },
      },
      async (request, reply) =>
        reply.code(201).send(await service.createCompetency(requireSchool(request), request.body)),
    );
    app.post(
      '/grading-policies',
      {
        preHandler: [
          app.authenticate,
          app.requireSchoolContext,
          app.requirePermission('grading_policies.manage'),
        ],
        schema: {
          tags: ['Évaluations'],
          security,
          body: createGradingPolicyBodySchema,
          response: { 201: gradingPolicySchema },
        },
      },
      async (request, reply) =>
        reply.code(201).send(await service.createPolicy(requireSchool(request), request.body)),
    );
    app.post(
      '/assessments',
      {
        preHandler: [
          app.authenticate,
          app.requireSchoolContext,
          app.requirePermission('assessments.manage'),
        ],
        schema: {
          tags: ['Évaluations'],
          security,
          body: createAssessmentBodySchema,
          response: { 201: assessmentSchema },
        },
      },
      async (request, reply) =>
        reply.code(201).send(await service.createAssessment(requireSchool(request), request.body)),
    );
    app.put(
      '/assessments/:id/grades',
      {
        preHandler: [
          app.authenticate,
          app.requireSchoolContext,
          app.requirePermission('assessments.grade'),
        ],
        schema: {
          tags: ['Évaluations'],
          security,
          params: z.object({ id: idSchema }),
          body: saveGradesBodySchema,
          response: { 200: assessmentSchema },
        },
      },
      (request) => service.saveGrades(requireSchool(request), request.params.id, request.body),
    );
    app.post(
      '/assessments/:id/publish',
      {
        preHandler: [
          app.authenticate,
          app.requireSchoolContext,
          app.requirePermission('assessments.publish'),
        ],
        schema: {
          tags: ['Évaluations'],
          security,
          params: z.object({ id: idSchema }),
          body: z.object({ lock: z.boolean().default(false) }),
          response: { 200: assessmentSchema },
        },
      },
      (request) => service.publish(requireSchool(request), request.params.id, request.body.lock),
    );
  };
}
