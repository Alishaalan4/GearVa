import { Injectable } from '@nestjs/common';
import type { NotificationLogItem, NotificationLogQuery, Paginated } from '@gearva/contracts';
import type { Prisma } from '@gearva/database';
import { TenantDb } from '../common/db/tenant-db';
import { paginated, toSkipTake } from '../common/pagination';

/**
 * The notification log (flow.md 9.4): what was sent, on which channel, to whom, and the
 * outcome. Never `payload`: an invite's payload holds a sign-in link (database.md 4.6).
 */
@Injectable()
export class NotificationLogService {
  constructor(private readonly db: TenantDb) {}

  async list(query: NotificationLogQuery): Promise<Paginated<NotificationLogItem>> {
    const garageId = this.db.garageId;
    const where: Prisma.NotificationWhereInput = {
      garageId,
      status: query.status,
      channel: query.channel,
    };
    const { rows, total, customers } = await this.db.run(async (tx) => {
      const rows = await tx.notification.findMany({
        where,
        select: {
          id: true,
          createdAt: true,
          scheduledFor: true,
          sentAt: true,
          type: true,
          channel: true,
          status: true,
          recipient: true,
          error: true,
          ownerId: true,
          user: { select: { id: true, name: true } },
        },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        ...toSkipTake(query),
      });
      const total = await tx.notification.count({ where });
      // A customer is named as this garage knows them, not by the global owner row.
      const ownerIds = [...new Set(rows.flatMap((r) => (r.ownerId ? [r.ownerId] : [])))];
      const customers = await tx.garageCustomer.findMany({
        where: { garageId, ownerId: { in: ownerIds } },
        select: { id: true, name: true, ownerId: true },
      });
      return { rows, total, customers };
    });
    const byOwner = new Map(customers.map((c) => [c.ownerId, c]));
    const items = rows.map((r): NotificationLogItem => {
      const customer = r.ownerId ? byOwner.get(r.ownerId) : undefined;
      return {
        id: r.id,
        createdAt: r.createdAt.toISOString(),
        scheduledFor: r.scheduledFor?.toISOString() ?? null,
        sentAt: r.sentAt?.toISOString() ?? null,
        type: r.type,
        channel: r.channel,
        status: r.status,
        recipient: r.recipient,
        error: r.error,
        to: customer
          ? { kind: 'customer', id: customer.id, name: customer.name }
          : r.user
            ? { kind: 'staff', id: r.user.id, name: r.user.name }
            : null,
      };
    });
    return paginated(items, total, query);
  }
}
