import { z } from 'zod';

/**
 * Schémas du module health.
 *
 * Gabarit de référence : chaque module déclare ses schémas Zod ici, et ceux
 * qui font partie du contrat public sont réexportés depuis
 * `packages/contracts` afin d'être partagés avec le web et le mobile.
 */

export const dependencyStatusSchema = z.object({
  name: z.string(),
  status: z.enum(['up', 'down']),
  latencyMs: z.number().int().nonnegative(),
  error: z.string().optional(),
});

export const livenessResponseSchema = z.object({
  status: z.literal('ok'),
  uptimeSeconds: z.number().nonnegative(),
  version: z.string(),
});

export const readinessResponseSchema = z.object({
  status: z.enum(['ok', 'degraded']),
  checkedAt: z.string().datetime(),
  dependencies: z.array(dependencyStatusSchema),
});

export type DependencyStatus = z.infer<typeof dependencyStatusSchema>;
export type LivenessResponse = z.infer<typeof livenessResponseSchema>;
export type ReadinessResponse = z.infer<typeof readinessResponseSchema>;
