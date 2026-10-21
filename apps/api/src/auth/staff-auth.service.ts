import { HttpStatus, Injectable } from '@nestjs/common';
import {
  ERROR_CODES,
  type SetPasswordInput,
  type StaffLoginInput,
  type StaffProfile,
} from '@gearva/contracts';
import type { Garage, User } from '@gearva/database';
import { RequestContext } from '../common/context/request-context';
import { PlatformDb } from '../common/db/platform-db';
import { TenantDb } from '../common/db/tenant-db';
import { AppException } from '../common/errors/app-exception';
import { garageLockReason, garageLocked } from '../common/garage-lock';
import { hashAccessToken } from './access-links';
import { LoginAttemptsService } from './login-attempts.service';
import { PasswordService } from './password.service';
import { type ClientMeta, SessionService } from './session.service';

export interface StaffTokens {
  accessToken: string;
  refreshToken: string;
}

type UserWithGarage = User & { garage: Garage };

export function toStaffProfile(user: UserWithGarage): StaffProfile {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    locale: user.locale === 'ar' ? 'ar' : 'en',
    branchId: user.branchId,
    garage: {
      id: user.garage.id,
      name: user.garage.name,
      status: user.garage.status,
      defaultLocale: user.garage.defaultLocale === 'ar' ? 'ar' : 'en',
    },
  };
}

/**
 * Garage staff sign-in (flow.md 2.1 steps 4-5, 2.2). Before a session exists there is
 * no tenant context, so credential and link lookups use the platform role
 * (database.md 4.2); everything after sign-in goes through TenantDb.
 */
@Injectable()
export class StaffAuthService {
  constructor(
    private readonly platformDb: PlatformDb,
    private readonly tenantDb: TenantDb,
    private readonly passwords: PasswordService,
    private readonly sessions: SessionService,
    private readonly attempts: LoginAttemptsService,
    private readonly context: RequestContext,
  ) {}

  /**
   * The invite or password-reset link: sets the password, makes the link unusable, ends
   * every other session of this user, then signs in (unless the garage is locked).
   */
  async setPassword(
    input: SetPasswordInput,
    meta: ClientMeta,
  ): Promise<{ profile: StaffProfile; tokens: StaffTokens }> {
    const db = this.platformDb.client;
    const user = await db.user.findUnique({
      where: { inviteTokenHash: hashAccessToken(input.token) },
      include: { garage: true },
    });
    const usable =
      user &&
      user.isActive &&
      !user.garage.deletedAt &&
      user.inviteExpiresAt !== null &&
      user.inviteExpiresAt > new Date();
    if (!usable) {
      throw new AppException(
        HttpStatus.BAD_REQUEST,
        ERROR_CODES.INVALID_LINK,
        'This link is invalid or has expired',
      );
    }

    const updated = await db.user.update({
      where: { id: user.id },
      data: {
        passwordHash: await this.passwords.hash(input.password),
        inviteTokenHash: null,
        inviteExpiresAt: null,
      },
      include: { garage: true },
    });
    await this.sessions.revokeAll('STAFF', user.id);

    const reason = garageLockReason(updated.garage);
    if (reason) throw garageLocked(reason);
    return this.completeLogin(updated, meta);
  }

  /** flow.md 2.2: same error for unknown email, wrong password and inactive user. */
  async login(
    input: StaffLoginInput,
    meta: ClientMeta,
  ): Promise<{ profile: StaffProfile; tokens: StaffTokens }> {
    await this.attempts.assertNotLockedOut('staff', input.email);
    const user = await this.platformDb.client.user.findUnique({
      where: { email: input.email },
      include: { garage: true },
    });
    const usable = user?.isActive && !user.garage.deletedAt;
    const ok = await this.passwords.verify(usable ? user.passwordHash : null, input.password);
    if (!user || !ok) {
      await this.attempts.recordFailure('staff', input.email);
      throw new AppException(
        HttpStatus.UNAUTHORIZED,
        ERROR_CODES.INVALID_CREDENTIALS,
        'Wrong email or password',
      );
    }
    // The password was right, so saying "locked" reveals nothing new (flow.md 2.2 step 3).
    const reason = garageLockReason(user.garage);
    if (reason) throw garageLocked(reason);
    return this.completeLogin(user, meta);
  }

  async refresh(
    refreshToken: string,
    meta: ClientMeta,
  ): Promise<{ profile: StaffProfile; tokens: StaffTokens } | null> {
    // A locked garage keeps its sessions (flow.md 2.5: a lock deletes nothing), so the
    // lock is checked before the token is replaced and the session stays usable after
    // reactivation.
    const rotated = await this.sessions.rotate('STAFF', refreshToken, meta, async (session) => {
      const owner = await this.platformDb.client.user.findUnique({
        where: { id: session.subjectId },
        include: { garage: true },
      });
      const reason =
        owner?.isActive && !owner.garage.deletedAt ? garageLockReason(owner.garage) : null;
      if (reason) throw garageLocked(reason);
    });
    if (!rotated) return null;
    const user = await this.platformDb.client.user.findUnique({
      where: { id: rotated.session.subjectId },
      include: { garage: true },
    });
    if (!user?.isActive || user.garage.deletedAt) {
      await this.sessions.revokeAll('STAFF', rotated.session.subjectId);
      return null;
    }
    this.setActor(user);
    const accessToken = await this.sessions.signAccess({
      sub: user.id,
      sid: rotated.session.id,
      typ: 'staff',
    });
    return {
      profile: toStaffProfile(user),
      tokens: { accessToken, refreshToken: rotated.refreshToken },
    };
  }

  async logout(refreshToken: string): Promise<void> {
    const session = await this.sessions.revoke(refreshToken);
    if (session?.subjectType !== 'STAFF') return;
    const user = await this.platformDb.client.user.findUnique({ where: { id: session.subjectId } });
    if (user) this.setActor(user);
  }

  /** The signed-in staff member, read through the tenant context. */
  async profile(): Promise<StaffProfile> {
    const userId = this.context.actor?.id ?? '';
    const user = await this.tenantDb.run((tx) =>
      tx.user.findFirstOrThrow({
        where: { id: userId, garageId: this.tenantDb.garageId },
        include: { garage: true },
      }),
    );
    return toStaffProfile(user);
  }

  private async completeLogin(
    user: UserWithGarage,
    meta: ClientMeta,
  ): Promise<{ profile: StaffProfile; tokens: StaffTokens }> {
    const now = new Date();
    const db = this.platformDb.client;
    await db.user.update({ where: { id: user.id }, data: { lastLoginAt: now } });
    // Denormalized for the admin "inactive garages" list (database.md 4.2).
    await db.garage.update({ where: { id: user.garageId }, data: { lastLoginAt: now } });
    await this.attempts.clear('staff', user.email);

    const { session, refreshToken } = await this.sessions.create('STAFF', user.id, meta);
    const accessToken = await this.sessions.signAccess({
      sub: user.id,
      sid: session.id,
      typ: 'staff',
    });
    // From here on the request has an actor, so the audit interceptor records the login.
    this.setActor(user);
    return { profile: toStaffProfile(user), tokens: { accessToken, refreshToken } };
  }

  private setActor(user: User): void {
    this.context.setActor({
      type: 'STAFF',
      id: user.id,
      garageId: user.garageId,
      role: user.role,
      branchId: user.branchId,
    });
  }
}
