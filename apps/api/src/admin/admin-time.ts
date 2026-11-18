import type { Prisma } from '@gearva/database';

/** Days on the admin pages are Gearva's own days (Lebanon). */
export const ADMIN_TIME_ZONE = 'Asia/Beirut';

/** The instant a day starts in a time zone ("2026-11-16" → 2026-11-15T22:00Z in Beirut). */
export function zonedDayStart(day: string, timeZone: string): Date {
  const utcMidnight = new Date(`${day}T00:00:00Z`);
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })
      .formatToParts(utcMidnight)
      .map((p) => [p.type, p.value]),
  );
  const shown = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
    Number(parts.second),
  );
  return new Date(utcMidnight.getTime() - (shown - utcMidnight.getTime()));
}

/** "2026-11-16" → "2026-11-17". */
export function nextDay(day: string): string {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

/** From the start of `from` to the end of `to` (both Beirut days, both included). */
export function adminDayRange(from?: string, to?: string): Prisma.DateTimeFilter | undefined {
  if (!from && !to) return undefined;
  return {
    ...(from ? { gte: zonedDayStart(from, ADMIN_TIME_ZONE) } : {}),
    ...(to ? { lt: zonedDayStart(nextDay(to), ADMIN_TIME_ZONE) } : {}),
  };
}
