import { Inject, Injectable, Logger, type OnApplicationBootstrap } from '@nestjs/common';
import { PlatformDb } from '../common/db/platform-db';
import type { ScheduledJob } from '../common/jobs/scheduled-job';
import { ENV, type Env } from '../config/env';

/** The hourly garage expiry pass (flow.md 2.5). */
export const GARAGE_EXPIRY_JOB = Symbol('GARAGE_EXPIRY_JOB');

/**
 * flow.md 2.5, 11.1: marks EXPIRED the garages whose paid period or unpaid trial has
 * ended, so admin lists show the truth. Access does not wait for it: the lock guard checks
 * the dates on every request. A suspended garage keeps its status.
 */
@Injectable()
export class GarageExpiryService implements OnApplicationBootstrap {
  private readonly logger = new Logger(GarageExpiryService.name);

  constructor(
    private readonly platformDb: PlatformDb,
    @Inject(GARAGE_EXPIRY_JOB) private readonly job: ScheduledJob,
    @Inject(ENV) private readonly env: Env,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    // Off in tests, which run it themselves.
    if (this.env.SCHEDULED_JOBS === 'on') {
      await this.job.start(async () => {
        await this.markExpired();
      });
    }
  }

  /**
   * Returns how many garages it marked. Running it again changes nothing. `garageIds`
   * limits it to some garages: tests run in parallel and must not touch each other's.
   */
  async markExpired(now = new Date(), garageIds?: string[]): Promise<number> {
    const { count } = await this.platformDb.client.garage.updateMany({
      where: {
        deletedAt: null,
        ...(garageIds ? { id: { in: garageIds } } : {}),
        OR: [
          { status: 'ACTIVE', expiresAt: { lt: now } },
          { status: 'TRIAL', isPaid: false, trialEndsAt: { lt: now } },
        ],
      },
      data: { status: 'EXPIRED' },
    });
    if (count > 0) this.logger.log(`Marked ${count} garage(s) EXPIRED`);
    return count;
  }
}
