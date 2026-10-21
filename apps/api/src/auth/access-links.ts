import { createHash, randomBytes } from 'node:crypto';

/**
 * One-time "set your password" links (flow.md 2.1). The link carries a random token;
 * only its SHA-256 lives in users.inviteTokenHash, so the database alone cannot be used
 * to open an account. A new link replaces the old one.
 */
export const INVITE_LINK_DAYS = 7;
export const RESET_LINK_HOURS = 24;

export interface AccessLink {
  url: string;
  tokenHash: string;
  expiresAt: Date;
}

export function hashAccessToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function newAccessLink(appUrlGarage: string, kind: 'invite' | 'reset'): AccessLink {
  const token = randomBytes(32).toString('base64url');
  const url = new URL('/set-password', appUrlGarage);
  url.searchParams.set('token', token);
  const ttlMs =
    kind === 'invite' ? INVITE_LINK_DAYS * 24 * 60 * 60 * 1000 : RESET_LINK_HOURS * 60 * 60 * 1000;
  return {
    url: url.toString(),
    tokenHash: hashAccessToken(token),
    expiresAt: new Date(Date.now() + ttlMs),
  };
}
