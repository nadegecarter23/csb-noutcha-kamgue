import type { AppConfig } from './config.js';
import type { Logger } from './logger.js';
import { maskPhone } from './logger.js';

/**
 * Envoi de SMS.
 *
 * Enjeu identifié comme critique en Phase 01 : un OTP non délivré bloque
 * l'inscription d'un parent, et l'application perd sa raison d'être. D'où
 * l'interface, qui permet un fournisseur de repli et un suivi du taux de
 * livraison, plutôt qu'un appel direct à une API tierce.
 *
 * Le coût est également un enjeu : à ~20 FCFA le message et 1 500 familles,
 * une campagne de relance coûte 30 000 FCFA. `SmsResult.cost` alimentera le
 * suivi de la Phase 13.
 */

export interface SmsMessage {
  /** Destinataire au format E.164. */
  to: string;
  body: string;
  /** Catégorie, pour les statistiques et le plafonnement (Phase 13). */
  kind?: string;
}

export interface SmsResult {
  providerMessageId: string | undefined;
  /** Coût en FCFA entiers, si le fournisseur le communique. */
  cost: number | undefined;
}

export interface SmsProvider {
  readonly code: string;
  send(message: SmsMessage): Promise<SmsResult>;
}

/**
 * Fournisseur de développement : n'envoie rien, journalise.
 *
 * Le contenu du message est écrit dans les logs pour permettre de dérouler le
 * parcours OTP en local. Ce fournisseur est INTERDIT en production — la
 * fabrique le refuse explicitement.
 */
export class ConsoleSmsProvider implements SmsProvider {
  readonly code = 'CONSOLE';

  constructor(private readonly logger: Logger) {}

  async send(message: SmsMessage): Promise<SmsResult> {
    this.logger.info(
      { to: maskPhone(message.to), kind: message.kind, body: message.body },
      '[SMS SIMULÉ]',
    );
    return { providerMessageId: `console-${Date.now()}`, cost: 0 };
  }
}

/**
 * Fournisseur de repli sûr lorsqu'aucune passerelle SMS n'est encore branchée.
 *
 * Il permet au reste de l'API de démarrer en production, mais refuse chaque
 * envoi explicitement. Contrairement au fournisseur de développement, il ne
 * journalise jamais le corps du message : un OTP ne doit pas se retrouver dans
 * les logs Railway.
 */
export class DisabledSmsProvider implements SmsProvider {
  readonly code = 'DISABLED';

  constructor(private readonly logger: Logger) {
    this.logger.warn(
      'fournisseur SMS désactivé : les fonctionnalités nécessitant un SMS resteront indisponibles',
    );
  }

  async send(message: SmsMessage): Promise<SmsResult> {
    this.logger.warn(
      { to: maskPhone(message.to), kind: message.kind },
      'envoi SMS refusé : aucun fournisseur configuré',
    );
    throw new Error('Service SMS temporairement indisponible.');
  }
}

/**
 * Fournisseur composite : bascule sur le suivant en cas d'échec.
 *
 * Les passerelles SMS locales connaissent des interruptions. Un repli
 * automatique évite qu'une panne de fournisseur bloque toutes les inscriptions.
 */
export class FailoverSmsProvider implements SmsProvider {
  readonly code = 'FAILOVER';

  constructor(
    private readonly providers: readonly SmsProvider[],
    private readonly logger: Logger,
  ) {
    if (providers.length === 0) {
      throw new Error('FailoverSmsProvider requiert au moins un fournisseur.');
    }
  }

  async send(message: SmsMessage): Promise<SmsResult> {
    let lastError: unknown;

    for (const provider of this.providers) {
      try {
        return await provider.send(message);
      } catch (error) {
        lastError = error;
        this.logger.warn(
          { provider: provider.code, to: maskPhone(message.to), err: error },
          'envoi SMS en échec, bascule sur le fournisseur suivant',
        );
      }
    }

    throw lastError instanceof Error
      ? lastError
      : new Error('Tous les fournisseurs SMS ont échoué.');
  }
}

export function createSmsProvider(config: AppConfig, logger: Logger): SmsProvider {
  if (config.isProduction) {
    // Phase 13 : brancher ici le fournisseur réel, puis le repli.
    //   return new FailoverSmsProvider([new PrimarySms(config), new BackupSms(config)], logger);
    return new DisabledSmsProvider(logger);
  }

  return new ConsoleSmsProvider(logger);
}
