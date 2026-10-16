import { pino, type LoggerOptions } from 'pino';
import type { AppConfig } from './config.js';

/**
 * Champs systématiquement rédigés dans les logs.
 *
 * Cette liste est un dispositif de sécurité, pas une commodité
 * (docs/02-ARCHITECTURE-TECHNIQUE.md §8). Un OTP ou un token qui atterrit dans
 * un log centralisé est une fuite. Un test vérifie que ces champs
 * n'apparaissent jamais en clair.
 *
 * Toute nouvelle donnée sensible DOIT être ajoutée ici en même temps que le
 * champ qui la porte.
 */
export const REDACTED_PATHS = [
  'req.headers.authorization',
  'req.headers.cookie',
  'req.headers["x-api-key"]',
  'req.body.password',
  'req.body.passwordConfirmation',
  'req.body.currentPassword',
  'req.body.newPassword',
  'req.body.otp',
  'req.body.code',
  'req.body.token',
  'res.headers["set-cookie"]',
  'password',
  'passwordHash',
  'password_hash',
  'otp',
  'otpCode',
  'code_hash',
  'codeHash',
  'token',
  'tokenHash',
  'token_hash',
  'refreshToken',
  'refresh_token',
  'refreshTokenHash',
  'accessToken',
  'secret',
  'apiKey',
  'authorization',
];

/**
 * Masque un numéro de téléphone : +237699123456 → +237•••••3456
 *
 * Les numéros ne sont pas rédigés entièrement car ils servent au diagnostic
 * (« l'OTP de ce parent n'est pas parti »), mais ils ne doivent pas être
 * lisibles en clair dans un agrégateur de logs.
 */
export function maskPhone(phone: string | null | undefined): string | undefined {
  if (!phone) return undefined;
  if (phone.length <= 8) return '•'.repeat(phone.length);
  return `${phone.slice(0, 4)}${'•'.repeat(phone.length - 8)}${phone.slice(-4)}`;
}

export function createLogger(config: AppConfig) {
  const options: LoggerOptions = {
    level: config.LOG_LEVEL,
    redact: { paths: REDACTED_PATHS, censor: '[REDACTED]' },
    base: { service: 'cplan-api', env: config.NODE_ENV },
    formatters: {
      level: (label) => ({ level: label }),
    },
    timestamp: pino.stdTimeFunctions.isoTime,
  };

  // En développement uniquement : sortie lisible par un humain.
  if (config.isDevelopment) {
    return pino({
      ...options,
      transport: {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'HH:MM:ss',
          ignore: 'pid,hostname,service,env',
          singleLine: false,
        },
      },
    });
  }

  return pino(options);
}

export type Logger = ReturnType<typeof createLogger>;
