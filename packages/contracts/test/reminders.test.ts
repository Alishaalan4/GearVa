import { describe, expect, it } from 'vitest';
import { nextDaytimeStart } from '../src/reminders';

const tz = 'Asia/Beirut';

describe('nextDaytimeStart (flow.md 9.3)', () => {
  it('is null inside the window, 09:00 to 20:00 local', () => {
    // Beirut is UTC+2 in winter.
    expect(nextDaytimeStart(new Date('2026-01-10T07:00:00Z'), tz)).toBeNull(); // 09:00
    expect(nextDaytimeStart(new Date('2026-01-10T17:59:00Z'), tz)).toBeNull(); // 19:59
  });

  it('before 09:00 it is 09:00 the same day', () => {
    expect(nextDaytimeStart(new Date('2026-01-10T03:30:00Z'), tz)).toEqual(
      new Date('2026-01-10T07:00:00Z'),
    );
  });

  it('from 20:00 it is 09:00 the next day, across a month and a year', () => {
    expect(nextDaytimeStart(new Date('2026-01-10T18:00:00Z'), tz)).toEqual(
      new Date('2026-01-11T07:00:00Z'),
    );
    expect(nextDaytimeStart(new Date('2026-12-31T20:00:00Z'), tz)).toEqual(
      new Date('2027-01-01T07:00:00Z'),
    );
  });

  it('uses summer time when it applies', () => {
    // Beirut is UTC+3 in summer: 23:00 local on 2026-07-01 -> 09:00 local = 06:00 UTC.
    expect(nextDaytimeStart(new Date('2026-07-01T20:00:00Z'), tz)).toEqual(
      new Date('2026-07-02T06:00:00Z'),
    );
  });

  it('crosses a daylight-saving change overnight', () => {
    // Beirut moves to summer time on the last Sunday of March (2026-03-29) at midnight.
    expect(nextDaytimeStart(new Date('2026-03-28T20:00:00Z'), tz)).toEqual(
      new Date('2026-03-29T06:00:00Z'),
    );
  });

  it('works in any time zone', () => {
    // 23:00 in New York (UTC-5 in January) -> 09:00 next day = 14:00 UTC.
    expect(nextDaytimeStart(new Date('2026-01-11T04:00:00Z'), 'America/New_York')).toEqual(
      new Date('2026-01-11T14:00:00Z'),
    );
  });
});
