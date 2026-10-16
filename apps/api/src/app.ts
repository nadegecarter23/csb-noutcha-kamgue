import Fastify from 'fastify';
import helmet from '@fastify/helmet';
import cors from '@fastify/cors';
import compress from '@fastify/compress';
import rateLimit from '@fastify/rate-limit';
import multipart from '@fastify/multipart';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import {
  serializerCompiler,
  validatorCompiler,
  jsonSchemaTransform,
  type ZodTypeProvider,
} from 'fastify-type-provider-zod';

import type { AppConfig } from './platform/config.js';
import type { Logger } from './platform/logger.js';
import type { Database } from './platform/db.js';
import type { Storage } from './platform/storage.js';
import type { Redis } from 'ioredis';

import { requestContextPlugin } from './platform/plugins/request-context.plugin.js';
import { errorHandlerPlugin } from './platform/plugins/error-handler.plugin.js';
import { authPlugin } from './platform/plugins/auth.plugin.js';
import { parentScopePlugin } from './platform/plugins/parent-scope.plugin.js';
import { healthRoutes } from './modules/health/health.routes.js';
import { createJwtService } from './platform/jwt.js';
import { createAuditService } from './platform/audit.js';
import { createIdentityRepository } from './modules/identity/identity.repository.js';
import { createAuthService } from './modules/identity/auth.service.js';
import { authRoutes } from './modules/identity/auth.routes.js';
import { createUsersService } from './modules/identity/users.service.js';
import { usersRoutes } from './modules/identity/users.routes.js';
import type { SmsProvider } from './platform/sms.js';
import { createAcademicService } from './modules/academic/academic.service.js';
import { academicRoutes } from './modules/academic/academic.routes.js';
import { createStudentsService } from './modules/students/students.service.js';
import { studentsRoutes } from './modules/students/students.routes.js';
import { createGuardiansService } from './modules/guardians/guardians.service.js';
import { guardiansRoutes } from './modules/guardians/guardians.routes.js';
import { createFinanceService } from './modules/finance/finance.service.js';
import { createPaymentsService } from './modules/finance/payments.service.js';
import { financeRoutes } from './modules/finance/finance.routes.js';
import { createImportsService } from './modules/imports/imports.service.js';
import { importsRoutes } from './modules/imports/imports.routes.js';
import { createCashService } from './modules/cash/cash.service.js';
import { cashRoutes } from './modules/cash/cash.routes.js';
import { createParentService } from './modules/parent/parent.service.js';
import { parentRoutes } from './modules/parent/parent.routes.js';
import { createPaymentProviderRegistry } from './modules/mobile-money/providers/registry.js';
import { createMobileMoneyService } from './modules/mobile-money/mobile-money.service.js';
import { mobileMoneyRoutes } from './modules/mobile-money/mobile-money.routes.js';
import { createNotificationsService } from './modules/notifications/notifications.service.js';
import { notificationRoutes } from './modules/notifications/notifications.routes.js';
import { createExternalPaymentsService } from './modules/external-payments/external-payments.service.js';
import { externalPaymentRoutes } from './modules/external-payments/external-payments.routes.js';
import { createReportingService } from './modules/reporting/reporting.service.js';
import { reportingRoutes } from './modules/reporting/reporting.routes.js';
import { createExportsService } from './modules/exports/exports.service.js';
import { exportsRoutes } from './modules/exports/exports.routes.js';
import { createAuditQueryService } from './modules/audit/audit.service.js';
import { auditRoutes } from './modules/audit/audit.routes.js';
import { createPedagogyService } from './modules/pedagogy/pedagogy.service.js';
import { pedagogyRoutes } from './modules/pedagogy/pedagogy.routes.js';
import { createTimetableService } from './modules/timetable/timetable.service.js';
import { timetableRoutes } from './modules/timetable/timetable.routes.js';
import { createAttendanceService } from './modules/attendance/attendance.service.js';
import { attendanceRoutes } from './modules/attendance/attendance.routes.js';
import { createAssessmentsService } from './modules/assessments/assessments.service.js';
import { assessmentsRoutes } from './modules/assessments/assessments.routes.js';
import { createReportCardsService } from './modules/report-cards/report-cards.service.js';
import { reportCardsRoutes } from './modules/report-cards/report-cards.routes.js';
import { createStudentLifeService } from './modules/student-life/student-life.service.js';
import { studentLifeRoutes } from './modules/student-life/student-life.routes.js';
import { createStaffService } from './modules/staff/staff.service.js';
import { staffRoutes } from './modules/staff/staff.routes.js';
import { createCommunicationsService } from './modules/communications/communications.service.js';
import { communicationsRoutes } from './modules/communications/communications.routes.js';
import { createSchoolServicesService } from './modules/school-services/school-services.service.js';
import { schoolServicesRoutes } from './modules/school-services/school-services.routes.js';
import { createPortalService } from './modules/portal/portal.service.js';
import { portalRoutes } from './modules/portal/portal.routes.js';
import { createProcurementService } from './modules/procurement/procurement.service.js';
import { procurementRoutes } from './modules/procurement/procurement.routes.js';
import { createSchoolModulesService } from './modules/school-modules/school-modules.service.js';
import { schoolModulesRoutes } from './modules/school-modules/school-modules.routes.js';
import { createPlatformService } from './modules/platform/platform.service.js';
import { platformRoutes } from './modules/platform/platform.routes.js';

