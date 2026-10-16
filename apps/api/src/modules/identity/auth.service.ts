import { randomUUID } from 'node:crypto';
import type { AuthSession, AuthTokens, CurrentUser, OtpPurpose } from '@cplan/contracts';
import { normalizePhone } from '@cplan/domain';
import type { AppConfig } from '../../platform/config.js';
import type { Logger } from '../../platform/logger.js';
import { maskPhone } from '../../platform/logger.js';
import type { JwtService } from '../../platform/jwt.js';
import type { SmsProvider } from '../../platform/sms.js';
import type { AuditService } from '../../platform/audit.js';
import { AuditAction } from '../../platform/audit.js';
import { AppError, ErrorCode, errors } from '../../platform/errors.js';
import {
  fakePasswordVerification,
  generateOpaqueToken,
  generateOtpCode,
  hashOtpCode,
  hashPassword,
  hashToken,
  verifyOtpCode,
  verifyPassword,
} from '../../platform/crypto.js';
import type { IdentityRepository, UserWithAccess } from './identity.repository.js';
import { defaultSchoolId, resolveAccess, toCurrentUser } from './identity.mapper.js';

/* -------------------------------------------------------------------------- */
/* Politique de sécurité — un seul endroit, pour ne jamais diverger            */
/* -------------------------------------------------------------------------- */

export const AUTH_POLICY = {
  otp: {
    ttlSeconds: 5 * 60,
    maxAttempts: 5,
    resendCooldownSeconds: 60,
    maxPerHour: 3,
  },
  login: {
    /** Verrouillage temporaire au-delà de ce nombre d'échecs consécutifs. */
    maxFailedAttempts: 5,
    lockDurationMinutes: 15,
  },
} as const;

export interface AuthContext {
  ipAddress?: string | undefined;
  userAgent?: string | undefined;
  deviceLabel?: string | undefined;
}

export interface AuthServiceDeps {
  repository: IdentityRepository;
  jwt: JwtService;
  sms: SmsProvider;
  audit: AuditService;
  config: AppConfig;
  logger: Logger;
}

