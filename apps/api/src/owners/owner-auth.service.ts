import { HttpStatus, Inject, Injectable, Logger } from '@nestjs/common';
import {
  ERROR_CODES,
  type OwnerAccount,
  type OwnerAuthResponse,
  type OwnerLoginInput,
  type OwnerSetPasswordInput,
  type OwnerSetPasswordResponse,
} from '@gearva/contracts';
import type { Owner } from '@gearva/database';
import type Redis from 'ioredis';
import { RESET_LINK_HOURS, hashAccessToken, newAccessLink } from '../auth/access-links';
import { LoginAttemptsService } from '../auth/login-attempts.service';
import { PasswordService } from '../auth/password.service';
import { ACCESS_TTL_SECONDS, type ClientMeta, SessionService } from '../auth/session.service';
import { RequestContext } from '../common/context/request-context';
import { PlatformDb } from '../common/db/platform-db';
import { AppException } from '../common/errors/app-exception';
import { REDIS } from '../common/redis/redis.module';
import { ENV, type Env } from '../config/env';
import { NotificationsService } from '../notifications/notifications.service';

/** One reset email per address per minute, whatever the IP (forgot-password). */
const RESET_EMAIL_GAP_SECONDS = 60;

export function toOwnerAccount(owner: Owner & { email: string }): OwnerAccount {
  return {
    id: owner.id,
    name: owner.name,
    email: owner.email,
    locale: owner.locale === 'en' ? 'en' : 'ar',
  };
}

function invalidLink(): AppException {
  return new AppException(
    HttpStatus.BAD_REQUEST,
    ERROR_CODES.INVALID_LINK,
    'This link is invalid or has expired',
  );
}

/**
 * Car-owner sign-in for the owner app (flow.md 2.4, docs/mobile-api.md 2). Tokens are
 * returned in the body (Bearer), not cookies: a native app has no cookie jar to protect.
 * `owners` is a platform table and no owner is signed in yet, so this uses the platform
 * role (database.md 6.6: "gearva_platform (admin, owner login) reads and writes owners").
 */
@Injectable()
export class OwnerAuthService {
  private readonly logger = new Logger(OwnerAuthService.name);

  constructor(
    private readonly platformDb: PlatformDb,
    private readonly passwords: PasswordService,
    private readonly sessions: SessionService,
    private readonly attempts: LoginAttemptsService,
    private readonly notifications: NotificationsService,
    private readonly context: RequestContext,
    @Inject(REDIS) private readonly redis: Redis,
    @Inject(ENV) private readonly env: Env,
  ) {}

  /**
   * flow.md 2.4 step 2: the invite (or reset) link's page. Saves the password, makes the
   * link unusable and ends every app session of this owner. No session is opened: the
   * owner signs in from the app.
   */
  async setPassword(input: OwnerSetPasswordInput): Promise<OwnerSetPasswordResponse> {
    const db = this.platformDb.client;
    const owner = await db.owner.findUnique({
      where: { inviteTokenHash: hashAccessToken(input.token) },
    });
    const usable =
      owner?.email && owner.inviteExpiresAt !== null && owner.inviteExpiresAt > new Date();
    if (!owner?.email || !usable) throw invalidLink();

    // Only the request that still finds the token wins, so a link works exactly once.
    const { count } = await db.owner.updateMany({
      where: { id: owner.id, inviteTokenHash: owner.inviteTokenHash },
      data: {
        passwordHash: await this.passwords.hash(input.password),
        passwordSetAt: new Date(),
        inviteTokenHash: null,
        inviteExpiresAt: null,
      },
    });
    if (count === 0) throw invalidLink();
    await this.sessions.revokeAll('OWNER', owner.id);

    // The audit row (owner.set_password) belongs to the owner, not to a garage.
    this.setActor(owner.id);
    return { email: owner.email };
  }

  /**
   * mobile-api.md 2.2. The same error for an unknown email, a wrong password and an
   * account whose password was never set, and the same time spent (PasswordService).
   */
  async login(input: OwnerLoginInput, meta: ClientMeta): Promise<OwnerAuthResponse> {
    await this.attempts.assertNotLockedOut('owner', input.email);
    const owner = await this.platformDb.client.owner.findUnique({ where: { email: input.email } });
    const ok = await this.passwords.verify(owner?.passwordHash, input.password);
    if (!owner?.email || !ok) {
      await this.attempts.recordFailure('owner', input.email);
      throw new AppException(
        HttpStatus.UNAUTHORIZED,
        ERROR_CODES.INVALID_CREDENTIALS,
        'Wrong email or password',
      );
    }
    await this.attempts.clear('owner', input.email);
    const updated = await this.platformDb.client.owner.update({
      where: { id: owner.id },
      data: { lastLoginAt: new Date() },
    });
    const { session, refreshToken } = await this.sessions.create('OWNER', owner.id, meta);
    return this.respond({ ...updated, email: owner.email }, session, refreshToken);
  }

  /**
   * mobile-api.md 2.3: a refresh token works once. An unknown, expired or reused one
   * gives INVALID_LINK; reuse also ends every session of the owner (README 5.2: it means
   * the token was copied).
   */
  async refresh(refreshToken: string, meta: ClientMeta): Promise<OwnerAuthResponse> {
    const rotated = await this.sessions.rotate('OWNER', refreshToken, meta);
    if (!rotated) throw refreshRefused();
    const owner = await this.platformDb.client.owner.findUnique({
      where: { id: rotated.session.subjectId },
    });
    // The account was deleted (or its password cleared) since the session started.
    if (!owner?.email || !owner.passwordHash) {
      await this.sessions.revokeAll('OWNER', rotated.session.subjectId);
      throw refreshRefused();
    }
    return this.respond({ ...owner, email: owner.email }, rotated.session, rotated.refreshToken);
  }

