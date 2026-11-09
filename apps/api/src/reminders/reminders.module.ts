import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { ReminderListService } from './reminder-list.service';
import { ReminderScanQueue } from './reminder-scan.queue';
import { ReminderSettingsService } from './reminder-settings.service';
import { RemindersController, ReminderSettingsController } from './reminders.controller';
import { RemindersService } from './reminders.service';

/** Reminders (flow.md 9): the hourly scan, the WhatsApp list and the reminder settings. */
@Module({
  imports: [NotificationsModule],
  controllers: [RemindersController, ReminderSettingsController],
  providers: [ReminderScanQueue, RemindersService, ReminderListService, ReminderSettingsService],
  exports: [RemindersService],
})
export class RemindersModule {}
