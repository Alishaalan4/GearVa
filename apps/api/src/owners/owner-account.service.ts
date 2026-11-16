import { HttpStatus, Injectable } from '@nestjs/common';
import {
  ERROR_CODES,
  type OwnerChangePasswordInput,
  type OwnerGarage,
  type OwnerPreferencesInput,
  type OwnerProfile,
  type UpdateOwnerProfileInput,
} from '@gearva/contracts';
import type { Garage, GarageCustomer, GarageSettings, TenantTx } from '@gearva/database';
import { LoginAttemptsService } from '../auth/login-attempts.service';
import { PasswordService } from '../auth/password.service';
import { SessionService } from '../auth/session.service';
import { RequestContext } from '../common/context/request-context';
import { OwnerDb } from '../common/db/owner-db';
import { PlatformDb } from '../common/db/platform-db';
import { AppException } from '../common/errors/app-exception';

type CustomerWithGarage = GarageCustomer & {
  garage: Garage & { settings: GarageSettings | null };
};

function toOwnerGarage(c: CustomerWithGarage): OwnerGarage {
  return {
    id: c.garage.id,
    name: c.garage.name,
    phone: c.garage.phone,
    locationText: c.garage.locationText,
    hasLogo: !!c.garage.settings?.logoFileId,
    remindersOptOut: c.remindersOptOut,
    marketingOptOut: c.marketingOptOut,
  };
}

function wrongPassword(): AppException {
  return new AppException(
    HttpStatus.UNAUTHORIZED,
    ERROR_CODES.INVALID_CREDENTIALS,
    'Wrong password',
  );
}

/**
 * The signed-in owner's profile and account (docs/mobile-api.md 3, flow.md 2.4).
 * Garage data (customer rows, garages) is read through OwnerDb, so RLS shows only this
 * owner's rows. The account itself (language, password, deletion) is the owners row,
 * which only the platform role may change (database.md 6.6).
 */
@Injectable()
export class OwnerAccountService {
  constructor(
    private readonly ownerDb: OwnerDb,
    private readonly platformDb: PlatformDb,
    private readonly passwords: PasswordService,
    private readonly sessions: SessionService,
    private readonly attempts: LoginAttemptsService,
    private readonly context: RequestContext,
  ) {}

  /** mobile-api.md 3.1: the owner and every garage where they are a customer. */
  async profile(): Promise<OwnerProfile> {
    const ownerId = this.ownerDb.ownerId;
    return this.ownerDb.run(async (tx) => {
      const owner = await tx.owner.findUniqueOrThrow({ where: { id: ownerId } });
      const customers = await this.customers(tx, ownerId);
      // The inbox (mobile-api.md 6.1): delivered in-app rows not read yet.
      const unreadNotifications = await tx.notification.count({
        where: {
          ownerId,
          channel: 'IN_APP',
          status: 'SENT',
          readAt: null,
          garage: { deletedAt: null },
        },
      });
      return {
        id: owner.id,
        name: owner.name,
        email: owner.email ?? '',
        locale: owner.locale === 'en' ? 'en' : 'ar',
        phone: owner.phone,
        unreadNotifications,
        garages: customers.map(toOwnerGarage),
      };
    });
  }

  /** mobile-api.md 3.2: the language of emails, push messages and new invoices. */
  async update(input: UpdateOwnerProfileInput): Promise<OwnerProfile> {
    await this.platformDb.client.owner.update({
      where: { id: this.ownerDb.ownerId },
      data: { locale: input.locale },
    });
    return this.profile();
  }

  /**
   * mobile-api.md 3.3: reminders or offers on or off at one garage only. An unknown
   * garage, or one where the person is not a customer, is NOT_FOUND.
   */
  async setPreferences(garageId: string, input: OwnerPreferencesInput): Promise<OwnerGarage> {
    const ownerId = this.ownerDb.ownerId;
    return this.ownerDb.run(async (tx) => {
      const current = await tx.garageCustomer.findFirst({
        where: { ownerId, garageId, deletedAt: null, garage: { deletedAt: null } },
      });
      if (!current) {
        throw new AppException(HttpStatus.NOT_FOUND, ERROR_CODES.NOT_FOUND, 'Garage not found');
      }
      const updated = await tx.garageCustomer.update({
        where: { id: current.id },
        data: {
          remindersOptOut: input.remindersOptOut,
          marketingOptOut: input.marketingOptOut,
        },
        include: { garage: { include: { settings: true } } },
      });
      return toOwnerGarage(updated);
    });
  }

  /** mobile-api.md 3.4: other sessions end, this one stays. */
  async changePassword(input: OwnerChangePasswordInput): Promise<void> {
    const owner = await this.verifyPassword(input.currentPassword);
    await this.platformDb.client.owner.update({
      where: { id: owner.id },
      data: {
        passwordHash: await this.passwords.hash(input.newPassword),
        passwordSetAt: new Date(),
        inviteTokenHash: null,
        inviteExpiresAt: null,
      },
    });
    const sessionId = this.context.sessionId;
    if (sessionId) await this.sessions.revokeOthers('OWNER', owner.id, sessionId);
    else await this.sessions.revokeAll('OWNER', owner.id);
  }

  /**
   * mobile-api.md 3.5, flow.md 2.4 step 6: deletes the app account (the stores require
   * it). The login email, the password, any open link and every session go; the
   * garages keep their own records, and can invite the person again later. Device tokens
   * are removed too (no push after deletion).
   */
  async deleteAccount(password: string): Promise<void> {
    const owner = await this.verifyPassword(password);
    await this.platformDb.client.owner.update({
      where: { id: owner.id },
      data: {
        email: null,
        passwordHash: null,
        passwordSetAt: null,
        inviteTokenHash: null,
        inviteExpiresAt: null,
      },
    });
    await this.sessions.revokeAll('OWNER', owner.id);
    await this.platformDb.client.deviceToken.deleteMany({ where: { ownerId: owner.id } });
  }

  /** The owner's current password, with the same per-email lockout as the login. */
  private async verifyPassword(password: string): Promise<{ id: string }> {
    const owner = await this.platformDb.client.owner.findUniqueOrThrow({
      where: { id: this.ownerDb.ownerId },
    });
    const email = owner.email ?? owner.id;
    await this.attempts.assertNotLockedOut('owner', email);
    if (!(await this.passwords.verify(owner.passwordHash, password))) {
      await this.attempts.recordFailure('owner', email);
      throw wrongPassword();
    }
    await this.attempts.clear('owner', email);
    return owner;
  }

  /** The owner's live customer rows at garages that still exist, oldest first. */
  private customers(tx: TenantTx, ownerId: string): Promise<CustomerWithGarage[]> {
    return tx.garageCustomer.findMany({
      where: { ownerId, deletedAt: null, garage: { deletedAt: null } },
      include: { garage: { include: { settings: true } } },
      orderBy: { createdAt: 'asc' },
    });
  }
}