declare module 'fastify' {
  interface FastifyContextConfig {
    /**
     * Marque explicitement une route comme accessible sans authentification.
     * Le test d'architecture de la Phase 01 échouera pour toute route mutative
     * qui n'a ni permission requise, ni ce marqueur.
     */
    public?: boolean;
  }
}

/** Préfixe de toutes les routes métier versionnées. */
export const API_PREFIX = '/api/v1';

export interface AppDependencies {
  config: AppConfig;
  logger: Logger;
  db: Database;
  redis: Redis;
  storage: Storage;
  sms: SmsProvider;
  /**
   * Observateur d'enregistrement de routes.
   *
   * Seam réservé au test d'architecture `route-guards.test.ts`, qui doit
   * inspecter les gardes de chaque route. Le hook `onRoute` de Fastify ne
   * s'applique qu'aux routes enregistrées APRÈS lui ; il doit donc être posé
   * ici, avant tout `register`. Jamais utilisé en production.
   */
  onRoute?: (route: { method: string; url: string; hasAuth: boolean; isPublic: boolean }) => void;
}

/**
 * Le type de retour est volontairement inféré : l'instance est paramétrée par
 * le ZodTypeProvider et par l'instance de logger, deux informations que
 * `FastifyInstance` nu perdrait. Utilisez le type `CplanApp` exporté plus bas.
 */
