import { Logger, Module } from '@nestjs/common';
import { ENV, type Env } from '../config/env';
import { ConsoleEmailChannel } from './adapters/console-email.channel';
import { InAppChannel } from './adapters/in-app.channel';
import { ResendEmailChannel } from './adapters/resend-email.channel';
import { NotificationLogService } from './notification-log.service';
import { NOTIFICATION_CHANNELS, type NotificationChannel } from './notification-channel';
import { NotificationsController } from './notifications.controller';
import { NotificationsQueue } from './notifications.queue';
import { NotificationsService } from './notifications.service';
import {
  FcmPushSender,
  NoPushSender,
  PUSH_SENDER,
  type PushSender,
  serviceAccountSchema,
} from './push/push-sender';

/**
 * Channels available now: EMAIL and IN_APP (the owner app's inbox, with push through
 * Firebase, step 6.4). WHATSAPP later; until then those notifications are stored SKIPPED.
 * EMAIL_ADAPTER picks the email adapter: `console` (development, tests) or `resend`.
 * Push is on when FCM_SERVICE_ACCOUNT_JSON is set.
 */
@Module({
  controllers: [NotificationsController],
  providers: [
    {
      provide: PUSH_SENDER,
      inject: [ENV],
      useFactory: (env: Env): PushSender => {
        if (!env.FCM_SERVICE_ACCOUNT_JSON) {
          new Logger('Push').log('FCM_SERVICE_ACCOUNT_JSON is not set: no push messages');
          return new NoPushSender();
        }
        return new FcmPushSender(
          serviceAccountSchema.parse(JSON.parse(env.FCM_SERVICE_ACCOUNT_JSON)),
        );
      },
    },
    InAppChannel,
    {
      provide: NOTIFICATION_CHANNELS,
      inject: [ENV, InAppChannel],
      useFactory: (env: Env, inApp: InAppChannel): NotificationChannel[] => [
        env.EMAIL_ADAPTER === 'resend' ? new ResendEmailChannel(env) : new ConsoleEmailChannel(env),
        inApp,
      ],
    },
    NotificationsQueue,
    NotificationsService,
    NotificationLogService,
  ],
  exports: [NotificationsService, PUSH_SENDER],
})
export class NotificationsModule {}
