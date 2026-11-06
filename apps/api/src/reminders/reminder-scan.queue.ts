import { Inject, Injectable, Logger, type OnApplicationShutdown } from '@nestjs/common';
import { Queue, Worker } from 'bullmq';
import Redis from 'ioredis';
import { ENV, type Env } from '../config/env';

const QUEUE_NAME = 'reminder-scan';
const SCHEDULER_ID = 'hourly';
const EVERY_MS = 60 * 60_000;

/**
 * The hourly reminder scan (flow.md 9.1), a BullMQ job scheduler. Each API process
 * upserts the same scheduler, so there is one scan per hour however many run, and the
 * worker takes one scan at a time.
 */
@Injectable()
export class ReminderScanQueue implements OnApplicationShutdown {
  private readonly logger = new Logger(ReminderScanQueue.name);
  private readonly connection: Redis;
  private readonly queue: Queue;
  private readonly prefix: string;
  private worker?: Worker;

  constructor(@Inject(ENV) env: Env) {
    this.connection = new Redis(env.REDIS_URL, { maxRetriesPerRequest: null });
    this.prefix = env.QUEUE_PREFIX;
    this.queue = new Queue(QUEUE_NAME, { connection: this.connection, prefix: this.prefix });
  }

  async start(handler: () => Promise<void>): Promise<void> {
    if (this.worker) return;
    await this.queue.upsertJobScheduler(SCHEDULER_ID, { every: EVERY_MS }, { name: 'scan' });
    this.worker = new Worker(QUEUE_NAME, () => handler(), {
      connection: this.connection,
      prefix: this.prefix,
      concurrency: 1,
    });
    this.worker.on('failed', (job, error) =>
      this.logger.error(`Reminder scan ${job?.id} failed: ${error.message}`),
    );
  }

  async onApplicationShutdown(): Promise<void> {
    await this.worker?.close();
    await this.queue.close();
    await this.connection.quit();
  }
}
