import { z } from 'zod';

/**
 * Configuration de l'application, validée au démarrage.
 *
 * Règle (docs/02-ARCHITECTURE-TECHNIQUE.md §3.3) : l'API refuse de démarrer si
 * une variable manque ou est mal typée. Aucune valeur par défaut n'est fournie
 * pour un secret — un secret par défaut finit toujours par atteindre la
 * production.
 */

const booleanFromString = z
  .string()
  .transform((v) => v.toLowerCase() === 'true' || v === '1')
  .pipe(z.boolean());

const csvList = z
  .string()
  .transform((v) =>
    v
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
  )
  .pipe(z.array(z.string()));

const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().positive().default(3000),
    HOST: z.string().default('0.0.0.0'),
    // « silent » sert aux tests : on ne veut pas de bruit dans la sortie de CI.
    LOG_LEVEL: z
      .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
      .default('info'),

    DATABASE_URL: z.string().url(),
    DATABASE_MIGRATION_URL: z.string().url().optional(),

    REDIS_URL: z.string().url(),

    S3_ENDPOINT: z.string().url(),
    S3_REGION: z.string().min(1),
    S3_BUCKET: z.string().min(1),
    S3_ACCESS_KEY_ID: z.string().min(1),
    S3_SECRET_ACCESS_KEY: z.string().min(1),
    S3_FORCE_PATH_STYLE: booleanFromString.default('true'),

    JWT_SECRET: z.string().min(32, 'JWT_SECRET doit faire au moins 32 caractères'),
    JWT_ACCESS_TTL: z.string().default('15m'),
    JWT_REFRESH_TTL_DAYS: z.coerce.number().int().positive().default(30),
    JWT_REFRESH_TTL_DAYS_WEB: z.coerce.number().int().positive().default(1),

    CORS_ORIGINS: csvList,

    DEFAULT_TIMEZONE: z.string().default('Africa/Douala'),
    DEFAULT_COUNTRY_CODE: z.string().length(2).default('CM'),
    DEFAULT_CURRENCY: z.literal('XAF').default('XAF'),

    SMTP_HOST: z.string().min(1),
    SMTP_PORT: z.coerce.number().int().positive(),
    SMTP_SECURE: booleanFromString.default('false'),
    SMTP_FROM: z.string().min(1),
    PAYMENT_PROVIDER_MODE: z.enum(['fake', 'live']).default('fake'),
    PAYMENT_WEBHOOK_BASE_URL: z.string().url().optional(),
    FAKE_PAYMENT_WEBHOOK_SECRET: z.string().min(16).default('cplan-fake-webhook-secret'),
    MTN_MOMO_BASE_URL: z.string().url().optional(),
    MTN_MOMO_SUBSCRIPTION_KEY: z.string().min(1).optional(),
    MTN_MOMO_API_USER: z.string().min(1).optional(),
    MTN_MOMO_API_KEY: z.string().min(1).optional(),
    MTN_MOMO_TARGET_ENVIRONMENT: z.string().default('sandbox'),
    ORANGE_MONEY_BASE_URL: z.string().url().optional(),
    ORANGE_MONEY_TOKEN_URL: z.string().url().default('https://api.orange.com/oauth/v3/token'),
    ORANGE_MONEY_CLIENT_ID: z.string().min(1).optional(),
    ORANGE_MONEY_CLIENT_SECRET: z.string().min(1).optional(),
    ORANGE_MONEY_MERCHANT_KEY: z.string().min(1).optional(),
  })
  .superRefine((env, ctx) => {
    // Garde-fou : un secret de développement ne doit jamais atteindre la production.
    if (env.NODE_ENV === 'production' && env.JWT_SECRET.includes('dev-only')) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['JWT_SECRET'],
        message: 'Le secret de développement est interdit en production.',
      });
    }
    if (env.NODE_ENV === 'production' && env.PAYMENT_PROVIDER_MODE === 'fake') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['PAYMENT_PROVIDER_MODE'],
        message: 'Le fournisseur factice est interdit en production.',
      });
    }
  });

export type AppConfig = z.infer<typeof envSchema> & {
  readonly isProduction: boolean;
  readonly isDevelopment: boolean;
  readonly isTest: boolean;
};

function formatIssues(error: z.ZodError): string {
  return error.issues
    .map((issue) => `  · ${issue.path.join('.') || '(racine)'} — ${issue.message}`)
    .join('\n');
}

export function loadConfig(source: NodeJS.ProcessEnv = process.env): AppConfig {
  const parsed = envSchema.safeParse(source);

  if (!parsed.success) {
    // Volontairement console.error : le logger n'existe pas encore à ce stade.
    console.error(
      `\nConfiguration invalide — l'API ne peut pas démarrer.\n\n${formatIssues(parsed.error)}\n\n` +
        `Vérifiez apps/api/.env (modèle : apps/api/.env.example).\n`,
    );
    process.exit(1);
  }

  const env = parsed.data;
  const isProduction = env.NODE_ENV === 'production';
  return {
    ...env,
    CORS_ORIGINS: [...new Set(env.CORS_ORIGINS)],
    isProduction,
    isDevelopment: env.NODE_ENV === 'development',
    isTest: env.NODE_ENV === 'test',
  };
}