  /** mobile-api.md 2.4: ends the session of this refresh token; always succeeds. */
  async logout(refreshToken: string): Promise<void> {
    const session = await this.sessions.revoke(refreshToken);
    if (session?.subjectType === 'OWNER') this.setActor(session.subjectId);
  }

  /**
   * mobile-api.md 2.5 and flow.md 2.4 step 4: the caller always gets 202. If the email is
   * an owner app login, a 24-hour reset link to the same set-password page is emailed.
   * The notification row needs a garage (database.md 4.6): the one whose invite set this
   * login email, which is the latest successful invite, so that garage's log shows only
   * the email it entered itself.
   */
  async forgotPassword(email: string): Promise<void> {
    const fresh = await this.redis.set(
      `auth:owner-reset:${email}`,
      '1',
      'EX',
      RESET_EMAIL_GAP_SECONDS,
      'NX',
    );
    if (fresh !== 'OK') return;
    const owner = await this.platformDb.client.owner.findUnique({ where: { email } });
    if (owner?.email) await this.sendResetLink({ ...owner, email: owner.email });
  }

  /**
   * Emails this owner a 24-hour link to the set-password page (a newer link replaces an
   * older one). Used by forgot-password and by the super admin's Users page. Returns
   * false when the person is no garage's customer (nobody to log the email under).
   */
  async sendResetLink(owner: Owner & { email: string }): Promise<boolean> {
    const db = this.platformDb.client;
    const customer =
      (await db.garageCustomer.findFirst({
        where: { ownerId: owner.id, deletedAt: null, inviteSentAt: { not: null } },
        orderBy: { inviteSentAt: 'desc' },
      })) ??
      (await db.garageCustomer.findFirst({
        where: { ownerId: owner.id, deletedAt: null },
        orderBy: { createdAt: 'desc' },
      }));
    if (!customer) {
      this.logger.warn(`Owner ${owner.id} asked for a reset but is no garage's customer`);
      return false;
    }

    const locale = owner.locale === 'en' ? 'en' : 'ar';
    const link = newAccessLink(this.env.APP_URL_GARAGE, 'reset', `/${locale}/owner/set-password`);
    const notification = await db.$transaction(async (tx) => {
      await tx.owner.update({
        where: { id: owner.id },
        data: { inviteTokenHash: link.tokenHash, inviteExpiresAt: link.expiresAt },
      });
      const { notification: row } = await this.notifications.record(tx, {
        garageId: customer.garageId,
        ownerId: owner.id,
        channel: 'EMAIL',
        type: 'INVITE',
        template: 'password-reset',
        locale,
        recipient: owner.email,
        payload: { name: customer.name, link: link.url, hours: RESET_LINK_HOURS },
        dedupeKey: `OWNER_PASSWORD_RESET:${owner.id}:${Date.now()}`,
        refType: 'owner',
        refId: owner.id,
      });
      return row;
    });
    try {
      await this.notifications.dispatch(notification);
    } catch (error) {
      this.logger.error(`Could not queue owner reset ${notification.id}`, error as Error);
    }
    return true;
  }

  /**
   * Sets a password chosen by someone else (the super admin, step 5.9): any open link
   * stops working and every app session ends, so only the new password works.
   */
  async setPasswordFor(ownerId: string, password: string): Promise<void> {
    await this.platformDb.client.owner.update({
      where: { id: ownerId },
      data: {
        passwordHash: await this.passwords.hash(password),
        passwordSetAt: new Date(),
        inviteTokenHash: null,
        inviteExpiresAt: null,
      },
    });
    await this.sessions.revokeAll('OWNER', ownerId);
  }

  /**
   * Closes the app account (mobile-api.md 3.5, and the super admin's Users page): the login
   * email, password and any link go, every session and phone token is removed. The garages
   * keep their own records and may invite the person again.
   */
  async closeAppAccount(ownerId: string): Promise<void> {
    const db = this.platformDb.client;
    await db.owner.update({
      where: { id: ownerId },
      data: {
        email: null,
        passwordHash: null,
        passwordSetAt: null,
        inviteTokenHash: null,
        inviteExpiresAt: null,
      },
    });
    await this.sessions.revokeAll('OWNER', ownerId);
    await db.deviceToken.deleteMany({ where: { ownerId } });
  }

  private async respond(
    owner: Owner & { email: string },
    session: { id: string; expiresAt: Date },
    refreshToken: string,
  ): Promise<OwnerAuthResponse> {
    const accessToken = await this.sessions.signAccess({
      sub: owner.id,
      sid: session.id,
      typ: 'owner',
    });
    this.setActor(owner.id);
    return {
      accessToken,
      accessExpiresAt: new Date(Date.now() + ACCESS_TTL_SECONDS * 1000).toISOString(),
      refreshToken,
      refreshExpiresAt: session.expiresAt.toISOString(),
      owner: toOwnerAccount(owner),
    };
  }

  private setActor(ownerId: string): void {
    this.context.setActor({
      type: 'OWNER',
      id: ownerId,
      garageId: null,
      role: null,
      branchId: null,
    });
  }
}

function refreshRefused(): AppException {
  return new AppException(
    HttpStatus.UNAUTHORIZED,
    ERROR_CODES.INVALID_LINK,
    'Sign in again: this session has ended',
  );
}
