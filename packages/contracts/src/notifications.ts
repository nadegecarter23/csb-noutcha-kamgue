import { z } from 'zod';
import { idSchema } from './primitives.js';

export const notificationChannelSchema = z.enum(['IN_APP', 'PUSH', 'SMS', 'EMAIL']);
export const notificationPreferenceSchema = z.object({
  pushEnabled: z.boolean(),
  smsEnabled: z.boolean(),
  emailEnabled: z.boolean(),
  paymentEnabled: z.boolean(),
  reminderEnabled: z.boolean(),
  newsEnabled: z.boolean(),
});
export const updateNotificationPreferenceSchema = notificationPreferenceSchema.partial();
export const notificationTemplateSchema = z.object({
  id: idSchema,
  type: z.string(),
  channel: notificationChannelSchema,
  title: z.string().nullable(),
  body: z.string(),
  isActive: z.boolean(),
  updatedAt: z.string(),
});
export const updateNotificationTemplateSchema = z.object({
  type: z.string().min(1),
  channel: notificationChannelSchema,
  title: z.string().max(120).nullable().optional(),
  body: z.string().min(1).max(2000),
  isActive: z.boolean().optional(),
});
export const previewNotificationTemplateSchema = updateNotificationTemplateSchema.extend({
  variables: z.record(z.string()).default({}),
});
export const notificationStatsSchema = z.object({
  total: z.number().int(),
  delivered: z.number().int(),
  failed: z.number().int(),
  deadLetter: z.number().int(),
  smsCost: z.number().int(),
  byChannel: z.record(z.number().int()),
});
export const broadcastNotificationSchema = z.object({
  title: z.string().trim().min(1).max(120),
  body: z.string().trim().min(1).max(1000),
  channels: z.array(notificationChannelSchema).min(1).default(['IN_APP']),
  data: z.record(z.unknown()).default({}),
});
