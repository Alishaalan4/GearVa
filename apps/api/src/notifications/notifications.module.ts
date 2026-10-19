import { Module } from '@nestjs/common';
import { ConsoleEmailChannel } from './adapters/console-email.channel';
import { NOTIFICATION_CHANNELS, type NotificationChannel } from './notification-channel';
import { NotificationsQueue } from './notifications.queue';
import { NotificationsService } from './notifications.service';

/**
 * Channels available now: EMAIL (console adapter). IN_APP comes in Phase 4, PUSH in
 * Phase 6, WHATSAPP later; until then those notifications are stored as SKIPPED.
 * EMAIL_ADAPTER picks the email adapter; only `console` exists until deployment.
 */
@Module({
  providers: [
    ConsoleEmailChannel,
    {
      provide: NOTIFICATION_CHANNELS,
      inject: [ConsoleEmailChannel],
      useFactory: (email: ConsoleEmailChannel): NotificationChannel[] => [email],
    },
    NotificationsQueue,
    NotificationsService,
  ],
  exports: [NotificationsService],
})
export class NotificationsModule {}
