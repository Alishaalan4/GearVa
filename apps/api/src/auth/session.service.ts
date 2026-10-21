import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { Session, SubjectType } from '@gearva/database';
import { createHash, randomBytes } from 'node:crypto';
import { PlatformDb } from '../common/db/platform-db';

export const ACCESS_TTL_SECONDS = 15 * 60;
export const REFRESH_TTL_SECONDS = 30 * 24 * 60 * 60;
export const MFA_TTL_SECONDS = 5 * 60;

/** Claims inside the 15-minute access token. */
export interface AccessClaims {
  sub: string;
  /** sessions.id: lets a guard reject a token whose session was revoked */
  sid: string;
  typ: 'admin' | 'staff';
}

interface MfaClaims {
  sub: string;
  typ: 'admin-mfa';
}

export interface ClientMeta {
  ip?: string;
  userAgent?: string;
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

/**
 * Sessions and tokens (README 5.2). The access token is a short JWT. The refresh token
 * is a random value; only its hash is stored in `sessions`. Every refresh replaces it,
 * and presenting an already-replaced token revokes all of that person's sessions,
 * because it means the token was copied.
 * `sessions` is a platform table, so this uses the platform role.
 */
@Injectable()
export class SessionService {
  constructor(
    private readonly platformDb: PlatformDb,
    private readonly jwt: JwtService,
  ) {}

  async create(
    subjectType: SubjectType,
    subjectId: string,
    meta: ClientMeta,
  ): Promise<{ session: Session; refreshToken: string }> {
    const refreshToken = randomBytes(32).toString('base64url');
    const session = await this.platformDb.client.session.create({
      data: {
        subjectType,
        subjectId,
        refreshTokenHash: sha256(refreshToken),
        ip: meta.ip ?? null,
        userAgent: meta.userAgent ?? null,
        expiresAt: new Date(Date.now() + REFRESH_TTL_SECONDS * 1000),
      },
    });
    return { session, refreshToken };
  }

  /**
   * Replaces a refresh token. Returns null when it is unknown, expired or reused.
   * `beforeRotate` runs on a valid session before the token is retired; if it throws,
   * the session is left exactly as it was (a garage lock must not sign anyone out).
   */
  async rotate(
    subjectType: SubjectType,
    refreshToken: string,
    meta: ClientMeta,
    beforeRotate?: (session: Session) => Promise<void>,
  ): Promise<{ session: Session; refreshToken: string } | null> {
    const db = this.platformDb.client;
    const current = await db.session.findUnique({
      where: { refreshTokenHash: sha256(refreshToken) },
    });
    if (!current || current.subjectType !== subjectType) return null;
    if (current.revokedAt) {
      await this.revokeAll(current.subjectType, current.subjectId);
      return null;
    }
    if (current.expiresAt <= new Date()) return null;
    await beforeRotate?.(current);

    // Only one request can retire this token; a second one at the same time is a reuse.
    const retired = await db.session.updateMany({
      where: { id: current.id, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    if (retired.count === 0) {
      await this.revokeAll(current.subjectType, current.subjectId);
      return null;
    }
    return this.create(subjectType, current.subjectId, meta);
  }

  /** Revokes the session of this refresh token; returns it, or null if there was none. */
  async revoke(refreshToken: string): Promise<Session | null> {
    const db = this.platformDb.client;
    const session = await db.session.findUnique({
      where: { refreshTokenHash: sha256(refreshToken) },
    });
    if (!session) return null;
    await db.session.updateMany({
      where: { id: session.id, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    return session;
  }

  async revokeAll(subjectType: SubjectType, subjectId: string): Promise<void> {
    await this.platformDb.client.session.updateMany({
      where: { subjectType, subjectId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  async isActive(sessionId: string): Promise<boolean> {
    const session = await this.platformDb.client.session.findUnique({ where: { id: sessionId } });
    return !!session && !session.revokedAt && session.expiresAt > new Date();
  }

  signAccess(claims: AccessClaims): Promise<string> {
    return this.jwt.signAsync(claims, { expiresIn: ACCESS_TTL_SECONDS });
  }

  async verifyAccess(token: string, typ: AccessClaims['typ']): Promise<AccessClaims | null> {
    const claims = await this.jwt.verifyAsync<AccessClaims>(token).catch(() => null);
    return claims?.typ === typ && claims.sid ? claims : null;
  }

  /** The short-lived proof that the password step passed, before 2FA. */
  signAdminMfa(adminId: string): Promise<string> {
    const claims: MfaClaims = { sub: adminId, typ: 'admin-mfa' };
    return this.jwt.signAsync(claims, { expiresIn: MFA_TTL_SECONDS });
  }

  async verifyAdminMfa(token: string): Promise<string | null> {
    const claims = await this.jwt.verifyAsync<MfaClaims>(token).catch(() => null);
    return claims?.typ === 'admin-mfa' ? claims.sub : null;
  }
}
