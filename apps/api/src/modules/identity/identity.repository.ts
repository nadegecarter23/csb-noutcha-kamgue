import type { OtpPurpose, Prisma } from '@prisma/client';
import type { Database } from '../../platform/db.js';

/**
 * Accès aux données du module identity.
 *
 * Aucune règle métier ici (docs/06-CONVENTIONS-DEV.md §3) : le repository lit
 * et écrit, le service décide.
 */

export type UserWithAccess = Prisma.UserGetPayload<{
  include: {
    userRoles: {
      include: {
        role: { include: { permissions: { include: { permission: true } } } };
        school: { select: { id: true; name: true; status: true } };
      };
    };
    accessScopes: true;
  };
}>;

const ACCESS_INCLUDE = {
  userRoles: {
    include: {
      role: { include: { permissions: { include: { permission: true } } } },
      school: { select: { id: true, name: true, status: true } },
    },
  },
  accessScopes: true,
} satisfies Prisma.UserInclude;

export function createIdentityRepository(db: Database) {
  return {
    /* --- Utilisateurs ---------------------------------------------------- */

    findUserById(id: string): Promise<UserWithAccess | null> {
      return db.user.findUnique({ where: { id }, include: ACCESS_INCLUDE });
    },

    findUserByPhone(phone: string): Promise<UserWithAccess | null> {
      return db.user.findUnique({ where: { phone }, include: ACCESS_INCLUDE });
    },

    findUserByEmail(email: string): Promise<UserWithAccess | null> {
      return db.user.findUnique({ where: { email }, include: ACCESS_INCLUDE });
    },

    createUser(data: Prisma.UserCreateInput): Promise<UserWithAccess> {
      return db.user.create({ data, include: ACCESS_INCLUDE });
    },

    updateUser(id: string, data: Prisma.UserUpdateInput): Promise<UserWithAccess> {
      return db.user.update({ where: { id }, data, include: ACCESS_INCLUDE });
    },

    async linkGuardiansByPhone(phone: string, userId: string) {
      const linked = await db.guardian.updateMany({
        where: { phone, userId: null },
        data: { userId },
      });
      const conflicts = await db.guardian.count({
        where: { phone, userId: { not: null }, NOT: { userId } },
      });
      return { linked: linked.count, conflicts };
    },

    /* --- Tentatives de connexion ----------------------------------------- */

    async registerFailedLogin(id: string, lockUntil: Date | null): Promise<number> {
      const user = await db.user.update({
        where: { id },
        data: {
          failedLoginCount: { increment: 1 },
          ...(lockUntil && { lockedUntil: lockUntil }),
        },
        select: { failedLoginCount: true },
      });
      return user.failedLoginCount;
    },

    async clearFailedLogins(id: string): Promise<void> {
      await db.user.update({
        where: { id },
        data: { failedLoginCount: 0, lockedUntil: null, lastLoginAt: new Date() },
      });
    },

    /* --- Sessions --------------------------------------------------------- */

    createSession(data: Prisma.SessionUncheckedCreateInput) {
      return db.session.create({ data });
    },

    findSessionByTokenHash(refreshTokenHash: string) {
      return db.session.findUnique({
        where: { refreshTokenHash },
        include: { user: { include: ACCESS_INCLUDE } },
      });
    },

    findSessionById(id: string) {
      return db.session.findUnique({ where: { id } });
    },

    listActiveSessions(userId: string) {
      return db.session.findMany({
        where: { userId, revokedAt: null, expiresAt: { gt: new Date() } },
        orderBy: { lastUsedAt: { sort: 'desc', nulls: 'last' } },
      });
    },

    async rotateSession(id: string, refreshTokenHash: string, expiresAt: Date): Promise<void> {
      await db.session.update({
        where: { id },
        data: { refreshTokenHash, expiresAt, lastUsedAt: new Date() },
      });
    },

    async revokeSession(id: string): Promise<void> {
      await db.session.update({ where: { id }, data: { revokedAt: new Date() } });
    },

    /**
     * Révoque toute une famille de sessions.
     *
     * Déclenché quand un refresh token déjà consommé est présenté : c'est la
     * signature d'un vol de jeton, on invalide donc toute la lignée issue de la
     * connexion d'origine (ADR-010).
     */
    async revokeSessionFamily(familyId: string): Promise<number> {
      const result = await db.session.updateMany({
        where: { familyId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      return result.count;
    },

    async revokeAllUserSessions(userId: string, exceptSessionId?: string): Promise<number> {
      const result = await db.session.updateMany({
        where: {
          userId,
          revokedAt: null,
          ...(exceptSessionId && { id: { not: exceptSessionId } }),
        },
        data: { revokedAt: new Date() },
      });
      return result.count;
    },

    /* --- OTP -------------------------------------------------------------- */

    createOtp(data: Prisma.OtpCodeUncheckedCreateInput) {
      return db.otpCode.create({ data });
    },

    findLatestOtp(phone: string, purpose: OtpPurpose) {
      return db.otpCode.findFirst({
        where: { phone, purpose, consumedAt: null },
        orderBy: { createdAt: 'desc' },
      });
    },

    countRecentOtps(phone: string, since: Date): Promise<number> {
      return db.otpCode.count({ where: { phone, createdAt: { gte: since } } });
    },

    async incrementOtpAttempts(id: string): Promise<number> {
      const otp = await db.otpCode.update({
        where: { id },
        data: { attempts: { increment: 1 } },
        select: { attempts: true },
      });
      return otp.attempts;
    },

    async consumeOtp(id: string): Promise<void> {
      // L’horloge PostgreSQL est la référence des contraintes temporelles :
      // l’horloge Node peut précéder `created_at` de quelques millisecondes.
      await db.$executeRaw`UPDATE otp_codes SET consumed_at = GREATEST(clock_timestamp(), created_at) WHERE id = ${id}::uuid`;
    },

    /** Invalide les OTP encore actifs d'un couple (numéro, usage). */
    async invalidatePendingOtps(phone: string, purpose: OtpPurpose) {
      await db.$executeRaw`UPDATE otp_codes SET consumed_at = GREATEST(clock_timestamp(), created_at) WHERE phone = ${phone} AND purpose = ${purpose}::otp_purpose AND consumed_at IS NULL`;
    },
  };
}

export type IdentityRepository = ReturnType<typeof createIdentityRepository>;
