import { z } from 'zod';
import { idSchema } from './primitives.js';
export const audienceSchema = z.enum(['ALL', 'STAFF', 'FAMILIES', 'STUDENTS']);
export const announcementSchema = z.object({
  id: idSchema,
  title: z.string(),
  body: z.string(),
  audience: audienceSchema,
  publishedAt: z.string().datetime(),
  expiresAt: z.string().datetime().nullable(),
});
export const schoolEventSchema = z.object({
  id: idSchema,
  title: z.string(),
  description: z.string().nullable(),
  location: z.string().nullable(),
  audience: audienceSchema,
  startsAt: z.string().datetime(),
  endsAt: z.string().datetime(),
});
export const homeworkSchema = z.object({
  id: idSchema,
  academicYearId: idSchema,
  classId: idSchema,
  className: z.string(),
  subjectId: idSchema,
  subjectName: z.string(),
  title: z.string(),
  instructions: z.string(),
  dueAt: z.string().datetime(),
  status: z.enum(['DRAFT', 'PUBLISHED']),
});
export const schoolMessageSchema = z.object({
  id: idSchema,
  senderUserId: idSchema,
  senderName: z.string(),
  recipientUserId: idSchema,
  recipientName: z.string(),
  subject: z.string(),
  body: z.string(),
  sentAt: z.string().datetime(),
  readAt: z.string().datetime().nullable(),
});
export const communicationsOverviewSchema = z.object({
  announcements: announcementSchema.array(),
  events: schoolEventSchema.array(),
  homework: homeworkSchema.array(),
  messages: schoolMessageSchema.array(),
});
export const createAnnouncementBodySchema = z
  .object({
    title: z.string().trim().min(3).max(160),
    body: z.string().trim().min(3).max(5000),
    audience: audienceSchema,
    expiresAt: z.string().datetime().nullable().optional(),
  })
  .strict();
export const createSchoolEventBodySchema = z
  .object({
    title: z.string().trim().min(3).max(160),
    description: z.string().trim().max(2000).nullable().optional(),
    location: z.string().trim().max(160).nullable().optional(),
    audience: audienceSchema,
    startsAt: z.string().datetime(),
    endsAt: z.string().datetime(),
  })
  .strict()
  .refine((v) => v.endsAt > v.startsAt, {
    message: 'La fin doit suivre le début.',
    path: ['endsAt'],
  });
export const createHomeworkBodySchema = z
  .object({
    academicYearId: idSchema,
    classId: idSchema,
    subjectId: idSchema,
    title: z.string().trim().min(3).max(160),
    instructions: z.string().trim().min(3).max(5000),
    dueAt: z.string().datetime(),
    status: z.enum(['DRAFT', 'PUBLISHED']).default('DRAFT'),
  })
  .strict();
export const createSchoolMessageBodySchema = z
  .object({
    recipientUserId: idSchema,
    subject: z.string().trim().min(2).max(160),
    body: z.string().trim().min(2).max(5000),
  })
  .strict();
export type AnnouncementDto = z.infer<typeof announcementSchema>;
export type SchoolEventDto = z.infer<typeof schoolEventSchema>;
export type HomeworkDto = z.infer<typeof homeworkSchema>;
export type SchoolMessageDto = z.infer<typeof schoolMessageSchema>;
export type CommunicationsOverviewDto = z.infer<typeof communicationsOverviewSchema>;
export type CreateAnnouncementBody = z.infer<typeof createAnnouncementBodySchema>;
export type CreateSchoolEventBody = z.infer<typeof createSchoolEventBodySchema>;
export type CreateHomeworkBody = z.infer<typeof createHomeworkBodySchema>;
export type CreateSchoolMessageBody = z.infer<typeof createSchoolMessageBodySchema>;
