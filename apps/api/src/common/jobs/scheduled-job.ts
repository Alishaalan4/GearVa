import { Logger, type OnApplicationShutdown } from '@nestjs/common';
import { Queue, Worker } from 'bullmq';
import Redis from 'ioredis';
import type { Env } from '../../config/env';

/**
 * A job that runs on a fixed interval, as a BullMQ job scheduler: the reminder scan
 * (flow.md 9.1) and the garage expiry pass (flow.md 2.5). Every API process upserts the
 * same scheduler, so the job runs once per interval however many processes run, and the
 * worker takes one run at a time. The first run is right after start.
 */
export class ScheduledJob implements OnApplicationShutdown {
  private readonly logger: Logger;
  private readonly connection: Redis;
  private readonly queue: Queue;
  private readonly prefix: string;
  private worker?: Worker;

  constructor(
    private readonly name: string,
    private readonly everyMs: number,
    env: Env,
  ) {
    this.logger = new Logger(`ScheduledJob:${name}`);
    this.connection = new Redis(env.REDIS_URL, { maxRetriesPerRequest: null });
    this.prefix = env.QUEUE_PREFIX;
    this.queue = new Queue(name, { connection: this.connection, prefix: this.prefix });
  }

  async start(handler: () => Promise<void>): Promise<void> {
    if (this.worker) return;
    await this.queue.upsertJobScheduler('every', { every: this.everyMs }, { name: this.name });
    this.worker = new Worker(this.name, () => handler(), {
      connection: this.connection,
      prefix: this.prefix,
      concurrency: 1,
    });
    this.worker.on('failed', (job, error) =>
      this.logger.error(`Run ${job?.id} failed: ${error.message}`),
    );
  }

  async onApplicationShutdown(): Promise<void> {
    await this.worker?.close();
    await this.queue.close();
    await this.connection.quit();
  }
}

export const HOUR_MS = 60 * 60_000;
