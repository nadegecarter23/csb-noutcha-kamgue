import { z } from 'zod';
import { idSchema } from './primitives.js';

export const timetableEntryStatusSchema = z.enum(['DRAFT', 'PUBLISHED', 'CANCELLED']);
export const timeSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);

export const timetableRoomSchema = z.object({
  id: idSchema,
  code: z.string(),
  name: z.string(),
  capacity: z.number().int().positive().nullable(),
  status: z.enum(['ACTIVE', 'INACTIVE']),
});

export const createTimetableRoomBodySchema = z
  .object({
    code: z
      .string()
      .trim()
      .min(1)
      .max(20)
      .transform((value) => value.toUpperCase()),
    name: z.string().trim().min(2).max(100),
    capacity: z.number().int().positive().max(500).nullable().optional(),
  })
  .strict();

export const timetableEntrySchema = z.object({
  id: idSchema,
  academicYearId: idSchema,
  teachingAssignmentId: idSchema,
  classId: idSchema,
  className: z.string(),
  subjectId: idSchema,
  subjectName: z.string(),
  subjectColor: z.string(),
  teacherUserId: idSchema.nullable(),
  teacherName: z.string().nullable(),
  roomId: idSchema.nullable(),
  roomName: z.string().nullable(),
  dayOfWeek: z.number().int().min(1).max(6),
  startTime: timeSchema,
  endTime: timeSchema,
  status: timetableEntryStatusSchema,
});

export const timetableQuerySchema = z.object({
  academic_year_id: idSchema,
  class_id: idSchema.optional(),
  teacher_user_id: idSchema.optional(),
});

export const createTimetableEntryBodySchema = z
  .object({
    academicYearId: idSchema,
    teachingAssignmentId: idSchema,
    roomId: idSchema.nullable().optional(),
    dayOfWeek: z.number().int().min(1).max(6),
    startTime: timeSchema,
    endTime: timeSchema,
  })
  .strict()
  .refine((value) => value.endTime > value.startTime, {
    message: 'L’heure de fin doit être postérieure à l’heure de début.',
    path: ['endTime'],
  });

export const publishTimetableBodySchema = z.object({ academicYearId: idSchema }).strict();
export const publishTimetableResultSchema = z.object({ published: z.number().int().nonnegative() });

export type TimetableRoomDto = z.infer<typeof timetableRoomSchema>;
export type CreateTimetableRoomBody = z.infer<typeof createTimetableRoomBodySchema>;
export type TimetableEntryDto = z.infer<typeof timetableEntrySchema>;
export type CreateTimetableEntryBody = z.infer<typeof createTimetableEntryBodySchema>;
