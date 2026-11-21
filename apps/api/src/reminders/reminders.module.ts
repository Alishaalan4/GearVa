import { Module } from '@nestjs/common';
import { HOUR_MS, ScheduledJob } from '../common/jobs/scheduled-job';
import { ENV, type Env } from '../config/env';
import { NotificationsModule } from '../notifications/notifications.module';
import { ReminderListService } from './reminder-list.service';
import { RemindersController } from './reminders.controller';
import { REMINDER_SCAN_JOB, RemindersService } from './reminders.service';

/**
 * Reminders (flow.md 9): the hourly scan and the WhatsApp list. The garage's reminder
 * settings are set by Gearva since step 7.4 (admin/garages/admin-reminder-settings.*).
 */
@Module({
  imports: [NotificationsModule],
  controllers: [RemindersController],
  providers: [
    {
      provide: REMINDER_SCAN_JOB,
      inject: [ENV],
      useFactory: (env: Env) => new ScheduledJob('reminder-scan', HOUR_MS, env),
    },
    RemindersService,
    ReminderListService,
  ],
  exports: [RemindersService],
})
export class RemindersModule {}
