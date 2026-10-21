import type { CookieOptions, Response } from 'express';
import { ACCESS_TTL_SECONDS, MFA_TTL_SECONDS, REFRESH_TTL_SECONDS } from './session.service';

/**
 * Auth cookies (README 5.2): httpOnly, SameSite=Lax, Secure in production, and
 * host-only (no Domain). The web apps forward /admin/v1/* and /v1/* to the API, so the
 * browser sees the cookies as belonging to admin.gearva.online / app.gearva.online.
 * Paths keep each cookie off requests that do not need it.
 */
export const ADMIN_COOKIES = {
  access: 'gv_admin_at',
  refresh: 'gv_admin_rt',
  mfa: 'gv_admin_mfa',
} as const;

const ADMIN_PATH = '/admin/v1';
const ADMIN_AUTH_PATH = '/admin/v1/auth';

function base(secure: boolean): CookieOptions {
  return { httpOnly: true, secure, sameSite: 'lax' };
}

export function setAdminSessionCookies(
  res: Response,
  secure: boolean,
  tokens: { accessToken: string; refreshToken: string },
): void {
  res.cookie(ADMIN_COOKIES.access, tokens.accessToken, {
    ...base(secure),
    path: ADMIN_PATH,
    maxAge: ACCESS_TTL_SECONDS * 1000,
  });
  res.cookie(ADMIN_COOKIES.refresh, tokens.refreshToken, {
    ...base(secure),
    path: ADMIN_AUTH_PATH,
    maxAge: REFRESH_TTL_SECONDS * 1000,
  });
}

export function clearAdminSessionCookies(res: Response, secure: boolean): void {
  res.clearCookie(ADMIN_COOKIES.access, { ...base(secure), path: ADMIN_PATH });
  res.clearCookie(ADMIN_COOKIES.refresh, { ...base(secure), path: ADMIN_AUTH_PATH });
}

export function setAdminMfaCookie(res: Response, secure: boolean, token: string): void {
  res.cookie(ADMIN_COOKIES.mfa, token, {
    ...base(secure),
    path: ADMIN_AUTH_PATH,
    maxAge: MFA_TTL_SECONDS * 1000,
  });
}

export function clearAdminMfaCookie(res: Response, secure: boolean): void {
  res.clearCookie(ADMIN_COOKIES.mfa, { ...base(secure), path: ADMIN_AUTH_PATH });
}

/** Garage staff (garage-web forwards /v1/*). Separate names from the admin cookies. */
export const STAFF_COOKIES = {
  access: 'gv_at',
  refresh: 'gv_rt',
} as const;

const STAFF_PATH = '/v1';
const STAFF_AUTH_PATH = '/v1/auth';

export function setStaffSessionCookies(
  res: Response,
  secure: boolean,
  tokens: { accessToken: string; refreshToken: string },
): void {
  res.cookie(STAFF_COOKIES.access, tokens.accessToken, {
    ...base(secure),
    path: STAFF_PATH,
    maxAge: ACCESS_TTL_SECONDS * 1000,
  });
  res.cookie(STAFF_COOKIES.refresh, tokens.refreshToken, {
    ...base(secure),
    path: STAFF_AUTH_PATH,
    maxAge: REFRESH_TTL_SECONDS * 1000,
  });
}

export function clearStaffSessionCookies(res: Response, secure: boolean): void {
  res.clearCookie(STAFF_COOKIES.access, { ...base(secure), path: STAFF_PATH });
  res.clearCookie(STAFF_COOKIES.refresh, { ...base(secure), path: STAFF_AUTH_PATH });
}
