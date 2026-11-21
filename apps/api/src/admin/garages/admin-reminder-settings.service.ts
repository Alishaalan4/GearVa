import { HttpStatus, Injectable } from '@nestjs/common';
import {
  ERROR_CODES,
  type ReminderSettings,
  type UpdateReminderSettingsInput,
} from '@gearva/contracts';
import type { GarageSettings } from '@gearva/database';
import { RequestContext } from '../../common/context/request-context';
import { PlatformDb } from '../../common/db/platform-db';
import { AppException } from '../../common/errors/app-exception';
import { requireSuperAdmin } from '../admin-roles';

function toSettings(settings: GarageSettings): ReminderSettings {
  return {
    reminderLeadKm: settings.reminderLeadKm,
    reminderLeadDays: settings.reminderLeadDays,
    monthlyReminderEnabled: settings.monthlyReminderEnabled,
  };
}

/**
 * A garage's reminder settings (database.md 4.2, flow.md 9.1, 9.2), set by Gearva since
 * step 7.4 (user decision 2026-11-21): any admin sees them on the garage's page, super
 * admins change them. The garage app no longer shows or changes them. Through the platform
 * role, with the garage in every query.
 */
@Injectable()
export class AdminReminderSettingsService {
  constructor(
    private readonly platformDb: PlatformDb,
    private readonly context: RequestContext,
  ) {}

  async get(garageId: string): Promise<ReminderSettings> {
    return toSettings(await this.settingsOf(garageId));
  }

  async update(garageId: string, input: UpdateReminderSettingsInput): Promise<ReminderSettings> {
    requireSuperAdmin(this.context);
    await this.settingsOf(garageId);
    return toSettings(
      await this.platformDb.client.garageSettings.update({ where: { garageId }, data: input }),
    );
  }

  private async settingsOf(garageId: string): Promise<GarageSettings> {
    const settings = await this.platformDb.client.garageSettings.findFirst({
      where: { garageId, garage: { deletedAt: null } },
    });
    if (!settings) {
      throw new AppException(HttpStatus.NOT_FOUND, ERROR_CODES.NOT_FOUND, 'Garage not found');
    }
    return settings;
  }
}
