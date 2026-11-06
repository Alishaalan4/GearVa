import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { ReminderScanQueue } from './reminder-scan.queue';
import { RemindersService } from './reminders.service';

/** Reminders (flow.md 9): the hourly scan now, the WhatsApp list and its API in step 4.4. */
@Module({
  imports: [NotificationsModule],
  providers: [ReminderScanQueue, RemindersService],
  exports: [RemindersService],
})
export class RemindersModule {}
