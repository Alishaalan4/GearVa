import { z } from 'zod';
import { TRIAL_DAYS } from './garages';
import { DEFAULT_DAILY_KM } from './odometer';
import {
  REMINDER_DAYTIME_END_HOUR,
  REMINDER_DAYTIME_START_HOUR,
  REMINDER_FOLLOW_UP_DAYS,
  REMINDER_FOLLOW_UPS,
  REMINDER_MAX_PER_GARAGE_PER_MONTH,
} from './reminders';

// Platform-wide settings the admin edits (flow.md 11.4, database.md 4.1 `system_settings`).
// The defaults are the constants used until Phase 5; a row exists only once an admin
// changed a value.

const fields = {
  /** free trial length of a new garage, days */
  trialDays: z.number().int().min(1).max(365),
  /** subscription price per year, and per extra branch (flow.md 11.1), in cents */
  yearPriceCents: z.number().int().min(0).max(100_000_000),
  extraBranchPriceCents: z.number().int().min(0).max(100_000_000),
  /** reminders go out from this hour until (not including) that one, garage time (9.3) */
  reminderDaytimeStartHour: z.number().int().min(0).max(23),
  reminderDaytimeEndHour: z.number().int().min(1).max(24),
  /** follow-ups of a service reminder, and the days between them (9.1) */
  reminderFollowUps: z.number().int().min(0).max(5),
  reminderFollowUpDays: z.number().int().min(1).max(365),
  /** automatic reminder emails per garage per month (9.3) */
  reminderMaxPerGaragePerMonth: z.number().int().min(0).max(1_000_000),
  /** km per day for a car with no history, when its garage set none (5.2) */
  defaultDailyKm: z.number().int().min(1).max(1000),
};

const daytimeInOrder = (s: {
  reminderDaytimeStartHour?: number;
  reminderDaytimeEndHour?: number;
}) =>
  s.reminderDaytimeStartHour === undefined ||
  s.reminderDaytimeEndHour === undefined ||
  s.reminderDaytimeStartHour < s.reminderDaytimeEndHour;
const daytimeMessage = {
  message: 'The daytime window must start before it ends',
  path: ['reminderDaytimeEndHour'],
};

export const systemSettingsSchema = z.object(fields).refine(daytimeInOrder, daytimeMessage);
export type SystemSettings = z.infer<typeof systemSettingsSchema>;

/** PATCH /admin/v1/settings: any of the settings (super admin only). */
export const updateSystemSettingsSchema = z
  .object(fields)
  .partial()
  .refine(daytimeInOrder, daytimeMessage);
export type UpdateSystemSettingsInput = z.infer<typeof updateSystemSettingsSchema>;

export const SYSTEM_SETTING_DEFAULTS: SystemSettings = {
  trialDays: TRIAL_DAYS,
  yearPriceCents: 20_000,
  extraBranchPriceCents: 10_000,
  reminderDaytimeStartHour: REMINDER_DAYTIME_START_HOUR,
  reminderDaytimeEndHour: REMINDER_DAYTIME_END_HOUR,
  reminderFollowUps: REMINDER_FOLLOW_UPS,
  reminderFollowUpDays: REMINDER_FOLLOW_UP_DAYS,
  reminderMaxPerGaragePerMonth: REMINDER_MAX_PER_GARAGE_PER_MONTH,
  defaultDailyKm: DEFAULT_DAILY_KM,
};

/** The `system_settings.key` of each setting (database.md 4.1). */
export const SYSTEM_SETTING_KEYS: Record<keyof SystemSettings, string> = {
  trialDays: 'trial.days',
  yearPriceCents: 'subscription.yearPriceCents',
  extraBranchPriceCents: 'subscription.extraBranchPriceCents',
  reminderDaytimeStartHour: 'reminder.daytimeStartHour',
  reminderDaytimeEndHour: 'reminder.daytimeEndHour',
  reminderFollowUps: 'reminder.followUps',
  reminderFollowUpDays: 'reminder.followUpDays',
  reminderMaxPerGaragePerMonth: 'reminder.maxPerGaragePerMonth',
  defaultDailyKm: 'usage.defaultDailyKm',
};

/**
 * The settings from stored rows: each key's value when it is valid, else its default.
 * A bad stored value never stops the app.
 */
export function readSystemSettings(rows: { key: string; value: unknown }[]): SystemSettings {
  const byKey = new Map(rows.map((r) => [r.key, r.value]));
  const settings = { ...SYSTEM_SETTING_DEFAULTS };
  for (const name of Object.keys(fields) as (keyof SystemSettings)[]) {
    const parsed = fields[name].safeParse(byKey.get(SYSTEM_SETTING_KEYS[name]));
    if (parsed.success) settings[name] = parsed.data;
  }
  return systemSettingsSchema.safeParse(settings).success ? settings : SYSTEM_SETTING_DEFAULTS;
}

// ---------------------------------------------------------------------------
// Default service types (flow.md 11.4): the global rows every garage starts from.
// ---------------------------------------------------------------------------

const interval = z.number().int().min(1).max(1_000_000).nullable();
const serviceTypeFields = {
  nameEn: z.string().trim().min(2).max(80),
  nameAr: z.string().trim().min(2).max(80),
  defaultIntervalKm: interval,
  defaultIntervalMi: interval,
  defaultIntervalMonths: z.number().int().min(1).max(120).nullable(),
  sortOrder: z.number().int().min(0).max(10_000),
  /** false: not offered to garages (prepared, or retired) */
  isActive: z.boolean(),
};

/** POST /admin/v1/service-types: a new default type. Its code never changes. */
export const createGlobalServiceTypeSchema = z.object({
  ...serviceTypeFields,
  code: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z][A-Z0-9_]{1,39}$/, 'Letters, digits and _, starting with a letter'),
  sortOrder: serviceTypeFields.sortOrder.default(0),
  isActive: serviceTypeFields.isActive.default(true),
});
export type CreateGlobalServiceTypeInput = z.infer<typeof createGlobalServiceTypeSchema>;

/**
 * PATCH /admin/v1/service-types/:id: names, intervals, order, or hide it from garages.
 * No defaults here, so a field left out is left unchanged.
 */
export const updateGlobalServiceTypeSchema = z.object(serviceTypeFields).partial();
export type UpdateGlobalServiceTypeInput = z.infer<typeof updateGlobalServiceTypeSchema>;

export interface GlobalServiceTypeItem {
  id: string;
  code: string;
  nameEn: string;
  nameAr: string;
  defaultIntervalKm: number | null;
  defaultIntervalMi: number | null;
  defaultIntervalMonths: number | null;
  /** which `details` shape applies; set by the seed for the built-in types */
  detailKey: string | null;
  sortOrder: number;
  isActive: boolean;
  /** garages that have their own override of this type */
  overrideCount: number;
}
