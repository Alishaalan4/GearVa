// Reminder rules (flow.md 9.1, 9.3). The values are constants until system_settings
// exists (Phase 5), like the default daily km (README 7).
import { z } from 'zod';
import type { DistanceUnit } from './distance';
import { paginationQuerySchema } from './pagination';

/** Reminders go out between these local hours, in the garage's time zone: 09:00 to 20:00. */
export const REMINDER_DAYTIME_START_HOUR = 9;
export const REMINDER_DAYTIME_END_HOUR = 20;

/** Automatic reminder emails per garage per month (README 7: the real cap is set in Phase 5). */
export const REMINDER_MAX_PER_GARAGE_PER_MONTH = 2000;

/** A service reminder not acted on is sent at most this many more times... */
export const REMINDER_FOLLOW_UPS = 2;
/** ...each at least this many days after the one before. */
export const REMINDER_FOLLOW_UP_DAYS = 30;

const DAY_MS = 86_400_000;

export interface ReminderState {
  kind: 'SERVICE_DUE' | 'WARRANTY_END' | 'RECOMMENDED_NEXT';
  status: 'ACTIVE' | 'SENT' | 'COMPLETED' | 'CANCELLED';
  notifyCount: number;
  lastNotifiedAt: Date | null;
  /** km */
  nextDueKm: number | null;
  /** YYYY-MM-DD */
  nextDueDate: string | null;
}

export interface DueCheck {
  /** the car's estimated km now (flow.md 5.2) */
  estimatedKm: number;
  /** the garage's date today, YYYY-MM-DD */
  today: string;
  /** garage_settings.reminderLeadKm / reminderLeadDays */
  leadKm: number;
  leadDays: number;
  now: Date;
}

/** A YYYY-MM-DD date plus whole days (negative to go back). */
function addDays(date: string, days: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);
}

/**
 * flow.md 9.1: the round to send now (`notifyCount + 1`), or null when the reminder is not
 * due. A service reminder is due by its km or its date, each with the garage's lead; it
 * gets up to 2 follow-ups, 30 days apart, while the car is not serviced. A warranty end or
 * a recommended service has only a date, and one round.
 */
export function reminderRound(reminder: ReminderState, check: DueCheck): number | null {
  if (reminder.status === 'SENT') {
    if (reminder.kind !== 'SERVICE_DUE') return null;
    if (reminder.notifyCount >= 1 + REMINDER_FOLLOW_UPS) return null;
    if (!reminder.lastNotifiedAt) return null;
    const followUpAt = reminder.lastNotifiedAt.getTime() + REMINDER_FOLLOW_UP_DAYS * DAY_MS;
    if (check.now.getTime() < followUpAt) return null;
  } else if (reminder.status !== 'ACTIVE') {
    return null;
  }
  const dueByKm =
    reminder.kind === 'SERVICE_DUE' &&
    reminder.nextDueKm !== null &&
    check.estimatedKm >= reminder.nextDueKm - check.leadKm;
  const dueByDate =
    reminder.nextDueDate !== null && check.today >= addDays(reminder.nextDueDate, -check.leadDays);
  return dueByKm || dueByDate ? reminder.notifyCount + 1 : null;
}

interface LocalParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
}

/** The wall-clock date and time of an instant in a time zone. */
function localParts(at: Date, timeZone: string): LocalParts {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
    })
      .formatToParts(at)
      .map((p) => [p.type, Number(p.value)]),
  );
  return {
    year: parts.year!,
    month: parts.month!,
    day: parts.day!,
    hour: parts.hour!,
    minute: parts.minute!,
  };
}

/** The instant at which a time zone's clock shows this wall-clock time. */
function zonedTime(year: number, month: number, day: number, hour: number, timeZone: string): Date {
  const wanted = Date.UTC(year, month - 1, day, hour);
  let guess = wanted;
  // Two corrections settle the offset, also across a daylight-saving change.
  for (let i = 0; i < 2; i++) {
    const p = localParts(new Date(guess), timeZone);
    guess += wanted - Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute);
  }
  return new Date(guess);
}

/**
 * flow.md 9.3: null while the garage's local time is inside the daytime window, else
 * the instant the next window opens (today at 09:00 before it, tomorrow after it).
 */