export async function buildApp(deps: AppDependencies) {
  const { config, logger, db, redis, storage, sms } = deps;

  const app = Fastify({
    loggerInstance: logger,
    trustProxy: true,
    ajv: { customOptions: { removeAdditional: false } },
    bodyLimit: 1 * 1024 * 1024, // 1 Mo ; les téléversements auront leur propre limite
  }).withTypeProvider<ZodTypeProvider>();

  // Zod comme unique source de vérité pour la validation et la sérialisation.
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  // Doit précéder tout register : onRoute ne voit que les routes suivantes.
  if (deps.onRoute) {
    const observe = deps.onRoute;
    app.addHook('onRoute', (route) => {
      const handlers = Array.isArray(route.preHandler)
        ? route.preHandler
        : route.preHandler
          ? [route.preHandler]
          : [];
      const methods = Array.isArray(route.method) ? route.method : [route.method];

      for (const method of methods) {
        observe({
          method,
          url: route.url,
          hasAuth: handlers.length > 0,
          isPublic: route.config?.public === true,
        });
      }
    });
  }

  /* --- Sécurité ---------------------------------------------------------- */
  // En développement, la CSP par défaut de helmet casse Swagger UI ; en
  // production on garde celle de helmet et on active HSTS.
  await app.register(
    helmet,
    config.isProduction
      ? { hsts: { maxAge: 31_536_000, includeSubDomains: true, preload: true } }
      : { contentSecurityPolicy: false, hsts: false },
  );

  await app.register(cors, {
    origin: config.CORS_ORIGINS,
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'Idempotency-Key',
      'X-Request-Id',
      'X-Active-Scope-Type',
      'X-Organizational-Unit-Id',
      'X-Language-Section-Id',
      'X-Education-Track-Id',
      'X-Class-Id',
    ],
    exposedHeaders: ['X-Request-Id'],
  });

  await app.register(rateLimit, {
    global: true,
    max: config.isProduction ? 300 : 10_000,
    timeWindow: '1 minute',
    // En test, le compteur reste en mémoire : les tests ne doivent dépendre
    // d'aucun service externe.
    ...(config.isTest ? {} : { redis }),
    // Les sondes de santé ne doivent jamais être limitées : un orchestrateur
    // qui se fait refuser un health check redémarre le service en boucle.
    allowList: (request) => request.url.startsWith('/health') || request.url === '/metrics',
  });

  /* --- Confort ----------------------------------------------------------- */
  await app.register(compress, { global: true, encodings: ['gzip', 'deflate'] });
  await app.register(multipart, { limits: { files: 5, fileSize: 10 * 1024 * 1024, fields: 20 } });

  /* --- Socle transverse --------------------------------------------------- */
  await app.register(requestContextPlugin);
  await app.register(errorHandlerPlugin);

  const jwt = createJwtService(config);
  await app.register(authPlugin, { jwt, db });
  await app.register(parentScopePlugin, { db });

  /* --- Documentation (jamais en production) ------------------------------- */
  if (!config.isProduction) {
    await app.register(swagger, {
      openapi: {
        info: {
          title: 'CSB Noutcha KAMGUE API',
          description:
            'API du Complexe Scolaire Bilingue Noutcha KAMGUE — gestion scolaire et financière.\n\n' +
            'Voir docs/00-INDEX.md pour le plan de développement.',
          version: '0.1.0',
        },
        servers: [{ url: `http://localhost:${config.PORT}`, description: 'Développement local' }],
        components: {
          securitySchemes: {
            bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
          },
        },
      },
      transform: jsonSchemaTransform,
    });

    await app.register(swaggerUi, {
      routePrefix: '/docs',
      uiConfig: { docExpansion: 'list', deepLinking: true },
    });
  }

  /* --- Sondes de santé, hors versionnement --------------------------------- */
  // Les orchestrateurs (Docker, Kubernetes) sondent `/health` sans préfixe :
  // une sonde ne doit pas dépendre de la version de l'API métier.
  await app.register(healthRoutes({ db, redis, storage }));

  /* --- Modules métier, sous /api/v1 ---------------------------------------- */
  // Tout le contrat public est versionné (docs/06-CONVENTIONS-DEV.md §2).
  // L'application mobile installée sur un téléphone n'est pas déployable à la
  // demande : une rupture de contrat impose /v2, jamais une modification de v1.
  await app.register(
    async (api) => {
      // Exposée aussi ici pour que les clients web et mobile n'aient qu'une
      // seule base d'URL à connaître.
      await api.register(healthRoutes({ db, redis, storage }));

      // Phase 01 — identité, rôles, accès
      const audit = createAuditService(db);
      await api.register(schoolModulesRoutes(createSchoolModulesService(db, audit)));
      await api.register(auditRoutes(createAuditQueryService(db)));
      const identityRepository = createIdentityRepository(db);
      const authService = createAuthService({
        repository: identityRepository,
        jwt,
        sms,
        audit,
        config,
        logger,
      });
      await api.register(authRoutes(authService, { relaxedRateLimits: config.isTest }));

      const usersService = createUsersService({
        db,
        repository: identityRepository,
        auth: authService,
        audit,
        sms,
        config,
      });
      await api.register(usersRoutes(usersService));
      await api.register(platformRoutes(createPlatformService(db)));

      const academicService = createAcademicService(db, audit);
      await api.register(academicRoutes(academicService));

      const pedagogyService = createPedagogyService(db, audit);
      await api.register(pedagogyRoutes(pedagogyService));

      const timetableService = createTimetableService(db, audit);
      await api.register(timetableRoutes(timetableService));

      const studentsService = createStudentsService(db, audit);
      await api.register(studentsRoutes(studentsService));

      const guardiansService = createGuardiansService(db, audit);
      await api.register(guardiansRoutes(guardiansService));

      const financeService = createFinanceService(db, audit);
      const paymentsService = createPaymentsService(db, audit);
      const notificationsService = createNotificationsService(db, sms, logger);
      const attendanceService = createAttendanceService(db, audit, notificationsService);
      await api.register(attendanceRoutes(attendanceService));
      await api.register(assessmentsRoutes(createAssessmentsService(db, audit)));
      await api.register(reportCardsRoutes(createReportCardsService(db, audit)));
      await api.register(studentLifeRoutes(createStudentLifeService(db, audit)));
      await api.register(staffRoutes(createStaffService(db, audit)));
      await api.register(communicationsRoutes(createCommunicationsService(db, audit)));
      await api.register(schoolServicesRoutes(createSchoolServicesService(db, audit)));
      await api.register(portalRoutes(createPortalService(db)));
      await api.register(procurementRoutes(createProcurementService(db, audit, storage)));
      await api.register(financeRoutes(financeService, paymentsService));
      const cashService = createCashService(db, audit, paymentsService);
      await api.register(cashRoutes(cashService));
      const parentService = createParentService(db, paymentsService);
      await api.register(parentRoutes(parentService));
      await api.register(notificationRoutes(notificationsService));
      const paymentProviders = createPaymentProviderRegistry(config);
      const mobileMoneyService = createMobileMoneyService(
        db,
        audit,
        paymentsService,
        paymentProviders,
        config.PAYMENT_WEBHOOK_BASE_URL ?? `http://localhost:${config.PORT}${API_PREFIX}/webhooks`,
      );
      await api.register(mobileMoneyRoutes(mobileMoneyService));
      const externalPaymentsService = createExternalPaymentsService(
        db,
        audit,
        paymentsService,
        storage,
        notificationsService,
      );
      await api.register(externalPaymentRoutes(externalPaymentsService));
      const reportingService = createReportingService(db, redis, audit);
      await api.register(reportingRoutes(reportingService));
      const exportsService = createExportsService(
        db,
        storage,
        audit,
        reportingService,
        notificationsService,
      );
      await api.register(exportsRoutes(exportsService));

      const importService = createImportsService(db, audit);
      await api.register(importsRoutes(importService));

      // Phases 01–07 : identité, scolarité, responsables et noyau financier.
    },
    { prefix: API_PREFIX },
  );

  return app;
}

/** Type de l'instance Fastify CSB Noutcha KAMGUE, provider Zod et logger compris. */
export type CplanApp = Awaited<ReturnType<typeof buildApp>>;
