// Reminder rules (flow.md 9.1, 9.3). The values are constants until system_settings
// exists (Phase 5), like the default daily km (README 7).

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