export function nextDaytimeStart(now: Date, timeZone: string): Date | null {
  const local = localParts(now, timeZone);
  if (local.hour >= REMINDER_DAYTIME_START_HOUR && local.hour < REMINDER_DAYTIME_END_HOUR) {
    return null;
  }
  const dayOffset = local.hour >= REMINDER_DAYTIME_END_HOUR ? 1 : 0;
  // Date.UTC rolls the day over the end of a month or year.
  const day = new Date(Date.UTC(local.year, local.month - 1, local.day + dayOffset));
  return zonedTime(
    day.getUTCFullYear(),
    day.getUTCMonth() + 1,
    day.getUTCDate(),
    REMINDER_DAYTIME_START_HOUR,
    timeZone,
  );
}

/** The instant the garage's current calendar month began (flow.md 9.2, 9.3). */
export function monthStart(now: Date, timeZone: string): Date {
  const local = localParts(now, timeZone);
  return zonedTime(local.year, local.month, 1, 0, timeZone);
}

/** The garage's month, YYYY-MM, as used in the monthly reminder's dedupe key. */
export function localMonth(now: Date, timeZone: string): string {
  const local = localParts(now, timeZone);
  return `${local.year}-${String(local.month).padStart(2, '0')}`;
}

// ---------------------------------------------------------------------------
// API: reminders due (WhatsApp list), notification log, reminder settings
// ---------------------------------------------------------------------------

/** GET /v1/reminders/due: one due reminder that email has not reached (flow.md 9.5). */
export interface DueReminderItem {
  reminderId: string;
  /** 1 = first reminder, 2 and 3 = follow-ups */
  round: number;
  kind: ReminderState['kind'];
  customer: { id: string; name: string; phone: string };
  vehicle: { id: string; plate: string; make: string; model: string; distanceUnit: DistanceUnit };
  /** the service in both languages, for the staff screen; a custom name is the same in both */
  serviceName: { en: string; ar: string };
  /** km */
  dueKm: number | null;
  /** YYYY-MM-DD */
  dueDate: string | null;
  /** the car's estimated km now, km */
  estimatedKm: number;
  lastNotifiedAt: string | null;
  /** the customer has an email, but this round's email failed or was skipped */
  emailFailed: boolean;
  /** wa.me link with the message already written, in the customer's language */
  whatsappUrl: string;
}

/** POST /v1/reminders/:reminderId/whatsapp-sent: the round shown on the list. */
export const markWhatsappSentSchema = z.object({
  round: z
    .number()
    .int()
    .min(1)
    .max(1 + REMINDER_FOLLOW_UPS),
});
export type MarkWhatsappSentInput = z.infer<typeof markWhatsappSentSchema>;

export interface MarkWhatsappSentResponse {
  /** the reminder (also the audit row's entity) */
  id: string;
  round: number;
  /** false when the round was already counted (by email, or by an earlier click) */
  counted: boolean;
}

export const NOTIFICATION_STATUSES = ['QUEUED', 'SENT', 'DELIVERED', 'FAILED', 'SKIPPED'] as const;
export type NotificationStatusName = (typeof NOTIFICATION_STATUSES)[number];
export const NOTIFICATION_CHANNELS = ['EMAIL', 'IN_APP', 'PUSH', 'WHATSAPP'] as const;
export type NotificationChannelName = (typeof NOTIFICATION_CHANNELS)[number];

/** GET /v1/notifications: the log, newest first (flow.md 9.4). */
export const notificationLogQuerySchema = paginationQuerySchema.extend({
  status: z.enum(NOTIFICATION_STATUSES).optional(),
  channel: z.enum(NOTIFICATION_CHANNELS).optional(),
});
export type NotificationLogQuery = z.infer<typeof notificationLogQuerySchema>;

/** One row of the log. Never the payload: an invite's payload holds a sign-in link. */
export interface NotificationLogItem {
  id: string;
  createdAt: string;
  /** when a delayed reminder will go out (daytime only) */
  scheduledFor: string | null;
  sentAt: string | null;
  type: string;
  channel: NotificationChannelName;
  status: NotificationStatusName;
  /** email or phone */
  recipient: string | null;
  error: string | null;
  /** who it was for: a customer of this garage, or a staff member */
  to: { kind: 'customer' | 'staff'; id: string; name: string } | null;
}

/** GET / PATCH /v1/reminder-settings (owner): database.md 4.2. */
export interface ReminderSettings {
  reminderLeadKm: number;
  reminderLeadDays: number;
  monthlyReminderEnabled: boolean;
}

export const updateReminderSettingsSchema = z.object({
  reminderLeadKm: z.number().int().min(0).max(5000).optional(),
  reminderLeadDays: z.number().int().min(0).max(60).optional(),
  monthlyReminderEnabled: z.boolean().optional(),
});
export type UpdateReminderSettingsInput = z.infer<typeof updateReminderSettingsSchema>;
