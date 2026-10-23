import { Inject, Injectable, Logger } from '@nestjs/common';
import type { Notification, Prisma } from '@gearva/database';
import { ENV, type Env } from '../config/env';
import { NotificationsService } from '../notifications/notifications.service';
import { RESET_LINK_HOURS, newAccessLink } from './access-links';

export interface LinkUser {
  id: string;
  garageId: string;
  name: string;
  email: string;
  locale: string;
}

/**
 * Issues a one-time set-password link for a garage user (flow.md 2.1): stores the
 * token's hash and expiry on the user and records the email, inside the caller's
 * transaction (platform for admins, tenant for owners). The caller dispatches the
 * returned notification after commit. A new link replaces the previous one.
 */
@Injectable()
export class UserAccessLinksService {
  private readonly logger = new Logger(UserAccessLinksService.name);

  constructor(
    @Inject(ENV) private readonly env: Env,
    private readonly notifications: NotificationsService,
  ) {}

  async issue(
    tx: Prisma.TransactionClient,
    user: LinkUser,
    garageName: string,
    kind: 'invite' | 'reset',
  ): Promise<Notification> {
    const link = newAccessLink(this.env.APP_URL_GARAGE, kind);
    await tx.user.update({
      where: { id: user.id },
      data: { inviteTokenHash: link.tokenHash, inviteExpiresAt: link.expiresAt },
    });
    const issuedAt = Date.now();
    const { notification } = await this.notifications.record(tx, {
      garageId: user.garageId,
      userId: user.id,
      channel: 'EMAIL',
      type: 'INVITE',
      template: kind === 'invite' ? 'staff-invite' : 'password-reset',
      locale: user.locale === 'ar' ? 'ar' : 'en',
      recipient: user.email,
      payload:
        kind === 'invite'
          ? { name: user.name, garageName, link: link.url }
          : { name: user.name, link: link.url, hours: RESET_LINK_HOURS },
      // One row per issued link: a resend is a new intent, a retried request is not.
      dedupeKey: `${kind === 'invite' ? 'INVITE' : 'PASSWORD_RESET'}:${user.id}:${issuedAt}`,
      refType: 'user',
      refId: user.id,
    });
    return notification;
  }

  /**
   * Queues the email after commit. The user and link are already saved, so a Redis
   * failure here must not turn the request into an error (the admin or owner would
   * retry and hit EMAIL_ALREADY_USED). The row stays QUEUED; a resend issues a new link,
   * and Phase 4's retry job re-queues old QUEUED rows.
   */
  async dispatch(notification: Notification): Promise<void> {
    try {
      await this.notifications.dispatch(notification);
    } catch (error) {
      this.logger.error(
        `Could not queue notification ${notification.id}; it stays QUEUED`,
        error as Error,
      );
    }
  }
}
