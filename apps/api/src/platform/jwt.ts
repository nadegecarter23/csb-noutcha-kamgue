import { SignJWT, jwtVerify, errors as joseErrors } from 'jose';
import type { AppConfig } from './config.js';
import { AppError, ErrorCode, isAppError } from './errors.js';

/**
 * Jetons d'accès JWT (ADR-010).
 *
 * Durée courte (15 min) : les permissions sont embarquées dans le jeton pour
 * éviter une requête base à chaque appel, mais un retrait de droits ne doit pas
 * mettre des heures à prendre effet. Le renouvellement passe par le refresh
 * token, qui vérifie la session en base — c'est là que la révocation agit.
 */

export const JWT_ISSUER = 'cplan';
export const JWT_AUDIENCE = 'cplan-api';

export interface AccessTokenPayload {
  /** Identifiant utilisateur. */
  sub: string;
  /** Établissement du contexte courant. Absent pour un parent multi-écoles. */
  schoolId?: string;
  roles: string[];
  permissions: string[];
  /** Identifiant de la session, pour corréler avec le refresh token. */
  sid: string;
}

export interface JwtService {
  signAccessToken(payload: AccessTokenPayload): Promise<string>;
  verifyAccessToken(token: string): Promise<AccessTokenPayload>;
}

export function createJwtService(config: AppConfig): JwtService {
  const secret = new TextEncoder().encode(config.JWT_SECRET);

  return {
    async signAccessToken(payload) {
      return new SignJWT({
        schoolId: payload.schoolId,
        roles: payload.roles,
        permissions: payload.permissions,
        sid: payload.sid,
      })
        .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
        .setSubject(payload.sub)
        .setIssuer(JWT_ISSUER)
        .setAudience(JWT_AUDIENCE)
        .setIssuedAt()
        .setExpirationTime(config.JWT_ACCESS_TTL)
        .sign(secret);
    },

    async verifyAccessToken(token) {
      try {
        const { payload } = await jwtVerify(token, secret, {
          issuer: JWT_ISSUER,
          audience: JWT_AUDIENCE,
          algorithms: ['HS256'], // jamais 'none', jamais de négociation
        });

        if (typeof payload.sub !== 'string' || typeof payload.sid !== 'string') {
          throw new AppError({
            code: ErrorCode.TOKEN_INVALID,
            message: 'Jeton malformé.',
            statusCode: 401,
          });
        }

        return {
          sub: payload.sub,
          sid: payload.sid,
          ...(typeof payload.schoolId === 'string' && { schoolId: payload.schoolId }),
          roles: Array.isArray(payload.roles) ? (payload.roles as string[]) : [],
          permissions: Array.isArray(payload.permissions) ? (payload.permissions as string[]) : [],
        };
      } catch (error) {
        if (isAppError(error)) throw error;

        // Distinguer l'expiration du reste : sur TOKEN_EXPIRED le client
        // rafraîchit silencieusement ; sur TOKEN_INVALID il renvoie
        // l'utilisateur à l'écran de connexion. Confondre les deux
        // déconnecterait un parent toutes les quinze minutes.
        if (error instanceof joseErrors.JWTExpired) {
          throw new AppError({
            code: ErrorCode.TOKEN_EXPIRED,
            message: 'Session expirée.',
            statusCode: 401,
          });
        }

        throw new AppError({
          code: ErrorCode.TOKEN_INVALID,
          message: 'Jeton invalide.',
          statusCode: 401,
        });
      }
    },
  };
}
