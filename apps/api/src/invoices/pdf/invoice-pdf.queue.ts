import { Inject, Injectable, Logger, type OnApplicationShutdown } from '@nestjs/common';
import { Queue, Worker } from 'bullmq';
import Redis from 'ioredis';
import { ENV, type Env } from '../../config/env';

export interface InvoicePdfJob {
  invoiceId: string;
  garageId: string;
}

const QUEUE_NAME = 'invoice-pdf';

/** PDFs are rendered in a BullMQ worker (flow.md 7.2), inside the API process for now. */
@Injectable()
export class InvoicePdfQueue implements OnApplicationShutdown {
  private readonly logger = new Logger(InvoicePdfQueue.name);
  private readonly connection: Redis;
  private readonly queue: Queue<InvoicePdfJob>;
  private worker?: Worker<InvoicePdfJob>;

  private readonly prefix: string;

  constructor(@Inject(ENV) env: Env) {
    this.connection = new Redis(env.REDIS_URL, { maxRetriesPerRequest: null });
    this.prefix = env.QUEUE_PREFIX;
    this.queue = new Queue<InvoicePdfJob>(QUEUE_NAME, {
      connection: this.connection,
      prefix: this.prefix,
    });
  }

  async add(job: InvoicePdfJob): Promise<void> {
    await this.queue.add('render', job, {
      attempts: 3,
      backoff: { type: 'exponential', delay: 2000 },
      removeOnComplete: true,
      removeOnFail: 1000,
    });
  }

  startWorker(handler: (job: InvoicePdfJob) => Promise<void>): void {
    if (this.worker) return;
    this.worker = new Worker<InvoicePdfJob>(QUEUE_NAME, (job) => handler(job.data), {
      connection: this.connection,
      prefix: this.prefix,
      concurrency: 2,
    });
    this.worker.on('failed', (job, error) =>
      this.logger.error(`Invoice PDF job ${job?.id} failed: ${error.message}`),
    );
  }

  async onApplicationShutdown(): Promise<void> {
    await this.worker?.close();
    await this.queue.close();
    await this.connection.quit();
  }
}
