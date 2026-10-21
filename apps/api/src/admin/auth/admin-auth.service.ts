import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import {
  type AdminLoginInput,
  type AdminLoginNext,
  type AdminProfile,
  type AdminTotpSetupResponse,
  type AdminTotpVerifyInput,
  ERROR_CODES,
} from '@gearva/contracts';
import type { AdminUser } from '@gearva/database';
import type Redis from 'ioredis';
import { PasswordService } from '../../auth/password.service';
import { type ClientMeta, SessionService } from '../../auth/session.service';
import { TotpService } from '../../auth/totp.service';
import { RequestContext } from '../../common/context/request-context';
import { PlatformDb } from '../../common/db/platform-db';
import { AppException } from '../../common/errors/app-exception';
import { REDIS } from '../../common/redis/redis.module';

/** Failed password or 2FA attempts per email before a 15-minute lockout (flow.md 2.2). */
const MAX_FAILURES = 10;
const FAILURE_WINDOW_SECONDS = 15 * 60;

export interface AdminTokens {
  accessToken: string;
  refreshToken: string;
}

function toProfile(admin: AdminUser): AdminProfile {
  return { id: admin.id, email: admin.email, name: admin.name, role: admin.role };
}

/**
 * Admin login (flow.md 2.3): password, then TOTP. The very first login sets up TOTP and
 * returns the recovery codes once. admin_users is a platform table (no garage), so all
 * reads and writes use the platform role.
 */
@Injectable()
export class AdminAuthService {
  constructor(
    private readonly platformDb: PlatformDb,
    private readonly passwords: PasswordService,
    private readonly totp: TotpService,
    private readonly sessions: SessionService,
    private readonly context: RequestContext,
    @Inject(REDIS) private readonly redis: Redis,
  ) {}

  /** Step 1: email + password. Same error for unknown email, wrong password, inactive. */
  async checkPassword(input: AdminLoginInput): Promise<{ adminId: string; next: AdminLoginNext }> {
    await this.assertNotLockedOut(input.email);
    const admin = await this.platformDb.client.adminUser.findUnique({
      where: { email: input.email },
    });
    const ok = await this.passwords.verify(
      admin?.isActive ? admin.passwordHash : null,
      input.password,
    );
    if (!admin || !ok) {
      await this.recordFailure(input.email);
      throw new AppException(
        HttpStatus.UNAUTHORIZED,
        ERROR_CODES.INVALID_CREDENTIALS,
        'Wrong email or password',
      );
    }
    return { adminId: admin.id, next: admin.totpEnabled ? 'TOTP_VERIFY' : 'TOTP_SETUP' };
  }

  /** First login only: a new secret for the authenticator app. Calling again replaces it. */
  async setupTotp(adminId: string): Promise<AdminTotpSetupResponse> {
    const admin = await this.activeAdmin(adminId);
    if (admin.totpEnabled) {
      throw new AppException(HttpStatus.FORBIDDEN, ERROR_CODES.FORBIDDEN, '2FA is already set up');
    }
    const secret = this.totp.newSecret();
    await this.platformDb.client.adminUser.update({
      where: { id: admin.id },
      data: { totpSecretEnc: this.totp.encrypt(secret) },
    });
    return { secret, otpauthUri: this.totp.otpauthUri(secret, admin.email) };
  }

