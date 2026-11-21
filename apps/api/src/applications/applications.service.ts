import { Inject, Injectable, Logger } from '@nestjs/common';
import type { PublicPricing, applySchema } from '@gearva/contracts';
import type { GarageApplication } from '@gearva/database';
import type { z } from 'zod';
import { RequestContext } from '../common/context/request-context';
import { PlatformDb } from '../common/db/platform-db';
import { ENV, type Env } from '../config/env';
import {
  NOTIFICATION_CHANNELS,
  type NotificationChannel,
} from '../notifications/notification-channel';
import { SystemSettingsService } from '../system-settings/system-settings.service';

/**
 * The public website's side of flow.md 11.6: the prices it shows and the Apply form.
 * Visitors have no account, so this writes with the platform role and touches no
 * garage's data. Step 7.1: each stored application is also emailed to the address in the
 * admin's settings (`applicationAlertEmail`), if one is set.
 */
@Injectable()
export class ApplicationsService {
  private readonly logger = new Logger(ApplicationsService.name);

  constructor(
    private readonly platformDb: PlatformDb,
    private readonly context: RequestContext,
    private readonly systemSettings: SystemSettingsService,
    @Inject(ENV) private readonly env: Env,
    @Inject(NOTIFICATION_CHANNELS) private readonly channels: NotificationChannel[],
  ) {}

  async pricing(): Promise<PublicPricing> {
    const s = await this.systemSettings.get();
    return {
      yearPriceCents: s.yearPriceCents,
      extraBranchPriceCents: s.extraBranchPriceCents,
      trialDays: s.trialDays,
    };
  }

  /** Stores the application as NEW. A filled-in honeypot is answered the same, not stored. */
  async apply(input: z.output<typeof applySchema>): Promise<void> {
    const ip = this.context.ip ?? null;
    if (input.website) {
      this.logger.warn(`Application dropped: honeypot filled in (ip ${ip ?? 'unknown'})`);
      return;
    }
    const application = await this.platformDb.client.garageApplication.create({
      data: {
        garageName: input.garageName,
        ownerName: input.ownerName,
        email: input.email,
        phone: input.phone,
        city: input.city,
        branchCount: input.branchCount,
        message: input.message ?? null,
        ip,
      },
    });
    await this.alertAdmin(application);
  }

  /**
   * Step 7.1 (flow.md 11.6): one email to the admin's address. Not a notification row: those
   * belong to a garage, and an application has none yet. The application is already
   * stored and listed in the admin, so a failed email is only logged; the visitor's answer
   * never depends on it.
   */
  private async alertAdmin(application: GarageApplication): Promise<void> {
    const to = (await this.systemSettings.get()).applicationAlertEmail;
    const email = this.channels.find((c) => c.channel === 'EMAIL');
    if (!to || !email) return;
    const link = this.env.APP_URL_ADMIN
      ? new URL(`/en/applications/${application.id}`, this.env.APP_URL_ADMIN).toString()
      : null;
    try {
      const result = await email.send({
        recipient: to,
        template: 'application-alert',
        locale: 'en',
        data: {
          garageName: application.garageName,
          ownerName: application.ownerName,
          email: application.email,
          phone: application.phone,
          city: application.city,
          branchCount: application.branchCount,
          message: application.message,
          link,
        },
      });
      if (!result.ok) {
        this.logger.error(`Application ${application.id}: alert email failed: ${result.error}`);
      }
    } catch (error) {
      this.logger.error(`Application ${application.id}: alert email failed`, error as Error);
    }
  }
}
