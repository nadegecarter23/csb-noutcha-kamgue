import { z } from 'zod';
import { emailSchema, idSchema, passwordSchema, phoneSchema } from './primitives.js';
import { accessScopeSchema } from './users.js';

/**
 * Contrats d'authentification (Phase 01).
 *
 * Deux parcours distincts, un seul jeu de jetons :
 *   · personnel   → identifiant (e-mail ou téléphone) + mot de passe
 *   · parent      → téléphone + OTP à l'inscription, puis mot de passe
 */

/* -------------------------------------------------------------------------- */
/* Inscription & vérification                                                  */
/* -------------------------------------------------------------------------- */

export const otpPurposeSchema = z.enum(['SIGNUP', 'LOGIN', 'PHONE_CHANGE', 'PASSWORD_RESET']);
export type OtpPurpose = z.infer<typeof otpPurposeSchema>;

export const registerBodySchema = z
  .object({
    firstName: z.string().trim().min(1, 'Le prénom est obligatoire.').max(100),
    lastName: z.string().trim().min(1, 'Le nom est obligatoire.').max(100),
    /**
     * Accepté dans tous les formats camerounais courants ; la normalisation en
     * E.164 est faite côté serveur par @cplan/domain. Ne pas contraindre ici :
     * refuser « 699 12 34 56 » ferait échouer une saisie parfaitement valide.
     */
    phone: z.string().trim().min(6, 'Numéro de téléphone invalide.').max(30),
    email: emailSchema.optional(),
    password: passwordSchema,
    acceptTerms: z.literal(true, {
      errorMap: () => ({ message: 'Vous devez accepter les conditions d’utilisation.' }),
    }),
  })
  .strict();

export const sendOtpBodySchema = z
  .object({
    phone: z.string().trim().min(6).max(30),
    purpose: otpPurposeSchema,
  })
  .strict();

export const verifyOtpBodySchema = z
  .object({
    phone: z.string().trim().min(6).max(30),
    purpose: otpPurposeSchema,
    code: z
      .string()
      .trim()
      .regex(/^\d{6}$/, 'Le code doit comporter 6 chiffres.'),
  })
  .strict();

/* -------------------------------------------------------------------------- */
/* Connexion                                                                   */
/* -------------------------------------------------------------------------- */

export const loginBodySchema = z
  .object({
    /** E-mail ou numéro de téléphone. */
    identifier: z.string().trim().min(3).max(120),
    password: z.string().min(1, 'Le mot de passe est obligatoire.').max(128),
    deviceLabel: z.string().trim().max(120).optional(),
  })
  .strict();

export const refreshBodySchema = z.object({ refreshToken: z.string().min(20) }).strict();

export const logoutBodySchema = z.object({ refreshToken: z.string().min(20).optional() }).strict();

/* -------------------------------------------------------------------------- */
/* Mot de passe & téléphone                                                    */
/* -------------------------------------------------------------------------- */

export const forgotPasswordBodySchema = z
  .object({ phone: z.string().trim().min(6).max(30) })
  .strict();

export const resetPasswordBodySchema = z
  .object({
    phone: z.string().trim().min(6).max(30),
    code: z
      .string()
      .trim()
      .regex(/^\d{6}$/),
    newPassword: passwordSchema,
  })
  .strict();

export const changePasswordBodySchema = z
  .object({
    currentPassword: z.string().min(1).max(128),
    newPassword: passwordSchema,
  })
  .strict();

export const requestPhoneChangeBodySchema = z
  .object({ newPhone: z.string().trim().min(6).max(30) })
  .strict();

export const confirmPhoneChangeBodySchema = z
  .object({
    newPhone: z.string().trim().min(6).max(30),
    currentPhoneCode: z
      .string()
      .trim()
      .regex(/^\d{6}$/),
    newPhoneCode: z
      .string()
      .trim()
      .regex(/^\d{6}$/),
  })
  .strict();

/* -------------------------------------------------------------------------- */
/* Réponses                                                                    */
/* -------------------------------------------------------------------------- */

export const schoolMembershipSchema = z.object({
  schoolId: idSchema,
  schoolName: z.string(),
  roles: z.array(z.string()),
});

export const currentUserSchema = z.object({
  id: idSchema,
  firstName: z.string(),
  lastName: z.string(),
  phone: phoneSchema,
  phoneVerified: z.boolean(),
  email: z.string().nullable(),
  status: z.enum(['PENDING_VERIFICATION', 'ACTIVE', 'SUSPENDED', 'DISABLED']),
  mustChangePassword: z.boolean(),
  /** Établissement du contexte courant, s'il y en a un. */
  currentSchoolId: idSchema.nullable(),
  roles: z.array(z.string()),
  permissions: z.array(z.string()),
  accessScopes: z.array(accessScopeSchema),
  schools: z.array(schoolMembershipSchema),
});

export const authTokensSchema = z.object({
  accessToken: z.string(),
  refreshToken: z.string(),
  /** Durée de vie du jeton d'accès, en secondes. */
  expiresIn: z.number().int().positive(),
  tokenType: z.literal('Bearer'),
});

export const authSessionSchema = z.object({
  tokens: authTokensSchema,
  user: currentUserSchema,
});

/**
 * Réponse d'envoi d'OTP.
 *
 * Volontairement identique que le numéro existe ou non : toute différence
 * permettrait d'énumérer les comptes (docs/phases/PHASE-01 §4.3).
 */
export const otpSentSchema = z.object({
  sent: z.literal(true),
  /** Secondes avant de pouvoir demander un nouvel envoi. */
  retryAfterSeconds: z.number().int().nonnegative(),
  expiresInSeconds: z.number().int().positive(),
  /** Uniquement hors production, pour dérouler le parcours sans SMS réel. */
  devCode: z.string().optional(),
});

export const sessionSummarySchema = z.object({
  id: idSchema,
  deviceLabel: z.string().nullable(),
  ipAddress: z.string().nullable(),
  lastUsedAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
  expiresAt: z.string().datetime(),
  /** Vrai pour la session qui a émis la requête courante. */
  current: z.boolean(),
});

export const switchSchoolResponseSchema = z.object({
  accessToken: z.string(),
  expiresIn: z.number().int().positive(),
  tokenType: z.literal('Bearer'),
  user: currentUserSchema,
});

export type RegisterBody = z.infer<typeof registerBodySchema>;
export type LoginBody = z.infer<typeof loginBodySchema>;
export type VerifyOtpBody = z.infer<typeof verifyOtpBodySchema>;
export type AuthTokens = z.infer<typeof authTokensSchema>;
export type AuthSession = z.infer<typeof authSessionSchema>;
export type CurrentUser = z.infer<typeof currentUserSchema>;
export type SessionSummary = z.infer<typeof sessionSummarySchema>;