  /** Step 2: a TOTP code (or a recovery code once 2FA is on). Opens the session. */
  async verifySecondFactor(
    adminId: string,
    input: AdminTotpVerifyInput,
    meta: ClientMeta,
  ): Promise<{ profile: AdminProfile; tokens: AdminTokens; recoveryCodes?: string[] }> {
    const admin = await this.activeAdmin(adminId);
    await this.assertNotLockedOut(admin.email);
    if (!admin.totpSecretEnc) throw this.invalidCode();

    const db = this.platformDb.client;
    let recoveryCodes: string[] | undefined;

    if (input.code !== undefined) {
      if (!this.totp.verify(this.totp.decrypt(admin.totpSecretEnc), input.code)) {
        await this.recordFailure(admin.email);
        throw this.invalidCode();
      }
      if (!admin.totpEnabled) {
        // First successful code: 2FA is now on, and the recovery codes are shown once.
        const generated = this.totp.newRecoveryCodes();
        recoveryCodes = generated.codes;
        await db.adminUser.update({
          where: { id: admin.id },
          data: { totpEnabled: true, recoveryCodesHash: generated.hashes },
        });
      }
    } else {
      const index = admin.totpEnabled
        ? this.totp.findRecoveryCode(admin.recoveryCodesHash, input.recoveryCode ?? '')
        : -1;
      if (index < 0) {
        await this.recordFailure(admin.email);
        throw this.invalidCode();
      }
      // Each recovery code works once.
      await db.adminUser.update({
        where: { id: admin.id },
        data: { recoveryCodesHash: admin.recoveryCodesHash.filter((_, i) => i !== index) },
      });
    }

    await db.adminUser.update({ where: { id: admin.id }, data: { lastLoginAt: new Date() } });
    await this.redis.del(this.failureKey(admin.email));
    const tokens = await this.openSession(admin, meta);
    return { profile: toProfile(admin), tokens, recoveryCodes };
  }

  async refresh(
    refreshToken: string,
    meta: ClientMeta,
  ): Promise<{ profile: AdminProfile; tokens: AdminTokens } | null> {
    const rotated = await this.sessions.rotate('ADMIN', refreshToken, meta);
    if (!rotated) return null;
    const admin = await this.platformDb.client.adminUser.findUnique({
      where: { id: rotated.session.subjectId },
    });
    if (!admin?.isActive || !admin.totpEnabled) {
      await this.sessions.revokeAll('ADMIN', rotated.session.subjectId);
      return null;
    }
    this.setActor(admin);
    const accessToken = await this.sessions.signAccess({
      sub: admin.id,
      sid: rotated.session.id,
      typ: 'admin',
    });
    return {
      profile: toProfile(admin),
      tokens: { accessToken, refreshToken: rotated.refreshToken },
    };
  }

  async logout(refreshToken: string): Promise<void> {
    const session = await this.sessions.revoke(refreshToken);
    if (session?.subjectType !== 'ADMIN') return;
    const admin = await this.platformDb.client.adminUser.findUnique({
      where: { id: session.subjectId },
    });
    if (admin) this.setActor(admin);
  }

  async profile(adminId: string): Promise<AdminProfile> {
    return toProfile(await this.activeAdmin(adminId));
  }

  private async openSession(admin: AdminUser, meta: ClientMeta): Promise<AdminTokens> {
    const { session, refreshToken } = await this.sessions.create('ADMIN', admin.id, meta);
    const accessToken = await this.sessions.signAccess({
      sub: admin.id,
      sid: session.id,
      typ: 'admin',
    });
    // From here on the request has an actor, so the audit interceptor records the login.
    this.setActor(admin);
    return { accessToken, refreshToken };
  }

  private setActor(admin: AdminUser): void {
    this.context.setActor({
      type: 'ADMIN',
      id: admin.id,
      garageId: null,
      role: admin.role,
      branchId: null,
    });
  }

  private async activeAdmin(adminId: string): Promise<AdminUser> {
    const admin = await this.platformDb.client.adminUser.findUnique({ where: { id: adminId } });
    if (!admin?.isActive) {
      throw new AppException(HttpStatus.UNAUTHORIZED, ERROR_CODES.UNAUTHORIZED, 'Not signed in');
    }
    return admin;
  }

  private invalidCode(): AppException {
    return new AppException(HttpStatus.UNAUTHORIZED, ERROR_CODES.INVALID_2FA_CODE, 'Wrong code');
  }

  private failureKey(email: string): string {
    return `auth:failures:admin:${email}`;
  }

  private async recordFailure(email: string): Promise<void> {
    const key = this.failureKey(email);
    const count = await this.redis.incr(key);
    if (count === 1) await this.redis.expire(key, FAILURE_WINDOW_SECONDS);
  }

  private async assertNotLockedOut(email: string): Promise<void> {
    const count = Number(await this.redis.get(this.failureKey(email)));
    if (count >= MAX_FAILURES) {
      throw new AppException(
        HttpStatus.TOO_MANY_REQUESTS,
        ERROR_CODES.RATE_LIMITED,
        'Too many failed attempts. Try again in 15 minutes.',
      );
    }
  }
}
