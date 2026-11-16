import { Inject, Injectable, Logger } from '@nestjs/common';
import { PlatformDb } from '../../common/db/platform-db';
import type { NotificationChannel, SendInput, SendResult } from '../notification-channel';
import { PUSH_SENDER, type PushSender } from '../push/push-sender';
import { renderInApp } from '../templates/in-app';

/**
 * IN_APP (README 5.5, step 6.4): the row itself is the inbox entry (mobile-api.md 6.1),
 * so "sending" it means it is now visible, plus a push to each of the owner's phones
 * (6.3). The recipient is the owner id. A push that fails does not fail the inbox entry;
 * a token FCM reports dead is deleted (database.md 4.1).
 */
@Injectable()
export class InAppChannel implements NotificationChannel {
  readonly channel = 'IN_APP' as const;
  private readonly logger = new Logger(InAppChannel.name);

  constructor(
    private readonly platformDb: PlatformDb,
    @Inject(PUSH_SENDER) private readonly push: PushSender,
  ) {}

  async send(input: SendInput): Promise<SendResult> {
    let text: { title: string; body: string };
    try {
      text = renderInApp(input.template, input.locale, input.data);
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
    if (!this.push.enabled) return { ok: true };

    // Devices are the owner's own account data, like sessions: platform role.
    const devices = await this.platformDb.client.deviceToken.findMany({
      where: { ownerId: input.recipient },
      select: { id: true, token: true },
    });
    const data: Record<string, string> = {
      notificationId: input.meta?.notificationId ?? '',
      type: input.meta?.type ?? '',
      refType: input.meta?.refType ?? '',
      refId: input.meta?.refId ?? '',
    };
    for (const device of devices) {
      try {
        const outcome = await this.push.send(device.token, { ...text, data });
        if (outcome === 'DEAD') {
          await this.platformDb.client.deviceToken.deleteMany({ where: { id: device.id } });
        }
      } catch (error) {
        this.logger.warn(`Push to device ${device.id} failed: ${String(error)}`);
      }
    }
    return { ok: true };
  }
}
