// Odometer, average daily usage and estimated km (flow.md section 5). All values in km.

/** Daily km for a car with no usable history (README 7, confirmed 2026-10-23). */
export const DEFAULT_DAILY_KM = 35;
/** Readings used for the average (flow.md 5.1). */
export const AVG_READINGS = 5;
/** The average is kept inside this range, km per day. */
export const MIN_DAILY_KM = 5;
export const MAX_DAILY_KM = 300;
/** More than this many km per day since the last reading is likely a typo (flow.md 5.3). */
export const MAX_KM_PER_DAY_JUMP = 5000;

const DAY_MS = 24 * 60 * 60 * 1000;

export interface OdometerReading {
  km: number;
  at: Date;
}

/**
 * Average km per day from the last 5 readings (flow.md 5.1), rounded to 2 decimals, or
 * null with fewer than 2 usable readings (the caller then uses the garage default, else
 * DEFAULT_DAILY_KM). A reading lower than the one before it is a confirmed odometer
 * correction (5.3): the calculation starts again from it.
 */
export function averageDailyKm(readings: readonly OdometerReading[]): number | null {
  const ordered = [...readings]
    .sort((a, b) => a.at.getTime() - b.at.getTime())
    .slice(-AVG_READINGS);

  let usable: OdometerReading[] = [];
  for (const reading of ordered) {
    const last = usable[usable.length - 1];
    usable = last && reading.km < last.km ? [reading] : [...usable, reading];
  }
  const first = usable[0];
  const last = usable[usable.length - 1];
  if (!first || !last || usable.length < 2) return null;

  const days = Math.max(1, (last.at.getTime() - first.at.getTime()) / DAY_MS);
  const perDay = (last.km - first.km) / days;
  const clamped = Math.min(MAX_DAILY_KM, Math.max(MIN_DAILY_KM, perDay));
  return Math.round(clamped * 100) / 100;
}

export interface EstimateInput {
  /** vehicles.currentKm */
  currentKm: number;
  /** vehicles.lastOdometerAt; null = no reading date, no estimate */
  lastOdometerAt: Date | null;
  /** vehicles.avgDailyKm */
  avgDailyKm: number | null;
  /** garage_settings.defaultDailyKm */
  garageDefaultDailyKm?: number | null;
  now?: Date;
}

/** The km per day used for estimates: the car's own, else the garage's, else 35. */
export function dailyKmFor(
  input: Pick<EstimateInput, 'avgDailyKm' | 'garageDefaultDailyKm'>,
): number {
  return input.avgDailyKm ?? input.garageDefaultDailyKm ?? DEFAULT_DAILY_KM;
}

/**
 * Estimated odometer today (flow.md 5.2): last reading + daily km x whole days since.
 * Used to pre-fill quick entry and by the daily reminder job.
 */
export function estimateCurrentKm(input: EstimateInput): number {
  if (!input.lastOdometerAt) return input.currentKm;
  const now = input.now ?? new Date();
  const days = Math.max(0, Math.floor((now.getTime() - input.lastOdometerAt.getTime()) / DAY_MS));
  return input.currentKm + Math.round(dailyKmFor(input) * days);
}

/**
 * flow.md 5.3: a new reading lower than the last one is a CORRECTION and a jump of more
 * than 5,000 km per day is a likely TYPO. Both need the mechanic's confirmation.
 */
export type OdometerCheck = 'OK' | 'CORRECTION' | 'TYPO';

export function checkOdometer(
  previous: OdometerReading | null,
  next: OdometerReading,
): OdometerCheck {
  if (!previous) return 'OK';
  if (next.km < previous.km) return 'CORRECTION';
  const days = Math.max(1, (next.at.getTime() - previous.at.getTime()) / DAY_MS);
  return (next.km - previous.km) / days > MAX_KM_PER_DAY_JUMP ? 'TYPO' : 'OK';
}
