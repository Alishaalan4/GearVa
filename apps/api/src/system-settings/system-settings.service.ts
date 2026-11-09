import { HttpStatus, Injectable } from '@nestjs/common';
import {
  ERROR_CODES,
  SYSTEM_SETTING_KEYS,
  type SystemSettings,
  type UpdateSystemSettingsInput,
  readSystemSettings,
  systemSettingsSchema,
} from '@gearva/contracts';
import { PlatformDb } from '../common/db/platform-db';
import { AppException } from '../common/errors/app-exception';

/** How long a process keeps the settings before reading them again. */
const CACHE_MS = 60_000;

/**
 * The platform-wide settings (flow.md 11.4, database.md 4.1). Read often (every reminder,
 * every estimate), changed rarely: each process keeps them for a minute, so a change
 * reaches every API process within a minute. Missing or bad rows fall back to defaults.
 */
@Injectable()
export class SystemSettingsService {
  private cached?: { settings: SystemSettings; at: number };

  constructor(private readonly platformDb: PlatformDb) {}

  async get(): Promise<SystemSettings> {
    if (this.cached && Date.now() - this.cached.at < CACHE_MS) return this.cached.settings;
    const rows = await this.platformDb.client.systemSetting.findMany();
    const settings = readSystemSettings(rows);
    this.cached = { settings, at: Date.now() };
    return settings;
  }

  /** Changes some settings; the admin module allows it to super admins only. */
  async update(input: UpdateSystemSettingsInput, adminId: string): Promise<SystemSettings> {
    this.cached = undefined;
    const merged = { ...(await this.get()), ...input };
    if (!systemSettingsSchema.safeParse(merged).success) {
      throw new AppException(
        HttpStatus.BAD_REQUEST,
        ERROR_CODES.VALIDATION_FAILED,
        'The daytime window must start before it ends',
        { field: 'reminderDaytimeEndHour' },
      );
    }
    const changed = (Object.keys(input) as (keyof SystemSettings)[]).filter(
      (name) => input[name] !== undefined,
    );
    await this.platformDb.client.$transaction(async (tx) => {
      for (const name of changed) {
        const key = SYSTEM_SETTING_KEYS[name];
        const value = merged[name];
        await tx.systemSetting.upsert({
          where: { key },
          create: { key, value, updatedById: adminId },
          update: { value, updatedById: adminId },
        });
      }
    });
    this.cached = undefined;
    return this.get();
  }
}
