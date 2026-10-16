import { z } from 'zod';
import { idSchema } from './primitives.js';

export const attendanceMarkSchema = z.enum(['PRESENT', 'ABSENT', 'LATE', 'EXCUSED']);
export const attendanceSessionStatusSchema = z.enum(['DRAFT', 'VALIDATED']);
export const justificationStatusSchema = z.enum(['NONE', 'PENDING', 'ACCEPTED', 'REJECTED']);
const schoolDateSchema = z.string().date();

export const attendanceRecordSchema = z.object({
  id: idSchema,
  enrollmentId: idSchema,
  studentId: idSchema,
  studentNumber: z.string(),
  studentName: z.string(),
  mark: attendanceMarkSchema,
  minutesLate: z.number().int().nonnegative(),
  note: z.string().nullable(),
  justificationStatus: justificationStatusSchema,
  justificationNote: z.string().nullable(),
});

export const attendanceSessionSchema = z.object({
  id: idSchema,
  academicYearId: idSchema,
  timetableEntryId: idSchema,
  classId: idSchema,
  className: z.string(),
  subjectName: z.string(),
  teacherName: z.string().nullable(),
  date: schoolDateSchema,
  startTime: z.string(),
  endTime: z.string(),
  status: attendanceSessionStatusSchema,
  validatedAt: z.string().datetime().nullable(),
  records: attendanceRecordSchema.array(),
  summary: z.object({
    present: z.number().int(),
    absent: z.number().int(),
    late: z.number().int(),
    excused: z.number().int(),
  }),
});

export const attendanceQuerySchema = z.object({
  academic_year_id: idSchema,
  class_id: idSchema.optional(),
  date: schoolDateSchema,
});
export const openAttendanceSessionBodySchema = z
  .object({ timetableEntryId: idSchema, date: schoolDateSchema })
  .strict();
export const saveAttendanceBodySchema = z
  .object({
    records: z
      .array(
        z
          .object({
            enrollmentId: idSchema,
            mark: attendanceMarkSchema,
            minutesLate: z.number().int().min(0).max(600).default(0),
            note: z.string().trim().max(500).nullable().optional(),
          })
          .strict(),
      )
      .min(1),
  })
  .strict();
export const updateJustificationBodySchema = z
  .object({
    status: z.enum(['PENDING', 'ACCEPTED', 'REJECTED']),
    note: z.string().trim().min(2).max(1000),
  })
  .strict();
export const validateAttendanceResultSchema = z.object({
  session: attendanceSessionSchema,
  alertsQueued: z.number().int().nonnegative(),
});

export type AttendanceMark = z.infer<typeof attendanceMarkSchema>;
export type AttendanceRecordDto = z.infer<typeof attendanceRecordSchema>;
export type AttendanceSessionDto = z.infer<typeof attendanceSessionSchema>;
export type OpenAttendanceSessionBody = z.infer<typeof openAttendanceSessionBodySchema>;
export type SaveAttendanceBody = z.infer<typeof saveAttendanceBodySchema>;
export type UpdateJustificationBody = z.infer<typeof updateJustificationBodySchema>;
