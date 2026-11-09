import { Module } from '@nestjs/common';
import { HOUR_MS, ScheduledJob } from '../common/jobs/scheduled-job';
import { ENV, type Env } from '../config/env';
import { NotificationsModule } from '../notifications/notifications.module';
import { ReminderListService } from './reminder-list.service';
import { ReminderSettingsService } from './reminder-settings.service';
import { RemindersController, ReminderSettingsController } from './reminders.controller';
import { REMINDER_SCAN_JOB, RemindersService } from './reminders.service';

/** Reminders (flow.md 9): the hourly scan, the WhatsApp list and the reminder settings. */
@Module({
  imports: [NotificationsModule],
  controllers: [RemindersController, ReminderSettingsController],
  providers: [
    {
      provide: REMINDER_SCAN_JOB,
      inject: [ENV],
      useFactory: (env: Env) => new ScheduledJob('reminder-scan', HOUR_MS, env),
    },
    RemindersService,
    ReminderListService,
    ReminderSettingsService,
  ],
  exports: [RemindersService],
})
export class RemindersModule {}
