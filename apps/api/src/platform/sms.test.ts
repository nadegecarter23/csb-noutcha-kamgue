import { describe, expect, it, vi } from 'vitest';
import type { AppConfig } from './config.js';
import type { Logger } from './logger.js';
import { createSmsProvider, DisabledSmsProvider } from './sms.js';

function loggerMock() {
  return {
    info: vi.fn(),
    warn: vi.fn(),
  } as unknown as Logger;
}

describe('fournisseur SMS de production sans passerelle', () => {
  it("laisse l'API démarrer avec un fournisseur explicitement désactivé", () => {
    const provider = createSmsProvider({ isProduction: true } as AppConfig, loggerMock());
    expect(provider).toBeInstanceOf(DisabledSmsProvider);
    expect(provider.code).toBe('DISABLED');
  });

  it("refuse l'envoi sans exposer le contenu sensible dans les logs", async () => {
    const logger = loggerMock();
    const provider = new DisabledSmsProvider(logger);
    const secretBody = 'Votre code OTP est 482913';

    await expect(
      provider.send({ to: '+237699123456', body: secretBody, kind: 'OTP_LOGIN' }),
    ).rejects.toThrow('Service SMS temporairement indisponible.');

    expect(logger.warn).not.toHaveBeenCalledWith(
      expect.objectContaining({ body: expect.anything() }),
      expect.anything(),
    );
    expect(JSON.stringify((logger.warn as ReturnType<typeof vi.fn>).mock.calls)).not.toContain(
      secretBody,
    );
  });
});
