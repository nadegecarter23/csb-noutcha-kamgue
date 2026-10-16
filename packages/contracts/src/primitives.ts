import { z } from 'zod';

/**
 * Primitives partagées.
 *
 * Ces schémas sont le point de convergence des règles de forme entre l'API,
 * le web et le mobile : une règle changée ici se propage aux trois.
 */

/** Identifiant technique — UUID v7 (ADR-013). */
export const idSchema = z.string().uuid();

/**
 * Montant en francs CFA : entier, jamais décimal (ADR-012).
 *
 * Le contrat d'API transporte des entiers bruts. Le formatage
 * (« 75 000 FCFA ») est une affaire d'affichage, jamais de transport.
 */
export const amountSchema = z
  .number()
  .int('Le franc CFA n’a pas de sous-unité : le montant doit être un entier.')
  .max(1_000_000_000_000);

/** Montant strictement positif — pour un paiement, par exemple. */
export const positiveAmountSchema = amountSchema.positive(
  'Le montant doit être strictement positif.',
);

export const currencySchema = z.literal('XAF');

/** Téléphone au format E.164. La normalisation vit dans @cplan/domain. */
export const phoneSchema = z
  .string()
  .regex(/^\+[1-9]\d{7,14}$/, 'Numéro de téléphone invalide (format international attendu).');

export const emailSchema = z.string().email('Adresse e-mail invalide.').toLowerCase();

/**
 * Date métier sans heure : date de naissance, échéance, date de valeur.
 *
 * Volontairement distincte d'un timestamp (ADR-014) : mélanger les deux
 * garantit un décalage d'un jour selon le fuseau.
 */
export const dateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date attendue au format AAAA-MM-JJ.');

export const dateTimeSchema = z.string().datetime();

/** Mot de passe — 8 caractères minimum, sans exigence de caractère spécial. */
export const passwordSchema = z
  .string()
  .min(8, 'Le mot de passe doit contenir au moins 8 caractères.')
  .max(128);

/**
 * Cycle dans lequel l'utilisateur courant peut écrire. Calculé côté serveur
 * avec la même règle que la RLS, pour que les formulaires ne proposent jamais
 * un cycle que la base refuserait.
 */
export const unitOptionSchema = z.object({ id: idSchema, code: z.string(), name: z.string() });
export const writableUnitsSchema = z.object({
  units: unitOptionSchema.array(),
  /** Vrai seulement pour un périmètre global : autorise « tout le complexe ». */
  schoolWide: z.boolean(),
});

export type Id = z.infer<typeof idSchema>;
export type UnitOptionDto = z.infer<typeof unitOptionSchema>;
export type WritableUnitsDto = z.infer<typeof writableUnitsSchema>;
export type AmountDto = z.infer<typeof amountSchema>;
export type PhoneDto = z.infer<typeof phoneSchema>;
export type DateDto = z.infer<typeof dateSchema>;
