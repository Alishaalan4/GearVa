import { describe, expect, it } from 'vitest';
import {
  SYSTEM_SETTING_DEFAULTS,
  SYSTEM_SETTING_KEYS,
  readSystemSettings,
  updateSystemSettingsSchema,
} from '../src/system-settings';

describe('readSystemSettings (flow.md 11.4)', () => {
  it('uses the defaults when nothing is stored', () => {
    expect(readSystemSettings([])).toEqual(SYSTEM_SETTING_DEFAULTS);
    expect(SYSTEM_SETTING_DEFAULTS).toMatchObject({
      trialDays: 30,
      yearPriceCents: 20_000,
      extraBranchPriceCents: 10_000,
      reminderDaytimeStartHour: 9,
      reminderDaytimeEndHour: 20,
      defaultDailyKm: 35,
    });
  });

  it('takes each valid stored value, and keeps the default for a bad one', () => {
    const settings = readSystemSettings([
      { key: SYSTEM_SETTING_KEYS.trialDays, value: 14 },
      { key: SYSTEM_SETTING_KEYS.defaultDailyKm, value: 'many' },
      { key: 'unknown.key', value: 1 },
    ]);
    expect(settings.trialDays).toBe(14);
    expect(settings.defaultDailyKm).toBe(35);
  });

  it('falls back to all defaults if stored values break the daytime window', () => {
    const settings = readSystemSettings([
      { key: SYSTEM_SETTING_KEYS.reminderDaytimeStartHour, value: 21 },
      { key: SYSTEM_SETTING_KEYS.reminderDaytimeEndHour, value: 8 },
    ]);
    expect(settings).toEqual(SYSTEM_SETTING_DEFAULTS);
  });
});

describe('updateSystemSettingsSchema', () => {
  it('accepts any subset, and refuses a window that ends before it starts', () => {
    expect(updateSystemSettingsSchema.safeParse({ trialDays: 14 }).success).toBe(true);
    expect(
      updateSystemSettingsSchema.safeParse({
        reminderDaytimeStartHour: 10,
        reminderDaytimeEndHour: 9,
      }).success,
    ).toBe(false);
    expect(updateSystemSettingsSchema.safeParse({ yearPriceCents: 12.5 }).success).toBe(false);
  });
});
