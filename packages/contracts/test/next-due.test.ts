import { describe, expect, it } from 'vitest';
import { addMonths, computeNextDue, localDate, resolveInterval } from '../src/next-due';

const oil = { defaultIntervalKm: 5000, defaultIntervalMi: 3600, defaultIntervalMonths: 6 };
const tz = 'Asia/Beirut';

describe('resolveInterval (flow.md 6)', () => {
  it('uses the garage override before the global default', () => {
    const override = {
      defaultIntervalKm: 10000,
      defaultIntervalMi: 6000,
      defaultIntervalMonths: 12,
    };
    expect(resolveInterval('KM', oil, override)).toEqual({ intervalKm: 10000, intervalMonths: 12 });
    expect(resolveInterval('KM', oil, null)).toEqual({ intervalKm: 5000, intervalMonths: 6 });
  });

  it('a car on miles uses the miles interval, converted to km', () => {
    expect(resolveInterval('MI', oil)).toEqual({ intervalKm: 5794, intervalMonths: 6 });
  });

  it('time-only services have no km interval', () => {
    const battery = { defaultIntervalKm: null, defaultIntervalMi: null, defaultIntervalMonths: 24 };
    expect(resolveInterval('MI', battery)).toEqual({ intervalKm: null, intervalMonths: 24 });
    expect(resolveInterval('KM', null)).toEqual({ intervalKm: null, intervalMonths: null });
  });
});

describe('dates in the garage time zone', () => {
  it('takes the local calendar date', () => {
    // 22:30 UTC on Jan 31 is already Feb 1 in Beirut (UTC+2).
    expect(localDate(new Date('2026-01-31T22:30:00Z'), tz)).toBe('2026-02-01');
    expect(localDate(new Date('2026-01-31T22:30:00Z'), 'UTC')).toBe('2026-01-31');
  });

  it('adds months and clamps the day to the end of shorter months', () => {
    expect(addMonths('2026-03-15', 6)).toBe('2026-09-15');
    expect(addMonths('2026-08-31', 6)).toBe('2027-02-28');
    expect(addMonths('2027-08-31', 6)).toBe('2028-02-29');
    expect(addMonths('2026-11-30', 24)).toBe('2028-11-30');
  });
});

describe('computeNextDue (flow.md 6)', () => {
  const performedAt = new Date('2026-03-15T09:00:00Z');

  it('oil change at 5,500 km with a 5,000 km / 6 month interval', () => {
    const due = computeNextDue({
      odometerKm: 5500,
      performedAt,
      timeZone: tz,
      intervalKm: 5000,
      intervalMonths: 6,
    });
    expect(due).toEqual({ nextDueKm: 10500, nextDueDate: '2026-09-15' });
  });

  it('a car on miles: 3,417 mi with a 3,600 mi interval is due at 7,017 mi (stored in km)', () => {
    const { intervalKm } = resolveInterval('MI', oil);
    const due = computeNextDue({
      odometerKm: 5499,
      performedAt,
      timeZone: tz,
      intervalKm,
      intervalMonths: 6,
    });
    expect(due.nextDueKm).toBe(11293);
  });

  it('time-only and no-interval services', () => {
    const at = { odometerKm: 1000, performedAt, timeZone: tz, intervalKm: null };
    expect(computeNextDue({ ...at, intervalMonths: 24 })).toEqual({
      nextDueKm: null,
      nextDueDate: '2028-03-15',
    });
    expect(computeNextDue({ ...at, intervalMonths: null })).toEqual({
      nextDueKm: null,
      nextDueDate: null,
    });
  });
});
