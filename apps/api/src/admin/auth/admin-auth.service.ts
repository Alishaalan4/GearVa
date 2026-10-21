import { HttpStatus, Injectable } from '@nestjs/common';
import {
  type AdminLoginInput,
  type AdminProfile,
  type AdminTotpEnableResponse,
  type AdminTotpSetupResponse,
  type AdminTotpVerifyInput,
  ERROR_CODES,
} from '@gearva/contracts';
import type { AdminUser } from '@gearva/database';
import { LoginAttemptsService } from '../../auth/login-attempts.service';
import { PasswordService } from '../../auth/password.service';
import { type ClientMeta, SessionService } from '../../auth/session.service';
import { TotpService } from '../../auth/totp.service';
import { RequestContext } from '../../common/context/request-context';
import { PlatformDb } from '../../common/db/platform-db';
import { AppException } from '../../common/errors/app-exception';

export interface AdminTokens {
  accessToken: string;
  refreshToken: string;
}

export type PasswordStepResult =
  | { next: 'DONE'; profile: AdminProfile; tokens: AdminTokens }
  | { next: 'TOTP_VERIFY'; adminId: string };

function toProfile(admin: AdminUser): AdminProfile {
  return {
    id: admin.id,
    email: admin.email,
    name: admin.name,
    role: admin.role,
    totpEnabled: admin.totpEnabled,
  };
}

/**
 * Admin login (flow.md 2.3). 2FA is optional per admin: without it the password opens the
 * session; with it a TOTP code (or a one-time recovery code) is needed too. An admin turns
 * it on or off from their account while signed in. admin_users is a platform table (no
 * garage), so all reads and writes use the platform role.
 */
@Injectable()
export class AdminAuthService {
  constructor(
    private readonly platformDb: PlatformDb,
    private readonly passwords: PasswordService,
    private readonly totp: TotpService,
    private readonly sessions: SessionService,
    private readonly context: RequestContext,
    private readonly attempts: LoginAttemptsService,
  ) {}

  /** Email + password. Same error for unknown email, wrong password and inactive admin. */
  async passwordStep(input: AdminLoginInput, meta: ClientMeta): Promise<PasswordStepResult> {
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
    if (admin.totpEnabled) return { next: 'TOTP_VERIFY', adminId: admin.id };
    return { next: 'DONE', ...(await this.completeLogin(admin, meta)) };
  }

  /** Second step, only for admins with 2FA on: a TOTP code or a one-time recovery code. */
  async verifySecondFactor(
    adminId: string,
    input: AdminTotpVerifyInput,
    meta: ClientMeta,
  ): Promise<{ profile: AdminProfile; tokens: AdminTokens }> {
    const admin = await this.activeAdmin(adminId);
    await this.assertNotLockedOut(admin.email);
    if (!admin.totpEnabled) throw this.invalidCode();
    await this.checkSecondFactor(admin, input);
    return this.completeLogin(admin, meta);
  }

  /** Signed in, 2FA off: a new secret for the authenticator app. Calling again replaces it. */
  async startTotpSetup(adminId: string): Promise<AdminTotpSetupResponse> {
    const admin = await this.activeAdmin(adminId);
    if (admin.totpEnabled) {
      throw new AppException(
        HttpStatus.CONFLICT,
        ERROR_CODES.TOTP_ALREADY_ENABLED,
        'Two-factor authentication is already on',
      );
    }
    const secret = this.totp.newSecret();
    await this.platformDb.client.adminUser.update({
      where: { id: admin.id },
      data: { totpSecretEnc: this.totp.encrypt(secret) },
    });
    return { secret, otpauthUri: this.totp.otpauthUri(secret, admin.email) };
  }

  /** Turns 2FA on once a code from the app matches; returns the recovery codes once. */
  async enableTotp(adminId: string, code: string): Promise<AdminTotpEnableResponse> {
    const admin = await this.activeAdmin(adminId);
    if (admin.totpEnabled) {
      throw new AppException(
        HttpStatus.CONFLICT,
        ERROR_CODES.TOTP_ALREADY_ENABLED,
        'Two-factor authentication is already on',
      );
    }
    if (!admin.totpSecretEnc) {
      throw new AppException(
        HttpStatus.CONFLICT,
        ERROR_CODES.TOTP_SETUP_REQUIRED,
        'Start the setup first',
      );
    }
    await this.assertNotLockedOut(admin.email);
    if (!this.totp.verify(this.totp.decrypt(admin.totpSecretEnc), code)) {
      await this.recordFailure(admin.email);
      throw this.invalidCode();
    }
    const { codes, hashes } = this.totp.newRecoveryCodes();
    await this.platformDb.client.adminUser.update({
      where: { id: admin.id },
      data: { totpEnabled: true, recoveryCodesHash: hashes },
    });
    return { recoveryCodes: codes };
  }

  /** Turns 2FA off; needs a current code or a recovery code, so a stolen session cannot. */
  async disableTotp(adminId: string, input: AdminTotpVerifyInput): Promise<AdminProfile> {
    const admin = await this.activeAdmin(adminId);
    if (!admin.totpEnabled) {
      throw new AppException(
        HttpStatus.CONFLICT,
        ERROR_CODES.TOTP_NOT_ENABLED,
        'Two-factor authentication is not on',
      );
    }
    await this.assertNotLockedOut(admin.email);
    await this.checkSecondFactor(admin, input);
    const updated = await this.platformDb.client.adminUser.update({
      where: { id: admin.id },
      data: { totpEnabled: false, totpSecretEnc: null, recoveryCodesHash: [] },
    });
    return toProfile(updated);
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
    if (!admin?.isActive) {
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

  /** Throws INVALID_2FA_CODE unless the code (or an unused recovery code) matches. */
  private async checkSecondFactor(admin: AdminUser, input: AdminTotpVerifyInput): Promise<void> {
    if (input.code !== undefined) {
      const ok =
        admin.totpSecretEnc !== null &&
        this.totp.verify(this.totp.decrypt(admin.totpSecretEnc), input.code);
      if (!ok) {
        await this.recordFailure(admin.email);
        throw this.invalidCode();
      }
      return;
    }
    const index = this.totp.findRecoveryCode(admin.recoveryCodesHash, input.recoveryCode ?? '');
    if (index < 0) {
      await this.recordFailure(admin.email);
      throw this.invalidCode();
    }
    // Each recovery code works once.
    await this.platformDb.client.adminUser.update({
      where: { id: admin.id },
      data: { recoveryCodesHash: admin.recoveryCodesHash.filter((_, i) => i !== index) },
    });
  }

  private async completeLogin(
    admin: AdminUser,
    meta: ClientMeta,
  ): Promise<{ profile: AdminProfile; tokens: AdminTokens }> {
    await this.platformDb.client.adminUser.update({
      where: { id: admin.id },
      data: { lastLoginAt: new Date() },
    });
    await this.attempts.clear('admin', admin.email);
    const { session, refreshToken } = await this.sessions.create('ADMIN', admin.id, meta);
    const accessToken = await this.sessions.signAccess({
      sub: admin.id,
      sid: session.id,
      typ: 'admin',
    });
    // From here on the request has an actor, so the audit interceptor records the login.
    this.setActor(admin);
    return { profile: toProfile(admin), tokens: { accessToken, refreshToken } };
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

  private recordFailure(email: string): Promise<void> {
    return this.attempts.recordFailure('admin', email);
  }

  private assertNotLockedOut(email: string): Promise<void> {
    return this.attempts.assertNotLockedOut('admin', email);
  }
}
