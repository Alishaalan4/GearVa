// Next-change logic (flow.md section 6). Distances in km; dates are calendar dates in the
// garage's time zone (YYYY-MM-DD), stored in date columns.
import { type DistanceUnit, milesToKm } from './distance';

/** The interval columns of a service_types row (global default or garage override). */
export interface ServiceInterval {
  defaultIntervalKm: number | null;
  defaultIntervalMi: number | null;
  defaultIntervalMonths: number | null;
}

export interface ResolvedInterval {
  /** km between services, already converted for a car on miles; null = by date only */
  intervalKm: number | null;
  /** null = no date fallback */
  intervalMonths: number | null;
}

/**
 * flow.md 6: the garage override if there is one, else the global default. A car on
 * miles uses the miles interval (garages set km and miles separately), converted to km.
 */
export function resolveInterval(
  unit: DistanceUnit,
  global: ServiceInterval | null,
  override?: ServiceInterval | null,
): ResolvedInterval {
  const source = override ?? global;
  if (!source) return { intervalKm: null, intervalMonths: null };
  const intervalKm =
    unit === 'MI'
      ? source.defaultIntervalMi === null
        ? null
        : milesToKm(source.defaultIntervalMi)
      : source.defaultIntervalKm;
  return { intervalKm, intervalMonths: source.defaultIntervalMonths };
}

/** The calendar date (YYYY-MM-DD) of an instant in a time zone. */
export function localDate(at: Date, timeZone: string): string {
  // en-CA formats as YYYY-MM-DD.
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(at);
}

/**
 * A calendar date plus whole months. The day is kept, or clamped to the month's last
 * day: 2026-01-31 + 1 month = 2026-02-28.
 */
export function addMonths(date: string, months: number): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!match) throw new Error(`Not a YYYY-MM-DD date: ${date}`);
  const [, y, m, d] = match.map(Number) as [number, number, number, number];
  const monthIndex = y * 12 + (m - 1) + months;
  const year = Math.floor(monthIndex / 12);
  const month = (monthIndex % 12) + 1;
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${year}-${pad(month)}-${pad(Math.min(d, lastDay))}`;
}

export interface NextDueInput {
  /** odometer at service time, km */
  odometerKm: number;
  performedAt: Date;
  /** the garage's time zone, e.g. Asia/Beirut */
  timeZone: string;
  intervalKm: number | null;
  intervalMonths: number | null;
}

export interface NextDue {
  nextDueKm: number | null;
  /** YYYY-MM-DD in the garage's time zone */
  nextDueDate: string | null;
}

/**
 * flow.md 6: nextDueKm = odometer + interval km; nextDueDate = service date + interval
 * months (the time fallback, so a car driven little is still reminded).
 */
export function computeNextDue(input: NextDueInput): NextDue {
  return {
    nextDueKm: input.intervalKm ? input.odometerKm + input.intervalKm : null,
    nextDueDate: input.intervalMonths
      ? addMonths(localDate(input.performedAt, input.timeZone), input.intervalMonths)
      : null,
  };
}
