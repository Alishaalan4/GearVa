import { HttpStatus, Injectable } from '@nestjs/common';
import {
  ERROR_CODES,
  OWNER_NOTIFICATION_REFS,
  type OwnerNotification,
  type OwnerNotificationRef,
  type OwnerNotificationsQuery,
  type Paginated,
  type RegisterDeviceInput,
} from '@gearva/contracts';
import type { Prisma } from '@gearva/database';
import { OwnerDb } from '../common/db/owner-db';
import { PlatformDb } from '../common/db/platform-db';
import { AppException } from '../common/errors/app-exception';
import { paginated, toSkipTake } from '../common/pagination';
import { renderInApp } from '../notifications/templates/in-app';

/** A person rarely has more phones; older tokens beyond this are dropped. */
const MAX_DEVICES = 10;

/**
 * The owner app's inbox and push devices (mobile-api.md 6, flow.md 2.4). The inbox is
 * the owner's IN_APP notification rows that were delivered (SENT), read through OwnerDb
 * (owner_inbox_* policies). Devices are platform rows, like sessions.
 */
@Injectable()
export class OwnerInboxService {
  constructor(
    private readonly db: OwnerDb,
    private readonly platformDb: PlatformDb,
  ) {}

  /** The rows the inbox shows: delivered, in-app, from garages that still exist. */
  private where(ownerId: string): Prisma.NotificationWhereInput {
    return { ownerId, channel: 'IN_APP', status: 'SENT', garage: { deletedAt: null } };
  }

  /** mobile-api.md 6.1: newest first; title and body in the row's (the owner's) language. */
  async list(query: OwnerNotificationsQuery): Promise<Paginated<OwnerNotification>> {
    const where = this.where(this.db.ownerId);
    const [rows, total] = await this.db.run(
      async (tx) =>
        [
          await tx.notification.findMany({
            where,
            include: { garage: { select: { id: true, name: true } } },
            orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
            ...toSkipTake(query),
          }),
          await tx.notification.count({ where }),
        ] as const,
    );
    const items = rows.map((n): OwnerNotification => {
      let text = { title: n.garage.name, body: '' };
      try {
        text = renderInApp(n.template, n.locale === 'en' ? 'en' : 'ar', n.payload);
      } catch {
        // An old row whose template changed still shows, with the garage as its title.
      }
      const refType = OWNER_NOTIFICATION_REFS.find((r) => r === n.refType);
      return {
        id: n.id,
        type: n.type,
        ...text,
        garage: n.garage,
        ref: refType && n.refId ? { type: refType as OwnerNotificationRef, id: n.refId } : null,
        createdAt: n.createdAt.toISOString(),
        readAt: n.readAt?.toISOString() ?? null,
      };
    });
    return paginated(items, total, query);
  }

  /** mobile-api.md 6.2. Already read: nothing changes. Not the owner's: NOT_FOUND. */
  async markRead(notificationId: string): Promise<void> {
    const where = { ...this.where(this.db.ownerId), id: notificationId };
    await this.db.run(async (tx) => {
      const found = await tx.notification.findFirst({ where, select: { readAt: true } });
      if (!found) {
        throw new AppException(HttpStatus.NOT_FOUND, ERROR_CODES.NOT_FOUND, 'Not found');
      }
      if (!found.readAt) {
        await tx.notification.updateMany({ where, data: { readAt: new Date() } });
      }
    });
  }

  async markAllRead(): Promise<void> {
    const where = { ...this.where(this.db.ownerId), readAt: null };
    await this.db.run((tx) => tx.notification.updateMany({ where, data: { readAt: new Date() } }));
  }

  /**
   * mobile-api.md 6.4: after login and whenever FCM gives a new token. A token another
   * owner registered (the phone changed hands) moves to this owner.
   */
  async registerDevice(input: RegisterDeviceInput): Promise<void> {
    const ownerId = this.db.ownerId;
    const db = this.platformDb.client;
    const now = new Date();
    await db.deviceToken.upsert({
      where: { token: input.token },
      create: { ownerId, token: input.token, platform: input.platform, lastSeenAt: now },
      update: { ownerId, platform: input.platform, lastSeenAt: now },
    });
    const old = await db.deviceToken.findMany({
      where: { ownerId },
      orderBy: { lastSeenAt: 'desc' },
      skip: MAX_DEVICES,
      select: { id: true },
    });
    if (old.length > 0) {
      await db.deviceToken.deleteMany({ where: { id: { in: old.map((d) => d.id) } } });
    }
  }

  /** Before logout. Only this owner's token; an unknown one is not an error. */
  async removeDevice(token: string): Promise<void> {
    await this.platformDb.client.deviceToken.deleteMany({
      where: { token, ownerId: this.db.ownerId },
    });
  }
}
