/**
 * Erreurs applicatives CSB Noutcha KAMGUE.
 *
 * Conformément à docs/06-CONVENTIONS-DEV.md §2, tous les codes d'erreur métier
 * sont énumérés ici, de façon exhaustive. Un code inventé à la volée dans un
 * service est un bug : il ne pourra être ni traduit côté client, ni testé.
 *
 * Le catalogue s'enrichit à chaque phase — jamais ailleurs que dans ce fichier.
 */

export const ErrorCode = {
  // Génériques
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  NOT_FOUND: 'NOT_FOUND',
  CONFLICT: 'CONFLICT',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  RATE_LIMITED: 'RATE_LIMITED',
  SERVICE_UNAVAILABLE: 'SERVICE_UNAVAILABLE',

  // Authentification & autorisation (Phase 01)
  UNAUTHENTICATED: 'UNAUTHENTICATED',
  INVALID_CREDENTIALS: 'INVALID_CREDENTIALS',
  TOKEN_EXPIRED: 'TOKEN_EXPIRED',
  TOKEN_INVALID: 'TOKEN_INVALID',
  FORBIDDEN: 'FORBIDDEN',
  ACCOUNT_LOCKED: 'ACCOUNT_LOCKED',
  ACCOUNT_DISABLED: 'ACCOUNT_DISABLED',
  PHONE_NOT_VERIFIED: 'PHONE_NOT_VERIFIED',

  // OTP (Phase 01)
  OTP_INVALID: 'OTP_INVALID',
  OTP_EXPIRED: 'OTP_EXPIRED',
  OTP_TOO_MANY_ATTEMPTS: 'OTP_TOO_MANY_ATTEMPTS',
  OTP_RESEND_TOO_SOON: 'OTP_RESEND_TOO_SOON',

  // Idempotence
  IDEMPOTENCY_KEY_REUSED: 'IDEMPOTENCY_KEY_REUSED',
} as const;

export type ErrorCodeValue = (typeof ErrorCode)[keyof typeof ErrorCode];

export interface ErrorDetail {
  field?: string;
  code?: string;
  message: string;
}

export class AppError extends Error {
  readonly code: ErrorCodeValue;
  readonly statusCode: number;
  readonly details: ErrorDetail[] | undefined;
  /** Contexte de diagnostic — journalisé, jamais renvoyé au client. */
  readonly context: Record<string, unknown> | undefined;

  constructor(params: {
    code: ErrorCodeValue;
    message: string;
    statusCode: number;
    details?: ErrorDetail[];
    context?: Record<string, unknown>;
    cause?: unknown;
  }) {
    super(params.message, params.cause !== undefined ? { cause: params.cause } : undefined);
    this.name = 'AppError';
    this.code = params.code;
    this.statusCode = params.statusCode;
    this.details = params.details;
    this.context = params.context;
    Error.captureStackTrace?.(this, AppError);
  }
}

/* -------------------------------------------------------------------------- */
/* Fabriques — à préférer au constructeur pour garder les statuts cohérents    */
/* -------------------------------------------------------------------------- */

export const errors = {
  validation: (message: string, details?: ErrorDetail[]) =>
    new AppError({
      code: ErrorCode.VALIDATION_ERROR,
      message,
      statusCode: 400,
      ...(details !== undefined && { details }),
    }),

  unauthenticated: (message = 'Authentification requise.') =>
    new AppError({ code: ErrorCode.UNAUTHENTICATED, message, statusCode: 401 }),

  forbidden: (message = "Vous n'avez pas les droits nécessaires pour cette action.") =>
    new AppError({ code: ErrorCode.FORBIDDEN, message, statusCode: 403 }),

  /**
   * 404 est utilisé aussi bien pour l'inexistant que pour le hors-périmètre :
   * révéler qu'une ressource existe dans un autre établissement est déjà une
   * fuite d'information (docs/16 §5, test 4).
   */
  notFound: (message = 'Ressource introuvable.', context?: Record<string, unknown>) =>
    new AppError({
      code: ErrorCode.NOT_FOUND,
      message,
      statusCode: 404,
      ...(context !== undefined && { context }),
    }),

  conflict: (message: string, context?: Record<string, unknown>) =>
    new AppError({
      code: ErrorCode.CONFLICT,
      message,
      statusCode: 409,
      ...(context !== undefined && { context }),
    }),

  /** 422 : la requête est bien formée mais viole une règle métier. */
  businessRule: (code: ErrorCodeValue, message: string, context?: Record<string, unknown>) =>
    new AppError({
      code,
      message,
      statusCode: 422,
      ...(context !== undefined && { context }),
    }),

  internal: (message = 'Une erreur interne est survenue.', cause?: unknown) =>
    new AppError({
      code: ErrorCode.INTERNAL_ERROR,
      message,
      statusCode: 500,
      ...(cause !== undefined && { cause }),
    }),

  serviceUnavailable: (message: string, context?: Record<string, unknown>) =>
    new AppError({
      code: ErrorCode.SERVICE_UNAVAILABLE,
      message,
      statusCode: 503,
      ...(context !== undefined && { context }),
    }),
};

export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError;
}
