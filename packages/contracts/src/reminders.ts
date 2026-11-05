// Reminder sending rules (flow.md 9.3). The values are constants until system_settings
// exists (Phase 5), like the default daily km (README 7).

/** Reminders go out between these local hours, in the garage's time zone: 09:00 to 20:00. */
export const REMINDER_DAYTIME_START_HOUR = 9;
export const REMINDER_DAYTIME_END_HOUR = 20;

/** Automatic reminder emails per garage per month (README 7: the real cap is set in Phase 5). */
export const REMINDER_MAX_PER_GARAGE_PER_MONTH = 2000;

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
