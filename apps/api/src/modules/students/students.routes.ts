import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import {
  cancelEnrollmentBodySchema,
  changeStudentStatusBodySchema,
  correctStudentNumberBodySchema,
  createEnrollmentBodySchema,
  createStudentBodySchema,
  createStudentResultSchema,
  enrollmentListQuerySchema,
  enrollmentSchema,
  idSchema,
  reasonBodySchema,
  registrarDashboardSchema,
  studentHistoryItemSchema,
  studentPhotoBodySchema,
  studentListQuerySchema,
  studentListSchema,
  studentSchema,
  transferClassBodySchema,
  updateEnrollmentBodySchema,
  updateStudentBodySchema,
} from '@cplan/contracts';
import { requireAuth, requireSchool } from '../../platform/plugins/auth.plugin.js';
import type { StudentsService } from './students.service.js';

const params = z.object({ id: idSchema });
const dashboardQuery = z.object({ academic_year_id: idSchema.optional() });

export function studentsRoutes(service: StudentsService): FastifyPluginAsyncZod {
  return async (app) => {
    const schoolGuards = (permission: Parameters<typeof app.requirePermission>[0]) => [
      app.authenticate,
      app.requireSchoolContext,
      app.requirePermission(permission),
    ];
    app.get(
      '/students',
      {
        preHandler: schoolGuards('students.read'),
        schema: {
          tags: ['Élèves'],
          security: [{ bearerAuth: [] }],
          querystring: studentListQuerySchema,
          response: { 200: studentListSchema },
        },
      },
      (request) => service.list(requireSchool(request), request.query),
    );
    app.get(
      '/students/:id',
      {
        preHandler: schoolGuards('students.read'),
        schema: {
          tags: ['Élèves'],
          security: [{ bearerAuth: [] }],
          params,
          response: { 200: studentSchema },
        },
      },
      (request) => service.get(requireSchool(request), request.params.id),
    );
    app.post(
      '/students',
      {
        preHandler: schoolGuards('students.create'),
        schema: {
          tags: ['Élèves'],
          security: [{ bearerAuth: [] }],
          body: createStudentBodySchema,
          response: { 201: createStudentResultSchema },
        },
      },
      async (request, reply) =>
        reply.status(201).send(await service.create(requireSchool(request), request.body)),
    );
    app.patch(
      '/students/:id',
      {
        preHandler: schoolGuards('students.update'),
        schema: {
          tags: ['Élèves'],
          security: [{ bearerAuth: [] }],
          params,
          body: updateStudentBodySchema,
          response: { 200: studentSchema },
        },
      },
      (request) => service.update(requireSchool(request), request.params.id, request.body),
    );
    app.post(
      '/students/:id/student-number',
      {
        preHandler: schoolGuards('students.update'),
        schema: {
          tags: ['Élèves'],
          security: [{ bearerAuth: [] }],
          params,
          body: correctStudentNumberBodySchema,
          response: { 200: studentSchema },
        },
      },
      (request) =>
        service.correctNumber(
          requireSchool(request),
          request.params.id,
          request.body.studentNumber,
          request.body.reason,
        ),
    );
    app.post(
      '/students/:id/status',
      {
        preHandler: schoolGuards('students.change_status'),
        schema: {
          tags: ['Élèves'],
          security: [{ bearerAuth: [] }],
          params,
          body: changeStudentStatusBodySchema,
          response: { 200: studentSchema },
        },
      },
      (request) =>
        service.changeStatus(
          requireSchool(request),
          request.params.id,
          request.body.status,
          request.body.reason,
        ),
    );
    app.post(
      '/students/:id/photo',
      {
        preHandler: schoolGuards('students.update'),
        schema: {
          tags: ['Élèves'],
          security: [{ bearerAuth: [] }],
          params,
          body: studentPhotoBodySchema,
          response: { 200: studentSchema },
        },
      },
      (request) =>
        service.attachPhoto(requireSchool(request), request.params.id, request.body.fileId),
    );
    app.delete(
      '/students/:id',
      {
        preHandler: schoolGuards('students.archive'),
        schema: {
          tags: ['Élèves'],
          security: [{ bearerAuth: [] }],
          params,
          body: reasonBodySchema,
          response: { 204: z.null() },
        },
      },
      async (request, reply) => {
        await service.remove(requireSchool(request), request.params.id, request.body.reason);
        return reply.status(204).send(null);
      },
    );
    app.get(
      '/students/:id/history',
      {
        preHandler: schoolGuards('students.read'),
        schema: {
          tags: ['Élèves'],
          security: [{ bearerAuth: [] }],
          params,
          response: { 200: z.array(studentHistoryItemSchema) },
        },
      },
      (request) => service.history(requireSchool(request), request.params.id),
    );

    app.get(
      '/enrollments',
      {
        preHandler: schoolGuards('enrollments.read'),
        schema: {
          tags: ['Inscriptions'],
          security: [{ bearerAuth: [] }],
          querystring: enrollmentListQuerySchema,
          response: { 200: z.array(enrollmentSchema) },
        },
      },
      (request) => service.listEnrollments(requireSchool(request), request.query),
    );
    app.post(
      '/enrollments',
      {
        preHandler: schoolGuards('enrollments.create'),
        schema: {
          tags: ['Inscriptions'],
          security: [{ bearerAuth: [] }],
          body: createEnrollmentBodySchema,
          response: { 201: enrollmentSchema },
        },
      },
      async (request, reply) =>
        reply
          .status(201)
          .send(await service.createEnrollment(requireSchool(request), request.body)),
    );
    app.patch(
      '/enrollments/:id',
      {
        preHandler: schoolGuards('enrollments.update'),
        schema: {
          tags: ['Inscriptions'],
          security: [{ bearerAuth: [] }],
          params,
          body: updateEnrollmentBodySchema,
          response: { 200: enrollmentSchema },
        },
      },
      (request) =>
        service.updateEnrollment(requireSchool(request), request.params.id, request.body),
    );
    app.post(
      '/enrollments/:id/transfer-class',
      {
        preHandler: schoolGuards('enrollments.transfer_class'),
        schema: {
          tags: ['Inscriptions'],
          security: [{ bearerAuth: [] }],
          params,
          body: transferClassBodySchema,
          response: { 200: enrollmentSchema },
        },
      },
      (request) =>
        service.transferClass(
          requireSchool(request),
          request.params.id,
          request.body.toClassId,
          request.body.reason,
          request.body.effectiveAt,
        ),
    );
    app.post(
      '/enrollments/:id/cancel',
      {
        preHandler: schoolGuards('enrollments.cancel'),
        schema: {
          tags: ['Inscriptions'],
          security: [{ bearerAuth: [] }],
          params,
          body: cancelEnrollmentBodySchema,
          response: { 200: enrollmentSchema },
        },
      },
      (request) =>
        service.cancelEnrollment(requireSchool(request), request.params.id, request.body.reason),
    );

    app.get(
      '/dashboard/registrar',
      {
        preHandler: schoolGuards('students.read'),
        schema: {
          tags: ['Tableau de bord'],
          security: [{ bearerAuth: [] }],
          querystring: dashboardQuery,
          response: { 200: registrarDashboardSchema },
        },
      },
      (request) => {
        requireAuth(request);
        return service.dashboard(requireSchool(request), request.query.academic_year_id);
      },
    );
  };
}
