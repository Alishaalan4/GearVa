// Pure unit tests for the subscription lock rule (flow.md 2.5).
import { type LockableGarage, garageLockReason } from '../src/common/garage-lock';

const NOW = new Date('2026-10-21T12:00:00Z');
const before = new Date('2026-10-21T11:59:59Z');
const after = new Date('2026-10-21T12:00:01Z');

function garage(overrides: Partial<LockableGarage>): LockableGarage {
  return { status: 'ACTIVE', isPaid: true, trialEndsAt: null, expiresAt: after, ...overrides };
}

describe('garageLockReason', () => {
  it('an active garage paid until later is open', () => {
    expect(garageLockReason(garage({}), NOW)).toBeNull();
  });

  it('suspended is locked, whatever the dates say', () => {
    expect(garageLockReason(garage({ status: 'SUSPENDED' }), NOW)).toBe('suspended');
  });

  it('status EXPIRED is locked', () => {
    expect(garageLockReason(garage({ status: 'EXPIRED' }), NOW)).toBe('expired');
  });

  it('a paid-until date in the past locks even before the daily job marks it EXPIRED', () => {
    expect(garageLockReason(garage({ expiresAt: before }), NOW)).toBe('expired');
  });

  it('a running trial is open; an ended unpaid trial is locked', () => {
    const trial = { status: 'TRIAL' as const, isPaid: false, expiresAt: null };
    expect(garageLockReason(garage({ ...trial, trialEndsAt: after }), NOW)).toBeNull();
    expect(garageLockReason(garage({ ...trial, trialEndsAt: before }), NOW)).toBe('trial_ended');
  });

  it('a trial garage that was paid is not locked by the trial date', () => {
    expect(
      garageLockReason(garage({ status: 'TRIAL', isPaid: true, trialEndsAt: before }), NOW),
    ).toBeNull();
  });
});
