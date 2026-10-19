import { Inject, Injectable, Logger, type OnApplicationShutdown } from '@nestjs/common';
import { Queue, Worker } from 'bullmq';
import Redis from 'ioredis';
import { ENV, type Env } from '../config/env';

export interface NotificationJob {
  notificationId: string;
  garageId: string;
}

const QUEUE_NAME = 'notifications';

/**
 * BullMQ queue + worker for notifications (README section 5.6: never send inline).
 * The worker runs inside the API process for now (README section 9: a separate
 * gearva-worker service comes later). Retries and backoff are Phase 4.
 */
@Injectable()
export class NotificationsQueue implements OnApplicationShutdown {
  private readonly logger = new Logger(NotificationsQueue.name);
  // BullMQ needs maxRetriesPerRequest: null on its connection.
  private readonly connection: Redis;
  private readonly queue: Queue<NotificationJob>;
  private worker?: Worker<NotificationJob>;

  constructor(@Inject(ENV) env: Env) {
    this.connection = new Redis(env.REDIS_URL, { maxRetriesPerRequest: null });
    this.queue = new Queue<NotificationJob>(QUEUE_NAME, { connection: this.connection });
  }

  async add(job: NotificationJob): Promise<void> {
    // jobId = notification id: adding the same notification twice is a no-op.
    await this.queue.add('deliver', job, {
      jobId: job.notificationId,
      removeOnComplete: true,
      removeOnFail: 1000,
    });
  }

  startWorker(handler: (job: NotificationJob) => Promise<void>): void {
    if (this.worker) return;
    this.worker = new Worker<NotificationJob>(QUEUE_NAME, (job) => handler(job.data), {
      connection: this.connection,
      concurrency: 5,
    });
    this.worker.on('failed', (job, error) =>
      this.logger.error(`Notification job ${job?.id} crashed: ${error.message}`),
    );
  }

  async onApplicationShutdown(): Promise<void> {
    await this.worker?.close();
    await this.queue.close();
    await this.connection.quit();
  }
}
