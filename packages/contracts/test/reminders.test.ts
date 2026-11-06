import { describe, expect, it } from 'vitest';
import { localMonth, monthStart, nextDaytimeStart, reminderRound } from '../src/reminders';

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

const base = {
  kind: 'SERVICE_DUE' as const,
  status: 'ACTIVE' as const,
  notifyCount: 0,
  lastNotifiedAt: null,
  nextDueKm: 10_500,
  nextDueDate: '2026-06-01',
};
const check = {
  estimatedKm: 9_000,
  today: '2026-03-01',
  leadKm: 500,
  leadDays: 7,
  now: new Date('2026-03-01T10:00:00Z'),
};

describe('reminderRound (flow.md 9.1)', () => {
  it('is not due before the lead', () => {
    expect(reminderRound(base, check)).toBeNull();
    expect(reminderRound(base, { ...check, estimatedKm: 9_999 })).toBeNull();
  });

  it('is due by km from 500 km before the change', () => {
    expect(reminderRound(base, { ...check, estimatedKm: 10_000 })).toBe(1);
  });

  it('is due by date from 7 days before, even if the car drives little', () => {
    expect(reminderRound(base, { ...check, today: '2026-05-24' })).toBeNull();
    expect(reminderRound(base, { ...check, today: '2026-05-25' })).toBe(1);
  });

  it('works with only a km or only a date', () => {
    expect(reminderRound({ ...base, nextDueDate: null }, { ...check, estimatedKm: 10_000 })).toBe(
      1,
    );
    expect(reminderRound({ ...base, nextDueKm: null }, { ...check, estimatedKm: 99_999 })).toBe(
      null,
    );
  });

  it('a sent reminder follows up after 30 days, twice at most', () => {
    const sent = {
      ...base,
      status: 'SENT' as const,
      notifyCount: 1,
      lastNotifiedAt: new Date('2026-02-01T10:00:00Z'),
    };
    const due = { ...check, estimatedKm: 11_000, now: new Date('2026-03-03T10:00:00Z') };
    expect(reminderRound(sent, { ...due, now: new Date('2026-03-03T09:59:00Z') })).toBeNull();
    expect(reminderRound(sent, due)).toBe(2);
    expect(reminderRound({ ...sent, notifyCount: 2 }, due)).toBe(3);
    expect(reminderRound({ ...sent, notifyCount: 3 }, due)).toBeNull();
  });

  it('a warranty end is due by date only, and sent once', () => {
    const warranty = { ...base, kind: 'WARRANTY_END' as const, nextDueKm: 10_000 };
    expect(reminderRound(warranty, { ...check, estimatedKm: 20_000 })).toBeNull();
    expect(reminderRound(warranty, { ...check, today: '2026-05-25' })).toBe(1);
    const sent = {
      ...warranty,
      status: 'SENT' as const,
      notifyCount: 1,
      lastNotifiedAt: new Date(0),
    };
    expect(reminderRound(sent, { ...check, today: '2026-09-01' })).toBeNull();
  });

  it('a completed or cancelled reminder is never due', () => {
    const due = { ...check, estimatedKm: 20_000 };
    expect(reminderRound({ ...base, status: 'COMPLETED' }, due)).toBeNull();
    expect(reminderRound({ ...base, status: 'CANCELLED' }, due)).toBeNull();
  });
});

describe('monthStart and localMonth', () => {
  it('use the garage month, not the UTC one', () => {
    // 23:30 UTC on Jan 31 is already Feb 1 in Beirut (UTC+2).
    const now = new Date('2026-01-31T23:30:00Z');
    expect(localMonth(now, tz)).toBe('2026-02');
    expect(monthStart(now, tz)).toEqual(new Date('2026-01-31T22:00:00Z'));
  });
});
