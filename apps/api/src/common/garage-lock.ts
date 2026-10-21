import { HttpStatus } from '@nestjs/common';
import { ERROR_CODES, type GarageLockReason } from '@gearva/contracts';
import { AppException } from './errors/app-exception';

export interface LockableGarage {
  status: 'TRIAL' | 'ACTIVE' | 'EXPIRED' | 'SUSPENDED';
  isPaid: boolean;
  trialEndsAt: Date | null;
  expiresAt: Date | null;
  deletedAt?: Date | null;
}

/**
 * The subscription lock (flow.md 2.5, README 5.3). Returns why the garage is locked, or
 * null when it may be used. Checked on staff login, on every /v1 request and on refresh,
 * so a garage locks the moment a date passes, with no job or manual step needed.
 */
export function garageLockReason(
  garage: LockableGarage,
  now = new Date(),
): GarageLockReason | null {
  if (garage.status === 'SUSPENDED') return 'suspended';
  if (garage.status === 'EXPIRED') return 'expired';
  if (garage.expiresAt && garage.expiresAt < now) return 'expired';
  if (
    garage.status === 'TRIAL' &&
    !garage.isPaid &&
    garage.trialEndsAt &&
    garage.trialEndsAt < now
  ) {
    return 'trial_ended';
  }
  return null;
}

/** 403 GARAGE_LOCKED with the reason, so garage-web can show the right lock screen. */
export function garageLocked(reason: GarageLockReason): AppException {
  return new AppException(
    HttpStatus.FORBIDDEN,
    ERROR_CODES.GARAGE_LOCKED,
    'This garage is locked',
    {
      reason,
    },
  );
}
