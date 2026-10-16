import { z } from 'zod';

/**
 * Contrat d'erreur partagé entre l'API, le web et le mobile.
 *
 * Les trois applications parlent le même vocabulaire d'erreur : le client peut
 * réagir sur `code` (stable, testable) plutôt que sur `message` (traduisible,
 * susceptible d'évoluer).
 *
 * Le catalogue exhaustif vit côté API dans `platform/errors.ts` ; ce schéma en
 * décrit la FORME. Référence : docs/06-CONVENTIONS-DEV.md §2.
 */

export const errorDetailSchema = z.object({
  field: z.string().optional(),
  code: z.string().optional(),
  message: z.string(),
});

export const errorResponseSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.array(errorDetailSchema).optional(),
    request_id: z.string(),
  }),
});

export type ErrorDetail = z.infer<typeof errorDetailSchema>;
export type ErrorResponse = z.infer<typeof errorResponseSchema>;

/** Vrai si la charge utile est une réponse d'erreur CSB Noutcha KAMGUE. */
export function isErrorResponse(value: unknown): value is ErrorResponse {
  return errorResponseSchema.safeParse(value).success;
}