export function createAuthService(deps: AuthServiceDeps) {
  const { repository, jwt, sms, audit, config, logger } = deps;

  /* ------------------------------------------------------------------------ */
  /* Utilitaires internes                                                      */
  /* ------------------------------------------------------------------------ */

  /**
   * Normalise un numéro ou échoue proprement.
   *
   * Point critique : c'est ici que convergent tous les formats de saisie. Un
   * défaut à cet endroit casse la détection automatique des enfants (§8).
   */
  function normalize(rawPhone: string): string {
    const normalized = normalizePhone(rawPhone, config.DEFAULT_COUNTRY_CODE as 'CM');
    if (!normalized) {
      throw errors.validation('Numéro de téléphone invalide.', [
        { field: 'phone', message: 'Vérifiez le numéro saisi.' },
      ]);
    }
    return normalized.e164;
  }

  function accessTokenTtlSeconds(): number {
    const match = /^(\d+)([smhd])$/.exec(config.JWT_ACCESS_TTL);
    if (!match) return 900;
    const value = Number(match[1]);
    const unit = match[2];
    const multipliers: Record<string, number> = { s: 1, m: 60, h: 3600, d: 86400 };
    return value * (multipliers[unit ?? 's'] ?? 1);
  }

  function refreshTtlDays(user: UserWithAccess): number {
    // Le personnel travaille sur des postes partagés : session courte.
    // Un parent sur son téléphone personnel : session longue, sinon il doit
    // ressaisir son mot de passe à chaque consultation.
    const isStaff = user.userRoles.some((r) => r.schoolId !== null);
    return isStaff ? config.JWT_REFRESH_TTL_DAYS_WEB : config.JWT_REFRESH_TTL_DAYS;
  }

  /** Émet un couple de jetons et ouvre (ou prolonge) une famille de sessions. */
  async function issueTokens(
    user: UserWithAccess,
    schoolId: string | null,
    context: AuthContext,
    /** Réutilisé lors d'une rotation, afin de conserver la lignée de sessions. */
    familyId: string = randomUUID(),
  ): Promise<AuthTokens> {
    const refreshToken = generateOpaqueToken();
    const ttlDays = refreshTtlDays(user);
    const expiresAt = new Date(Date.now() + ttlDays * 86_400_000);

    const session = await repository.createSession({
      userId: user.id,
      refreshTokenHash: hashToken(refreshToken),
      familyId,
      deviceLabel: context.deviceLabel ?? null,
      ipAddress: context.ipAddress ?? null,
      userAgent: context.userAgent ?? null,
      expiresAt,
      lastUsedAt: new Date(),
    });

    const access = resolveAccess(user, schoolId);
    const accessToken = await jwt.signAccessToken({
      sub: user.id,
      ...(schoolId && { schoolId }),
      roles: access.roles,
      permissions: access.permissions,
      sid: session.id,
    });

    return {
      accessToken,
      refreshToken,
      expiresIn: accessTokenTtlSeconds(),
      tokenType: 'Bearer',
    };
  }

  function assertUsable(user: UserWithAccess): void {
    if (user.status === 'DISABLED' || user.status === 'SUSPENDED') {
      throw new AppError({
        code: ErrorCode.ACCOUNT_DISABLED,
        message: "Ce compte est désactivé. Contactez l'établissement.",
        statusCode: 403,
      });
    }
    if (user.lockedUntil && user.lockedUntil > new Date()) {
      const minutes = Math.ceil((user.lockedUntil.getTime() - Date.now()) / 60_000);
      throw new AppError({
        code: ErrorCode.ACCOUNT_LOCKED,
        message: `Trop de tentatives. Réessayez dans ${minutes} minute${minutes > 1 ? 's' : ''}.`,
        statusCode: 403,
      });
    }
  }

  async function buildSession(user: UserWithAccess, context: AuthContext): Promise<AuthSession> {
    const schoolId = defaultSchoolId(user);
    const tokens = await issueTokens(user, schoolId, context);
    return { tokens, user: toCurrentUser(user, schoolId) };
  }

  /* ------------------------------------------------------------------------ */
  /* OTP                                                                       */
  /* ------------------------------------------------------------------------ */

  async function sendOtp(
    rawPhone: string,
    purpose: OtpPurpose,
    context: AuthContext,
  ): Promise<{ retryAfterSeconds: number; expiresInSeconds: number; devCode?: string }> {
    const phone = normalize(rawPhone);
    const now = Date.now();

    // Fréquence d'envoi : le SMS coûte de l'argent et un envoi en boucle est
    // une attaque par épuisement de budget autant qu'un harcèlement.
    const recentCount = await repository.countRecentOtps(phone, new Date(now - 3_600_000));
    if (recentCount >= AUTH_POLICY.otp.maxPerHour) {
      throw new AppError({
        code: ErrorCode.OTP_RESEND_TOO_SOON,
        message: 'Trop de demandes de code. Réessayez dans une heure.',
        statusCode: 429,
      });
    }

    const latest = await repository.findLatestOtp(phone, purpose);
    if (latest) {
      const elapsed = (now - latest.createdAt.getTime()) / 1000;
      if (elapsed < AUTH_POLICY.otp.resendCooldownSeconds) {
        throw new AppError({
          code: ErrorCode.OTP_RESEND_TOO_SOON,
          message: 'Veuillez patienter avant de demander un nouveau code.',
          statusCode: 429,
          context: {
            retryAfterSeconds: Math.ceil(AUTH_POLICY.otp.resendCooldownSeconds - elapsed),
          },
        });
      }
      // Un seul code actif à la fois par usage.
      await repository.invalidatePendingOtps(phone, purpose);
    }

    const code = generateOtpCode();
    await repository.createOtp({
      phone,
      purpose,
      codeHash: hashOtpCode(code, phone, purpose),
      expiresAt: new Date(now + AUTH_POLICY.otp.ttlSeconds * 1000),
      ipAddress: context.ipAddress ?? null,
    });

    await sms.send({
      to: phone,
      kind: `OTP_${purpose}`,
      // Sans accent et court : au-delà de 160 caractères GSM-7, l'opérateur
      // facture plusieurs messages (docs/phases/PHASE-13 §5).
      body: `CSB Noutcha KAMGUE : votre code de verification est ${code}. Valable ${
        AUTH_POLICY.otp.ttlSeconds / 60
      } minutes. Ne le communiquez a personne.`,
    });

    logger.info({ phone: maskPhone(phone), purpose }, 'OTP émis');

    return {
      retryAfterSeconds: AUTH_POLICY.otp.resendCooldownSeconds,
      expiresInSeconds: AUTH_POLICY.otp.ttlSeconds,
      // Jamais en production : un test d'intégration vérifie cette absence.
      ...(!config.isProduction && { devCode: code }),
    };
  }

  /** Vérifie un code et le consomme. Lève si invalide, expiré ou épuisé. */
  async function consumeOtp(rawPhone: string, purpose: OtpPurpose, code: string): Promise<string> {
    const phone = normalize(rawPhone);
    const otp = await repository.findLatestOtp(phone, purpose);

    if (!otp) {
      throw new AppError({
        code: ErrorCode.OTP_INVALID,
        message: 'Code invalide ou expiré. Demandez un nouveau code.',
        statusCode: 400,
      });
    }

    if (otp.expiresAt < new Date()) {
      throw new AppError({
        code: ErrorCode.OTP_EXPIRED,
        message: 'Ce code a expiré. Demandez un nouveau code.',
        statusCode: 400,
      });
    }

    if (otp.attempts >= AUTH_POLICY.otp.maxAttempts) {
      await repository.consumeOtp(otp.id);
      throw new AppError({
        code: ErrorCode.OTP_TOO_MANY_ATTEMPTS,
        message: 'Trop de tentatives. Demandez un nouveau code.',
        statusCode: 429,
      });
    }

    if (!verifyOtpCode(otp.codeHash, code, phone, purpose)) {
      const attempts = await repository.incrementOtpAttempts(otp.id);
      const remaining = AUTH_POLICY.otp.maxAttempts - attempts;
      throw new AppError({
        code: ErrorCode.OTP_INVALID,
        message:
          remaining > 0
            ? `Code incorrect. Il vous reste ${remaining} tentative${remaining > 1 ? 's' : ''}.`
            : 'Code incorrect. Demandez un nouveau code.',
        statusCode: 400,
      });
    }

    await repository.consumeOtp(otp.id);
    return phone;
  }

  /* ------------------------------------------------------------------------ */
  /* Inscription & connexion                                                   */
  /* ------------------------------------------------------------------------ */

  async function register(input: {
    firstName: string;
    lastName: string;
    phone: string;
    email?: string | undefined;
    password: string;
  }): Promise<{ phone: string }> {
    const phone = normalize(input.phone);

    const existing = await repository.findUserByPhone(phone);
    if (existing) {
      // On ne révèle pas l'existence du compte par un code d'erreur distinct
      // sur une route publique, mais on oriente l'utilisateur.
      throw errors.conflict(
        'Un compte existe déjà avec ce numéro. Connectez-vous ou réinitialisez votre mot de passe.',
      );
    }

    if (input.email) {
      const byEmail = await repository.findUserByEmail(input.email);
      if (byEmail) {
        throw errors.conflict('Cette adresse e-mail est déjà utilisée.');
      }
    }

    const user = await repository.createUser({
      firstName: input.firstName,
      lastName: input.lastName,
      phone,
      ...(input.email && { email: input.email }),
      passwordHash: await hashPassword(input.password),
      status: 'PENDING_VERIFICATION',
    });

    await audit.log({
      action: AuditAction.USER_CREATED,
      entityType: 'user',
      entityId: user.id,
      userId: user.id,
      actorType: 'SYSTEM',
      metadata: { source: 'self_registration', phone: maskPhone(phone) },
    });

    return { phone };
  }

  /**
   * Vérifie le numéro après inscription, active le compte et ouvre une session.
   *
   * La détection automatique rattache uniquement la personne Guardian au compte.
   * Elle n'accepte jamais les associations : le parent décide ensuite.
   */
  async function verifyPhone(
    rawPhone: string,
    code: string,
    purpose: OtpPurpose,
    context: AuthContext,
  ): Promise<AuthSession> {
    const phone = await consumeOtp(rawPhone, purpose, code);

    const user = await repository.findUserByPhone(phone);
    if (!user) {
      throw errors.notFound('Aucun compte associé à ce numéro.');
    }
    assertUsable(user);

    const updated = await repository.updateUser(user.id, {
      phoneVerifiedAt: new Date(),
      ...(user.status === 'PENDING_VERIFICATION' && { status: 'ACTIVE' }),
    });

    await audit.log({
      action: AuditAction.PHONE_VERIFIED,
      entityType: 'user',
      entityId: user.id,
      userId: user.id,
      metadata: { phone: maskPhone(phone) },
    });

    const detection = await repository.linkGuardiansByPhone(phone, user.id);
    await audit.log({
      action: AuditAction.GUARDIAN_AUTO_DETECTED,
      entityType: 'user',
      entityId: user.id,
      userId: user.id,
      metadata: detection,
    });

    return buildSession(updated, context);
  }

  async function login(
    identifier: string,
    password: string,
    context: AuthContext,
  ): Promise<AuthSession> {
    // L'identifiant peut être un e-mail ou un téléphone.
    const asPhone = normalizePhone(identifier, config.DEFAULT_COUNTRY_CODE as 'CM');
    const user = asPhone
      ? await repository.findUserByPhone(asPhone.e164)
      : await repository.findUserByEmail(identifier.toLowerCase());

    if (!user || !user.passwordHash) {
      // Temps de réponse constant : sans cela, la différence de latence entre
      // « compte inconnu » et « mot de passe faux » permet d'énumérer les
      // comptes existants.
      await fakePasswordVerification();
      throw new AppError({
        code: ErrorCode.INVALID_CREDENTIALS,
        message: 'Identifiant ou mot de passe incorrect.',
        statusCode: 401,
      });
    }

    assertUsable(user);

    if (!(await verifyPassword(user.passwordHash, password))) {
      const attempts = await repository.registerFailedLogin(user.id, null);

      if (attempts >= AUTH_POLICY.login.maxFailedAttempts) {
        const lockUntil = new Date(Date.now() + AUTH_POLICY.login.lockDurationMinutes * 60_000);
        await repository.registerFailedLogin(user.id, lockUntil);
        await audit.log({
          action: AuditAction.ACCOUNT_LOCKED,
          entityType: 'user',
          entityId: user.id,
          userId: user.id,
          metadata: { attempts, lockedUntil: lockUntil.toISOString() },
        });
      }

      await audit.log({
        action: AuditAction.LOGIN_FAILED,
        entityType: 'user',
        entityId: user.id,
        userId: user.id,
        metadata: { attempts },
      });

      throw new AppError({
        code: ErrorCode.INVALID_CREDENTIALS,
        message: 'Identifiant ou mot de passe incorrect.',
        statusCode: 401,
      });
    }

    // Un parent doit avoir vérifié son numéro ; le personnel est créé vérifié
    // par l'administration.
    if (!user.phoneVerifiedAt) {
      throw new AppError({
        code: ErrorCode.PHONE_NOT_VERIFIED,
        message: 'Votre numéro n’a pas encore été vérifié.',
        statusCode: 403,
      });
    }

    await repository.clearFailedLogins(user.id);
    await audit.log({
      action: AuditAction.LOGIN_SUCCEEDED,
      entityType: 'user',
      entityId: user.id,
      userId: user.id,
    });

    return buildSession(user, context);
  }

  /* ------------------------------------------------------------------------ */
  /* Rotation du refresh token                                                 */
  /* ------------------------------------------------------------------------ */

  /**
   * Échange un refresh token contre un nouveau couple de jetons.
   *
   * Détection de réutilisation : présenter un jeton déjà révoqué signifie qu'il
   * a été volé et rejoué. On révoque alors TOUTE la famille — l'attaquant et la
   * victime sont déconnectés, la victime se reconnecte, l'attaquant ne peut pas.
   */
  async function refresh(refreshToken: string, context: AuthContext): Promise<AuthTokens> {
    const session = await repository.findSessionByTokenHash(hashToken(refreshToken));

    if (!session) {
      throw new AppError({
        code: ErrorCode.TOKEN_INVALID,
        message: 'Session invalide. Veuillez vous reconnecter.',
        statusCode: 401,
      });
    }

    if (session.revokedAt) {
      const revoked = await repository.revokeSessionFamily(session.familyId);
      logger.warn(
        { userId: session.userId, familyId: session.familyId, revoked },
        'réutilisation de refresh token détectée — famille de sessions révoquée',
      );
      await audit.log({
        action: AuditAction.TOKEN_REUSE_DETECTED,
        entityType: 'session',
        entityId: session.id,
        userId: session.userId,
        metadata: { familyId: session.familyId, revokedSessions: revoked },
      });
      throw new AppError({
        code: ErrorCode.TOKEN_INVALID,
        message: 'Session invalide. Veuillez vous reconnecter.',
        statusCode: 401,
      });
    }

    if (session.expiresAt < new Date()) {
      throw new AppError({
        code: ErrorCode.TOKEN_EXPIRED,
        message: 'Session expirée. Veuillez vous reconnecter.',
        statusCode: 401,
      });
    }

    assertUsable(session.user);

    // Rotation : l'ancien jeton est révoqué, un nouveau est émis dans la même
    // famille. Rejouer l'ancien déclenchera la détection ci-dessus.
    await repository.revokeSession(session.id);
    const schoolId = defaultSchoolId(session.user);
    return issueTokens(session.user, schoolId, context, session.familyId);
  }

  async function logout(refreshToken: string | undefined, sessionId?: string): Promise<void> {
    if (refreshToken) {
      const session = await repository.findSessionByTokenHash(hashToken(refreshToken));
      if (session && !session.revokedAt) {
        await repository.revokeSession(session.id);
        await audit.log({
          action: AuditAction.LOGOUT,
          entityType: 'session',
          entityId: session.id,
          userId: session.userId,
        });
      }
      return;
    }

    if (sessionId) {
      const session = await repository.findSessionById(sessionId);
      if (session && !session.revokedAt) {
        await repository.revokeSession(session.id);
      }
    }
  }

  async function logoutAll(userId: string, exceptSessionId?: string): Promise<number> {
    const count = await repository.revokeAllUserSessions(userId, exceptSessionId);
    await audit.log({
      action: AuditAction.SESSION_REVOKED,
      entityType: 'user',
      entityId: userId,
      userId,
      metadata: { revokedSessions: count, scope: 'all' },
    });
    return count;
  }

  /* ------------------------------------------------------------------------ */
  /* Mot de passe                                                              */
  /* ------------------------------------------------------------------------ */

  async function changePassword(
    userId: string,
    currentPassword: string,
    newPassword: string,
    keepSessionId: string,
  ): Promise<void> {
    const user = await repository.findUserById(userId);
    if (!user?.passwordHash) throw errors.notFound('Utilisateur introuvable.');

    if (!(await verifyPassword(user.passwordHash, currentPassword))) {
      throw new AppError({
        code: ErrorCode.INVALID_CREDENTIALS,
        message: 'Le mot de passe actuel est incorrect.',
        statusCode: 401,
      });
    }

    await repository.updateUser(userId, {
      passwordHash: await hashPassword(newPassword),
      mustChangePassword: false,
    });

    // Un changement de mot de passe déconnecte les autres appareils : si le
    // compte était compromis, c'est précisément l'effet recherché.
    await repository.revokeAllUserSessions(userId, keepSessionId);

    await audit.log({
      action: AuditAction.PASSWORD_CHANGED,
      entityType: 'user',
      entityId: userId,
      userId,
    });
  }

  async function resetPassword(rawPhone: string, code: string, newPassword: string): Promise<void> {
    const phone = await consumeOtp(rawPhone, 'PASSWORD_RESET', code);
    const user = await repository.findUserByPhone(phone);
    if (!user) throw errors.notFound('Aucun compte associé à ce numéro.');

    await repository.updateUser(user.id, {
      passwordHash: await hashPassword(newPassword),
      mustChangePassword: false,
      failedLoginCount: 0,
      lockedUntil: null,
      // Consommer un OTP sur ce numéro prouve qu'on contrôle la ligne : le
      // numéro est donc vérifié. C'est ce qui permet au même mécanisme de
      // servir d'invitation pour un compte créé par l'administration, qui
      // arrive sans mot de passe ni numéro vérifié.
      phoneVerifiedAt: user.phoneVerifiedAt ?? new Date(),
      ...(user.status === 'PENDING_VERIFICATION' && { status: 'ACTIVE' }),
    });
    await repository.revokeAllUserSessions(user.id);

    await audit.log({
      action: AuditAction.PASSWORD_RESET,
      entityType: 'user',
      entityId: user.id,
      userId: user.id,
    });
  }

  /* ------------------------------------------------------------------------ */
  /* Changement de numéro (§72)                                                */
  /* ------------------------------------------------------------------------ */

  /**
   * Double vérification : l'ancien numéro prouve que le demandeur contrôle le
   * compte, le nouveau qu'il contrôle la ligne. Un seul des deux ne suffirait
   * pas — c'est le scénario classique de détournement de compte par SIM swap.
   */
  async function confirmPhoneChange(
    userId: string,
    rawNewPhone: string,
    currentPhoneCode: string,
    newPhoneCode: string,
    keepSessionId: string,
  ): Promise<{ phone: string }> {
    const user = await repository.findUserById(userId);
    if (!user) throw errors.notFound('Utilisateur introuvable.');

    const newPhone = normalize(rawNewPhone);
    if (newPhone === user.phone) {
      throw errors.validation('Le nouveau numéro est identique à l’actuel.');
    }

    const taken = await repository.findUserByPhone(newPhone);
    if (taken) throw errors.conflict('Ce numéro est déjà utilisé par un autre compte.');

    await consumeOtp(user.phone, 'PHONE_CHANGE', currentPhoneCode);
    await consumeOtp(newPhone, 'PHONE_CHANGE', newPhoneCode);

    await repository.updateUser(userId, { phone: newPhone, phoneVerifiedAt: new Date() });
    await repository.revokeAllUserSessions(userId, keepSessionId);

    await audit.log({
      action: AuditAction.PHONE_CHANGED,
      entityType: 'user',
      entityId: userId,
      userId,
      before: { phone: maskPhone(user.phone) },
      after: { phone: maskPhone(newPhone) },
    });

    // L'ancien numéro est averti : si le changement n'est pas de son fait, le
    // titulaire légitime doit pouvoir réagir immédiatement.
    await sms.send({
      to: user.phone,
      kind: 'PHONE_CHANGED',
      body: 'CSB Noutcha KAMGUE : le numero associe a votre compte a ete modifie. Si vous n etes pas a l origine de ce changement, contactez immediatement votre etablissement.',
    });

    return { phone: newPhone };
  }

  /* ------------------------------------------------------------------------ */

  async function getCurrentUser(userId: string, schoolId: string | null): Promise<CurrentUser> {
    const user = await repository.findUserById(userId);
    if (!user) throw errors.notFound('Utilisateur introuvable.');
    return toCurrentUser(user, schoolId);
  }

  async function revokeOwnedSession(userId: string, sessionId: string): Promise<void> {
    const session = await repository.findSessionById(sessionId);
    if (!session || session.userId !== userId) throw errors.notFound('Session introuvable.');
    if (!session.revokedAt) await repository.revokeSession(sessionId);
    await audit.log({
      action: AuditAction.SESSION_REVOKED,
      entityType: 'session',
      entityId: sessionId,
      userId,
      metadata: { scope: 'single' },
    });
  }

  async function switchSchool(userId: string, schoolId: string, sessionId: string) {
    const user = await repository.findUserById(userId);
    if (!user) throw errors.notFound('Utilisateur introuvable.');
    assertUsable(user);
    if (!user.userRoles.some((membership) => membership.schoolId === schoolId)) {
      // Ne pas révéler si l'établissement existe.
      throw errors.notFound('Établissement introuvable.');
    }
    const access = resolveAccess(user, schoolId);
    const accessToken = await jwt.signAccessToken({
      sub: user.id,
      schoolId,
      roles: access.roles,
      permissions: access.permissions,
      sid: sessionId,
    });
    return {
      accessToken,
      expiresIn: accessTokenTtlSeconds(),
      tokenType: 'Bearer' as const,
      user: toCurrentUser(user, schoolId),
    };
  }

  return {
    sendOtp,
    consumeOtp,
    register,
    verifyPhone,
    login,
    refresh,
    logout,
    logoutAll,
    changePassword,
    resetPassword,
    confirmPhoneChange,
    getCurrentUser,
    listSessions: repository.listActiveSessions,
    revokeOwnedSession,
    switchSchool,
  };
}

export type AuthService = ReturnType<typeof createAuthService>;
