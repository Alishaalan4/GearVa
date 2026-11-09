import { Module } from '@nestjs/common';
import { HOUR_MS, ScheduledJob } from '../common/jobs/scheduled-job';
import { ENV, type Env } from '../config/env';
import { GARAGE_EXPIRY_JOB, GarageExpiryService } from './garage-expiry.service';

/** Subscription jobs (flow.md 2.5, 11.1). The admin endpoints live in admin/ (README 5.2). */
@Module({
  providers: [
    {
      provide: GARAGE_EXPIRY_JOB,
      inject: [ENV],
      useFactory: (env: Env) => new ScheduledJob('garage-expiry', HOUR_MS, env),
    },
    GarageExpiryService,
  ],
  exports: [GarageExpiryService],
})
export class SubscriptionsModule {}
