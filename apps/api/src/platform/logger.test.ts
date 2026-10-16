import { describe, it, expect } from 'vitest';
import { pino } from 'pino';
import { REDACTED_PATHS, maskPhone } from './logger.js';

/**
 * Test de sécurité, pas de confort.
 *
 * Un mot de passe, un OTP ou un token qui atteint un agrégateur de logs est
 * une fuite. Ce test fait partie de la checklist de mise en production
 * (docs/phases/PHASE-16-audit-securite.md §10).
 */
describe('rédaction des logs', () => {
  function captureLog(payload: Record<string, unknown>): string {
    const chunks: string[] = [];
    const logger = pino(
      { redact: { paths: REDACTED_PATHS, censor: '[REDACTED]' } },
      { write: (chunk: string) => chunks.push(chunk) },
    );
    logger.info(payload, 'test');
    return chunks.join('');
  }

  it.each([
    ['password', 'MonMotDePasse123'],
    ['passwordHash', '$argon2id$v=19$m=19456'],
    ['otp', '482913'],
    ['otpCode', '482913'],
    ['token', 'eyJhbGciOiJIUzI1NiJ9.secret'],
    ['tokenHash', 'a3f9c2e1'],
    ['refreshToken', 'rt_abcdef123456'],
    ['accessToken', 'at_abcdef123456'],
    ['secret', 'super-secret-value'],
    ['authorization', 'Bearer eyJhbGciOiJIUzI1NiJ9'],
  ])('rédige le champ « %s »', (field, value) => {
    const output = captureLog({ [field]: value });
    expect(output).not.toContain(value);
    expect(output).toContain('[REDACTED]');
  });

  it("rédige l'en-tête Authorization d'une requête", () => {
    const output = captureLog({
      req: { headers: { authorization: 'Bearer token-tres-secret' } },
    });
    expect(output).not.toContain('token-tres-secret');
  });

  it("rédige le mot de passe présent dans le corps d'une requête", () => {
    const output = captureLog({
      req: { body: { phone: '+237699123456', password: 'MotDePasseEnClair' } },
    });
    expect(output).not.toContain('MotDePasseEnClair');
  });

  it('laisse passer les données non sensibles, sinon les logs ne servent à rien', () => {
    const output = captureLog({ studentNumber: 'CPLAN-00342', amount: 75000 });
    expect(output).toContain('CPLAN-00342');
    expect(output).toContain('75000');
  });
});

describe('maskPhone', () => {
  it('masque la partie centrale en conservant indicatif et 4 derniers chiffres', () => {
    expect(maskPhone('+237699123456')).toBe('+237•••••3456');
  });

  it('masque intégralement un numéro trop court pour être partiellement révélé', () => {
    expect(maskPhone('12345678')).toBe('••••••••');
  });

  it('gère les valeurs absentes', () => {
    expect(maskPhone(null)).toBeUndefined();
    expect(maskPhone(undefined)).toBeUndefined();
    expect(maskPhone('')).toBeUndefined();
  });
});
