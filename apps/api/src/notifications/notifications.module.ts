import { Module } from '@nestjs/common';
import { ConsoleEmailChannel } from './adapters/console-email.channel';
import { NotificationLogService } from './notification-log.service';
import { NOTIFICATION_CHANNELS, type NotificationChannel } from './notification-channel';
import { NotificationsController } from './notifications.controller';
import { NotificationsQueue } from './notifications.queue';
import { NotificationsService } from './notifications.service';

/**
 * Channels available now: EMAIL (console adapter). IN_APP and PUSH come with the owner app
 * in Phase 6, WHATSAPP later; until then those notifications are stored as SKIPPED.
 * EMAIL_ADAPTER picks the email adapter; only `console` exists until deployment.
 */
@Module({
  controllers: [NotificationsController],
  providers: [
    ConsoleEmailChannel,
    {
      provide: NOTIFICATION_CHANNELS,
      inject: [ConsoleEmailChannel],
      useFactory: (email: ConsoleEmailChannel): NotificationChannel[] => [email],
    },
    NotificationsQueue,
    NotificationsService,
    NotificationLogService,
  ],
  exports: [NotificationsService],
})
export class NotificationsModule {}
