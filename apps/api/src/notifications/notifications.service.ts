import { Inject, Injectable, Logger, type OnApplicationBootstrap } from '@nestjs/common';
import { REMINDER_MAX_PER_GARAGE_PER_MONTH, nextDaytimeStart } from '@gearva/contracts';
import {
  Prisma,
  type Notification,
  type NotificationChannel as ChannelName,
  type NotificationType,
  type TenantTx,
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
import { type Delivery, NotificationsQueue } from './notifications.queue';

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

/** Reminder types follow the daytime rule and the fair-use cap (flow.md 9.3). */
const REMINDER_TYPES: readonly NotificationType[] = [
  'SERVICE_REMINDER',
  'MONTHLY_REMINDER',
  'WARRANTY_END',
];

/**
 * Runs in the transaction that marks a notification SENT, for rows with this `refType`:
 * e.g. a sent reminder email counts the reminder's round (flow.md 9.1).
 */
export type SentHandler = (tx: TenantTx, notification: Notification) => Promise<void>;

/** A row still QUEUED this long after it was written lost its job (flow.md 9.4). */
const STUCK_AFTER_MS = 10 * 60_000;

/**
 * Notification pipeline (flow.md 9.4):
 *   1. record()   inside the caller's transaction: a QUEUED row, deduplicated
 *   2. dispatch() after that transaction commits: a BullMQ job
 *   3. deliver()  in the worker: send through the channel adapter, retry a passing
 *                 failure, store the outcome
 */
@Injectable()
export class NotificationsService implements OnApplicationBootstrap {
  private readonly logger = new Logger(NotificationsService.name);
  private readonly sentHandlers = new Map<string, SentHandler>();

  constructor(
    private readonly queue: NotificationsQueue,
    private readonly tenantDb: TenantDb,
    private readonly cls: ClsService,
    private readonly context: RequestContext,
    @Inject(NOTIFICATION_CHANNELS) private readonly channels: NotificationChannel[],
  ) {}

  onApplicationBootstrap(): void {
    // Each job runs in its own context: a SYSTEM actor in the notification's garage.
    this.queue.startWorker((job, delivery) =>
      this.cls.run(async () => {
        this.context.setActor({
          type: 'SYSTEM',
          id: null,
          garageId: job.garageId,
          role: null,
          branchId: null,
        });
        await this.deliver(job.notificationId, delivery);
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

  /** Registers what happens when a notification with this `refType` is SENT. */
  onSent(refType: string, handler: SentHandler): void {
    this.sentHandlers.set(refType, handler);
  }

  /** Call after the transaction that recorded the row has committed. */
  async dispatch(notification: Pick<Notification, 'id' | 'garageId' | 'status'>): Promise<void> {
    if (notification.status !== 'QUEUED') return;
    await this.queue.add({ notificationId: notification.id, garageId: notification.garageId });
  }

  /**
   * flow.md 9.4: rows of this garage still QUEUED long after they were written (Redis
   * was down when they were queued) are queued again. A row whose job is still waiting,
   * delayed or retrying keeps that job: the job id is the notification id.
   */
  async requeueStuck(): Promise<number> {
    const garageId = this.tenantDb.garageId;
    const stuck = await this.tenantDb.run((tx) =>
      tx.notification.findMany({
        where: {
          garageId,
          status: 'QUEUED',
          createdAt: { lt: new Date(Date.now() - STUCK_AFTER_MS) },
        },
        select: { id: true, garageId: true, status: true },
        orderBy: { createdAt: 'asc' },
        take: 500,
      }),
    );
    for (const notification of stuck) await this.dispatch(notification);
    return stuck.length;
  }

  /**
   * Runs in the worker, inside a SYSTEM context for the notification's garage, so the
   * read and the status update go through RLS like any other tenant query.
   */
  async deliver(notificationId: string, delivery: Delivery): Promise<void> {
    const garageId = this.tenantDb.garageId;
    const found = await this.tenantDb.run(async (tx) => {
      const notification = await tx.notification.findFirst({
        where: { id: notificationId, garageId },
      });
      const garage = await tx.garage.findFirst({
        where: { id: garageId },
        select: { timezone: true },
      });
      return notification && garage ? { notification, timeZone: garage.timezone } : null;
    });
    // Missing or already handled: nothing to do (a job can run twice after a crash).
    if (!found || found.notification.status !== 'QUEUED') return;
    const { notification, timeZone } = found;

    const adapter = this.channels.find((c) => c.channel === notification.channel);
    if (!adapter)
      return this.finish(notificationId, 'SKIPPED', `No ${notification.channel} channel yet`);
    if (!notification.recipient) return this.finish(notificationId, 'SKIPPED', 'No recipient');

    if (REMINDER_TYPES.includes(notification.type)) {
      // flow.md 9.3: never at night. A retry or a late job waits for the next morning.
      const opensAt = nextDaytimeStart(new Date(), timeZone);
      if (opensAt) {
        await this.tenantDb.run((tx) =>
          tx.notification.updateMany({
            where: { id: notificationId, garageId, status: 'QUEUED' },
            data: { scheduledFor: opensAt },
          }),
        );
        return delivery.postpone(opensAt);
      }
      if (await this.overMonthlyCap(timeZone)) {
        return this.finish(notificationId, 'SKIPPED', 'Monthly reminder limit reached');
      }
    }

    let result: SendResult;
    try {
      result = await adapter.send({
        recipient: notification.recipient,
        template: notification.template,
        locale: notification.locale === 'ar' ? 'ar' : 'en',
        data: (notification.payload ?? {}) as Record<string, unknown>,
      });
    } catch (error) {
      result = {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
        retryable: true,
      };
    }

    if (result.ok) return this.finish(notificationId, 'SENT', null, notification);
    const { error } = result;
    if (result.retryable && !delivery.lastAttempt) {
      // Still QUEUED: the log shows the last error while the job waits to retry.
      await this.tenantDb.run((tx) =>
        tx.notification.updateMany({
          where: { id: notificationId, garageId, status: 'QUEUED' },
          data: { error },
        }),
      );
      throw new Error(`Notification ${notificationId} will be retried: ${error}`);
    }
    this.logger.warn(`Notification ${notificationId} failed: ${error}`);
    return this.finish(notificationId, 'FAILED', error);
  }

  /**
   * flow.md 9.3: automatic reminder emails sent this calendar month, in the garage's time
   * zone, against the cap. Messages staff send themselves on WhatsApp do not count. Jobs
   * running at the same moment may pass it by a few; it is a fair-use limit.
   */
  private async overMonthlyCap(timeZone: string): Promise<boolean> {
    const garageId = this.tenantDb.garageId;
    const [row] = await this.tenantDb.run(
      (tx) => tx.$queryRaw<{ sent: bigint }[]>`
        SELECT count(*) AS sent FROM "notifications"
        WHERE "garage_id" = ${garageId}::uuid
          AND "channel" = 'EMAIL' AND "status" = 'SENT'
          AND "type"::text IN (${Prisma.join(REMINDER_TYPES)})
          AND "sent_at" >= date_trunc('month', now() AT TIME ZONE ${timeZone}) AT TIME ZONE ${timeZone}`,
    );
    return Number(row?.sent ?? 0) >= REMINDER_MAX_PER_GARAGE_PER_MONTH;
  }

  private async finish(
    id: string,
    status: 'SENT' | 'FAILED' | 'SKIPPED',
    error: string | null,
    notification?: Notification,
  ): Promise<void> {
    const garageId = this.tenantDb.garageId;
    const handler = notification?.refType ? this.sentHandlers.get(notification.refType) : null;
    await this.tenantDb.run(async (tx) => {
      const { count } = await tx.notification.updateMany({
        where: { id, garageId, status: 'QUEUED' },
        data: { status, error, sentAt: status === 'SENT' ? new Date() : null },
      });
      if (count === 1 && status === 'SENT' && handler && notification) {
        await handler(tx, notification);
      }
    });
  }
}
