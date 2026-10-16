/**
 * @cplan/contracts — contrats d'API partagés entre l'API, le web et le mobile.
 *
 * Source de vérité unique des DTO (docs/02-ARCHITECTURE-TECHNIQUE.md §2).
 * Un schéma défini ici est utilisé par Fastify pour valider et sérialiser, et
 * par les clients pour typer leurs appels : aucune dérive possible entre les
 * trois applications.
 *
 * S'enrichit à chaque phase, au fur et à mesure des endpoints livrés.
 */

export * from './primitives.js';
export * from './errors.js';
export * from './pagination.js';
export * from './permissions.js';
export * from './roles.js';
export * from './auth.js';
export * from './academic.js';
export * from './users.js';
export * from './students.js';
export * from './guardians.js';
export * from './finance.js';
export * from './imports.js';
export * from './cash.js';
export * from './parent.js';
export * from './mobile-money.js';
export * from './external-payments.js';
export * from './notifications.js';
export * from './reporting.js';
export * from './audit.js';
export * from './pedagogy.js';
export * from './timetable.js';
export * from './attendance.js';
export * from './assessments.js';
export * from './report-cards.js';
export * from './student-life.js';
export * from './staff.js';
export * from './communications.js';
export * from './school-services.js';
export * from './portal.js';
export * from './procurement.js';
export * from './modules.js';
export * from './platform.js';
