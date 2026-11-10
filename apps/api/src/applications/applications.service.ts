import { Injectable, Logger } from '@nestjs/common';
import type { PublicPricing, applySchema } from '@gearva/contracts';
import type { z } from 'zod';
import { RequestContext } from '../common/context/request-context';
import { PlatformDb } from '../common/db/platform-db';
import { SystemSettingsService } from '../system-settings/system-settings.service';

/**
 * The public website's side of flow.md 11.6: the prices it shows and the Apply form.
 * Visitors have no account, so this writes with the platform role and touches no
 * garage's data.
 */
@Injectable()
export class ApplicationsService {
  private readonly logger = new Logger(ApplicationsService.name);

  constructor(
    private readonly platformDb: PlatformDb,
    private readonly context: RequestContext,
    private readonly systemSettings: SystemSettingsService,
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
    await this.platformDb.client.garageApplication.create({
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
  }
}
