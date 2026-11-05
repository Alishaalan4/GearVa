import { Inject, Injectable, Logger, type OnApplicationShutdown } from '@nestjs/common';
import { DelayedError, Queue, Worker } from 'bullmq';
import Redis from 'ioredis';
import { ENV, type Env } from '../config/env';

export interface NotificationJob {
  notificationId: string;
  garageId: string;
}

/** What the worker tells the handler about the current run of a job. */
export interface Delivery {
  /** true on the last attempt: a failure is then final */
  lastAttempt: boolean;
  /** Runs the job again at `at`; this run ends here and does not count as an attempt. */
  postpone(at: Date): Promise<never>;
}

const QUEUE_NAME = 'notifications';
/** flow.md 9.4: 3 attempts in all, with exponential backoff between them. */
const ATTEMPTS = 3;

/**
 * BullMQ queue + worker for notifications (README section 5.6: never send inline).
 * The worker runs inside the API process for now (README section 9: a separate
 * gearva-worker service comes later).
 */
@Injectable()
export class NotificationsQueue implements OnApplicationShutdown {
  private readonly logger = new Logger(NotificationsQueue.name);
  // BullMQ needs maxRetriesPerRequest: null on its connection.
  private readonly connection: Redis;
  private readonly queue: Queue<NotificationJob>;
  private worker?: Worker<NotificationJob>;
  private readonly retryDelayMs: number;
  private readonly prefix: string;

  constructor(@Inject(ENV) env: Env) {
    this.connection = new Redis(env.REDIS_URL, { maxRetriesPerRequest: null });
    this.prefix = env.QUEUE_PREFIX;
    this.queue = new Queue<NotificationJob>(QUEUE_NAME, {
      connection: this.connection,
      prefix: this.prefix,
    });
    this.retryDelayMs = env.NOTIFICATION_RETRY_DELAY_MS;
  }

  async add(job: NotificationJob): Promise<void> {
    // jobId = notification id: adding a notification that is waiting, delayed or
    // running is a no-op. A job that crashed on its last attempt is kept as failed and
    // would block the id, so it is removed first (its row is still QUEUED).
    const existing = await this.queue.getJob(job.notificationId);
    if (existing && (await existing.isFailed())) await existing.remove();
    await this.queue.add('deliver', job, {
      jobId: job.notificationId,
      attempts: ATTEMPTS,
      backoff: { type: 'exponential', delay: this.retryDelayMs },
      removeOnComplete: true,
      removeOnFail: 1000,
    });
  }

  startWorker(handler: (job: NotificationJob, delivery: Delivery) => Promise<void>): void {
    if (this.worker) return;
    this.worker = new Worker<NotificationJob>(
      QUEUE_NAME,
      (job, token) =>
        handler(job.data, {
          lastAttempt: job.attemptsMade + 1 >= (job.opts.attempts ?? 1),
          postpone: async (at) => {
            await job.moveToDelayed(at.getTime(), token);
            throw new DelayedError();
          },
        }),
      { connection: this.connection, prefix: this.prefix, concurrency: 5 },
    );
    this.worker.on('failed', (job, error) =>
      this.logger.warn(`Notification job ${job?.id} failed: ${error.message}`),
    );
  }

  async onApplicationShutdown(): Promise<void> {
    await this.worker?.close();
    await this.queue.close();
    await this.connection.quit();
  }
}
