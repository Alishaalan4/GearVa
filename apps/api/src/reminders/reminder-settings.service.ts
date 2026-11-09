import { Injectable } from '@nestjs/common';
import type { ReminderSettings, UpdateReminderSettingsInput } from '@gearva/contracts';
import type { GarageSettings } from '@gearva/database';
import { TenantDb } from '../common/db/tenant-db';

function toSettings(settings: GarageSettings): ReminderSettings {
  return {
    reminderLeadKm: settings.reminderLeadKm,
    reminderLeadDays: settings.reminderLeadDays,
    monthlyReminderEnabled: settings.monthlyReminderEnabled,
  };
}

/** The garage's reminder settings (database.md 4.2, flow.md 9.1, 9.2). */
@Injectable()
export class ReminderSettingsService {
  constructor(private readonly db: TenantDb) {}

  async get(): Promise<ReminderSettings> {
    const garageId = this.db.garageId;
    return toSettings(
      await this.db.run((tx) => tx.garageSettings.findUniqueOrThrow({ where: { garageId } })),
    );
  }

  async update(input: UpdateReminderSettingsInput): Promise<ReminderSettings> {
    const garageId = this.db.garageId;
    return toSettings(
      await this.db.run((tx) => tx.garageSettings.update({ where: { garageId }, data: input })),
    );
  }
}
