import { Inject, Injectable, Logger, type OnApplicationBootstrap } from '@nestjs/common';
import type {
  Notification,
  NotificationChannel as ChannelName,
  NotificationType,
  Prisma,
  TenantTx,
} from '@gearva/database';
import { ClsService } from 'nestjs-cls';
import { RequestContext } from '../common/context/request-context';
import { TenantDb } from '../common/db/tenant-db';
import {
  NOTIFICATION_CHANNELS,
  type Locale,
  type NotificationChannel,
  type SendResult,
} from './notification-channel';
import { NotificationsQueue } from './notifications.queue';

export interface NewNotification {
  garageId: string;
  channel: ChannelName;
  type: NotificationType;
  template: string;
  locale: Locale;
  /** null when the person has no address for this channel: the row is then SKIPPED */
  recipient: string | null;
  payload: Prisma.InputJsonObject;
  /** e.g. `INVITE:{userId}:{inviteNumber}`; unique per garage (database.md 4.6) */
  dedupeKey: string;
  userId?: string;
  ownerId?: string;
  refType?: string;
  refId?: string;
}

/** Anything that can write notifications: a tenant transaction or the platform client. */
type NotificationWriter = Pick<TenantTx, 'notification'>;

/**
 * Notification pipeline (flow.md 9.4), Phase 1 part:
 *   1. record()   inside the caller's transaction: a QUEUED row, deduplicated
 *   2. dispatch() after that transaction commits: a BullMQ job
 *   3. deliver()  in the worker: send through the channel adapter, store the outcome
 */
@Injectable()
export class NotificationsService implements OnApplicationBootstrap {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    private readonly queue: NotificationsQueue,
    private readonly tenantDb: TenantDb,
    private readonly cls: ClsService,
    private readonly context: RequestContext,
    @Inject(NOTIFICATION_CHANNELS) private readonly channels: NotificationChannel[],
  ) {}

  onApplicationBootstrap(): void {
    // Each job runs in its own context: a SYSTEM actor in the notification's garage.
    this.queue.startWorker((job) =>
      this.cls.run(async () => {
        this.context.setActor({
          type: 'SYSTEM',
          id: null,
          garageId: job.garageId,
          role: null,
          branchId: null,
        });
        await this.deliver(job.notificationId);
      }),
    );
  }

  /**
   * Writes the QUEUED row. With an existing dedupeKey nothing is written and the
   * existing row comes back with `created: false`, so a retried request never
   * sends twice. ON CONFLICT DO NOTHING keeps the caller's transaction usable.
   */
  async record(
    db: NotificationWriter,
    input: NewNotification,
  ): Promise<{ notification: Notification; created: boolean }> {
    const { count } = await db.notification.createMany({
      data: [{ ...input, status: 'QUEUED' }],
      skipDuplicates: true,
    });
    const notification = await db.notification.findUniqueOrThrow({
      where: { garageId_dedupeKey: { garageId: input.garageId, dedupeKey: input.dedupeKey } },
    });
    return { notification, created: count === 1 };
  }

  /** Call after the transaction that recorded the row has committed. */
  async dispatch(notification: Pick<Notification, 'id' | 'garageId' | 'status'>): Promise<void> {
    if (notification.status !== 'QUEUED') return;
    await this.queue.add({ notificationId: notification.id, garageId: notification.garageId });
  }

  /**
   * Runs in the worker, inside a SYSTEM context for the notification's garage, so the
   * read and the status update go through RLS like any other tenant query.
   */
  async deliver(notificationId: string): Promise<void> {
    const garageId = this.tenantDb.garageId;
    const notification = await this.tenantDb.run((tx) =>
      tx.notification.findFirst({ where: { id: notificationId, garageId } }),
    );
    // Missing or already handled: nothing to do (a job can run twice after a crash).
    if (!notification || notification.status !== 'QUEUED') return;

    const adapter = this.channels.find((c) => c.channel === notification.channel);
    if (!adapter)
      return this.finish(notificationId, 'SKIPPED', `No ${notification.channel} channel yet`);
    if (!notification.recipient) return this.finish(notificationId, 'SKIPPED', 'No recipient');

    let result: SendResult;
    try {
      result = await adapter.send({
        recipient: notification.recipient,
        template: notification.template,
        locale: notification.locale === 'ar' ? 'ar' : 'en',
        data: (notification.payload ?? {}) as Record<string, unknown>,
      });
    } catch (error) {
      result = { ok: false, error: error instanceof Error ? error.message : String(error) };
    }

    if (result.ok) return this.finish(notificationId, 'SENT', null);
    this.logger.warn(`Notification ${notificationId} failed: ${result.error}`);
    return this.finish(notificationId, 'FAILED', result.error);
  }

  private async finish(
    id: string,
    status: 'SENT' | 'FAILED' | 'SKIPPED',
    error: string | null,
  ): Promise<void> {
    const garageId = this.tenantDb.garageId;
    await this.tenantDb.run((tx) =>
      tx.notification.updateMany({
        where: { id, garageId, status: 'QUEUED' },
        data: { status, error, sentAt: status === 'SENT' ? new Date() : null },
      }),
    );
  }
}
