import { describe, expect, it } from 'vitest';
import {
  DEFAULT_DAILY_KM,
  averageDailyKm,
  checkOdometer,
  estimateCurrentKm,
} from '../src/odometer';

const HOUR = 60 * 60 * 1000;
const day = (n: number) => new Date(Date.UTC(2026, 0, 1) + n * 24 * HOUR);
const r = (km: number, d: number) => ({ km, at: day(d) });

describe('averageDailyKm (flow.md 5.1)', () => {
  it('is null with fewer than 2 readings', () => {
    expect(averageDailyKm([])).toBeNull();
    expect(averageDailyKm([r(10000, 0)])).toBeNull();
  });

  it('is (last - first) / days between them', () => {
    expect(averageDailyKm([r(10000, 0), r(13000, 100)])).toBe(30);
  });

  it('uses only the last 5 readings, in date order whatever the input order', () => {
    const readings = [
      r(0, 0),
      r(50000, 100),
      r(51000, 110),
      r(52000, 120),
      r(53000, 130),
      r(54000, 140),
    ];
    // Without the first reading: (54000 - 50000) / 40 days = 100.
    expect(averageDailyKm([...readings].reverse())).toBe(100);
  });

  it('two readings on the same day count as one day', () => {
    const later = { km: 1100, at: new Date(day(0).getTime() + HOUR) };
    expect(averageDailyKm([r(1000, 0), later])).toBe(100);
  });

  it('clamps to 5..300 km per day', () => {
    expect(averageDailyKm([r(10000, 0), r(10001, 100)])).toBe(5);
    expect(averageDailyKm([r(10000, 0), r(10000, 10)])).toBe(5);
    expect(averageDailyKm([r(0, 0), r(9000, 10)])).toBe(300);
  });

  it('a lower reading is a correction: the average starts again from it', () => {
    // Odometer replaced: 80,000 -> 1,000, then the new one keeps counting.
    expect(averageDailyKm([r(78000, 0), r(80000, 50), r(1000, 60), r(3000, 160)])).toBe(20);
    // Right after the correction there is only one usable reading.
    expect(averageDailyKm([r(78000, 0), r(80000, 50), r(1000, 60)])).toBeNull();
  });

  it('rounds to 2 decimals (numeric(7,2))', () => {
    expect(averageDailyKm([r(0, 0), r(1000, 30)])).toBe(33.33);
  });
});

describe('estimateCurrentKm (flow.md 5.2)', () => {
  const base = { currentKm: 50000, lastOdometerAt: day(0), now: day(10) };

  it("uses the car's own average", () => {
    expect(estimateCurrentKm({ ...base, avgDailyKm: 40 })).toBe(50400);
  });

  it("falls back to the garage's default, then to 35 km/day", () => {
    expect(estimateCurrentKm({ ...base, avgDailyKm: null, garageDefaultDailyKm: 50 })).toBe(50500);
    expect(estimateCurrentKm({ ...base, avgDailyKm: null })).toBe(50000 + 10 * DEFAULT_DAILY_KM);
  });

  it('counts whole days only and never goes backwards', () => {
    const almostADay = new Date(day(0).getTime() + 23 * HOUR);
    expect(estimateCurrentKm({ ...base, now: almostADay, avgDailyKm: 40 })).toBe(50000);
    expect(estimateCurrentKm({ ...base, now: day(-5), avgDailyKm: 40 })).toBe(50000);
  });

  it('without a reading date there is nothing to add', () => {
    expect(estimateCurrentKm({ currentKm: 7000, lastOdometerAt: null, avgDailyKm: 40 })).toBe(7000);
  });

  it('rounds a fractional average to whole km', () => {
    expect(estimateCurrentKm({ ...base, avgDailyKm: 33.33 })).toBe(50333);
  });
});

describe('checkOdometer (flow.md 5.3)', () => {
  it('accepts a first reading and a normal one', () => {
    expect(checkOdometer(null, r(1000, 0))).toBe('OK');
    expect(checkOdometer(r(10000, 0), r(10500, 10))).toBe('OK');
    expect(checkOdometer(r(10000, 0), r(10000, 0))).toBe('OK');
  });

  it('a lower reading needs a correction confirmation', () => {
    expect(checkOdometer(r(10000, 0), r(9999, 10))).toBe('CORRECTION');
  });

  it('more than 5,000 km per day is a likely typo', () => {
    expect(checkOdometer(r(10000, 0), r(15000, 0))).toBe('OK');
    expect(checkOdometer(r(10000, 0), r(15001, 0))).toBe('TYPO');
    // 12,000 km in 3 days is 4,000 per day: fine.
    expect(checkOdometer(r(10000, 0), r(22000, 3))).toBe('OK');
    // A typed extra zero: 105,000 instead of 10,500 the next day.
    expect(checkOdometer(r(10000, 0), r(105000, 1))).toBe('TYPO');
  });
});
