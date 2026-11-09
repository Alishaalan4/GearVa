import { createHash, randomBytes } from 'node:crypto';
import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { ERROR_CODES, type StaffProfile } from '@gearva/contracts';
import type { AdminUser, Garage, Session } from '@gearva/database';
import type Redis from 'ioredis';
import { RequestContext } from '../common/context/request-context';
import { PlatformDb } from '../common/db/platform-db';
import { AppException } from '../common/errors/app-exception';
import { REDIS } from '../common/redis/redis.module';
import { type ClientMeta, SessionService } from './session.service';

/** The one-time code from the admin app works for 2 minutes, once. */
export const VIEW_AS_CODE_TTL_SECONDS = 2 * 60;
/** A view-as session lasts an hour and is never refreshed (flow.md 11.3). */
export const VIEW_AS_TTL_SECONDS = 60 * 60;

const codeKey = (code: string) => `view-as:${createHash('sha256').update(code).digest('hex')}`;

function invalidCode(): AppException {
  return new AppException(
    HttpStatus.BAD_REQUEST,
    ERROR_CODES.INVALID_LINK,
    'This link is no longer valid. Open "View as garage" again.',
  );
}

/**
 * "View as garage" (flow.md 11.3): an admin opens a garage's own app, read only.
 *   1. issue():    the admin app gets a one-time code (only its hash is kept, in Redis)
 *   2. exchange(): garage-web trades it for a 1-hour session of the admin in that garage
 *   3. StaffGuard: lets the session read, refuses every change, logs every record viewed
 *   4. end():      signing out writes the end of the visit
 * Every step writes an admin_access_logs row, so support access is always on record.
 */
@Injectable()
export class ViewAsService {
  constructor(
    private readonly platformDb: PlatformDb,
    private readonly sessions: SessionService,
    private readonly context: RequestContext,
    @Inject(REDIS) private readonly redis: Redis,
  ) {}

  async issue(adminId: string, garageId: string): Promise<{ code: string; expiresAt: Date }> {
    const code = randomBytes(32).toString('base64url');
    await this.redis.set(
      codeKey(code),
      JSON.stringify({ adminId, garageId }),
      'EX',
      VIEW_AS_CODE_TTL_SECONDS,
    );
    return { code, expiresAt: new Date(Date.now() + VIEW_AS_CODE_TTL_SECONDS * 1000) };
  }

  async exchange(
    code: string,
    meta: ClientMeta,
  ): Promise<{ profile: StaffProfile; accessToken: string; refreshToken: string }> {
    // GETDEL: the code works once, even if two requests bring it at the same time.
    const stored = await this.redis.getdel(codeKey(code));
    if (!stored) throw invalidCode();
    const { adminId, garageId } = JSON.parse(stored) as { adminId: string; garageId: string };
    const { admin, garage } = await this.load(adminId, garageId);

    const { session, refreshToken } = await this.sessions.create('ADMIN', admin.id, meta, {
      ttlSeconds: VIEW_AS_TTL_SECONDS,
      viewAsGarageId: garage.id,
    });
    const accessToken = await this.sessions.signAccess(
      { sub: admin.id, sid: session.id, typ: 'view-as' },
      VIEW_AS_TTL_SECONDS,
    );
    await this.log(admin.id, garage.id, 'VIEW_AS_GARAGE_START', null, meta.ip);
    return { profile: toProfile(admin, garage), accessToken, refreshToken };
  }

  /** The admin and garage of an open view-as session, or null if it may not be used. */
  async check(session: Session): Promise<{ admin: AdminUser; garage: Garage } | null> {
    if (session.subjectType !== 'ADMIN' || !session.viewAsGarageId) return null;
    try {
      return await this.load(session.subjectId, session.viewAsGarageId);
    } catch {
      return null;
    }
  }

  /** GET /v1/auth/me during a view-as session. */
  async profile(): Promise<StaffProfile> {
    const actor = this.context.actor;
    if (!actor?.id || !actor.garageId) throw new Error('profile() needs a view-as actor');
    const { admin, garage } = await this.load(actor.id, actor.garageId);
    return toProfile(admin, garage);
  }

  /** flow.md 11.3: each record an admin opens in the garage's app. */
  logView(adminId: string, garageId: string, path: string, ip?: string): Promise<void> {
    return this.log(adminId, garageId, 'RECORD_VIEWED', path, ip);
  }

  /** Signing out of a view-as session: the end of the visit. */
  async end(session: Session, ip?: string): Promise<void> {
    if (session.subjectType !== 'ADMIN' || !session.viewAsGarageId) return;
    await this.log(session.subjectId, session.viewAsGarageId, 'VIEW_AS_GARAGE_END', null, ip);
  }

  private async load(adminId: string, garageId: string) {
    const db = this.platformDb.client;
    const admin = await db.adminUser.findUnique({ where: { id: adminId } });
    const garage = await db.garage.findFirst({ where: { id: garageId, deletedAt: null } });
    if (!admin?.isActive || !garage) throw invalidCode();
    return { admin, garage };
  }

  private async log(
    adminId: string,
    garageId: string,
    action: 'VIEW_AS_GARAGE_START' | 'VIEW_AS_GARAGE_END' | 'RECORD_VIEWED',
    path: string | null,
    ip?: string,
  ): Promise<void> {
    await this.platformDb.client.adminAccessLog.create({
      data: { adminId, garageId, action, path, ip: ip ?? null },
    });
  }
}

/** The admin, shown in the garage's app as a read-only owner. */
function toProfile(admin: AdminUser, garage: Garage): StaffProfile {
  return {
    id: admin.id,
    name: admin.name,
    email: admin.email,
    role: 'OWNER',
    locale: garage.defaultLocale === 'ar' ? 'ar' : 'en',
    branchId: null,
    garage: {
      id: garage.id,
      name: garage.name,
      status: garage.status,
      defaultLocale: garage.defaultLocale === 'ar' ? 'ar' : 'en',
      timezone: garage.timezone,
    },
    viewOnly: true,
  };
}
