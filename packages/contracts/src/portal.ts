import { z } from 'zod';
import { idSchema } from './primitives.js';
import { announcementSchema, homeworkSchema } from './communications.js';
export const portalLearnerSchema = z.object({
  id: idSchema,
  name: z.string(),
  className: z.string().nullable(),
  attendanceRate: z.number().min(0).max(100).nullable(),
  average: z.number().nullable(),
});
export const portalScheduleItemSchema = z.object({
  id: idSchema,
  title: z.string(),
  detail: z.string(),
  startsAt: z.string().datetime(),
});
export const portalOverviewSchema = z.object({
  mode: z.enum(['TEACHER', 'PARENT', 'STUDENT', 'STAFF']),
  displayName: z.string(),
  cards: z.array(z.object({ label: z.string(), value: z.string(), hint: z.string() })),
  schedule: portalScheduleItemSchema.array(),
  learners: portalLearnerSchema.array(),
  announcements: announcementSchema.array(),
  homework: homeworkSchema.array(),
});
export type PortalOverviewDto = z.infer<typeof portalOverviewSchema>;
