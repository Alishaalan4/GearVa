import { Module } from '@nestjs/common';
import { ENV, type Env } from '../config/env';
import { ConsoleEmailChannel } from './adapters/console-email.channel';
import { ResendEmailChannel } from './adapters/resend-email.channel';
import { NotificationLogService } from './notification-log.service';
import { NOTIFICATION_CHANNELS, type NotificationChannel } from './notification-channel';
import { NotificationsController } from './notifications.controller';
import { NotificationsQueue } from './notifications.queue';
import { NotificationsService } from './notifications.service';

/**
 * Channels available now: EMAIL. IN_APP and PUSH come with the owner app in Phase 6,
 * WHATSAPP later; until then those notifications are stored as SKIPPED.
 * EMAIL_ADAPTER picks the email adapter: `console` (development, tests) or `resend`.
 */
@Module({
  controllers: [NotificationsController],
  providers: [
    {
      provide: NOTIFICATION_CHANNELS,
      inject: [ENV],
      useFactory: (env: Env): NotificationChannel[] => [
        env.EMAIL_ADAPTER === 'resend' ? new ResendEmailChannel(env) : new ConsoleEmailChannel(env),
      ],
    },
    NotificationsQueue,
    NotificationsService,
    NotificationLogService,
  ],
  exports: [NotificationsService],
})
export class NotificationsModule {}
