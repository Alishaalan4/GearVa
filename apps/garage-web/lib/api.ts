import type { ApiErrorBody, ErrorCode, GarageLockReason } from '@gearva/contracts';

/** An error answer from the API ({ code, message, details }, README 5.6), or no answer. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: ErrorCode | 'NETWORK_ERROR',
    message: string,
    readonly details: Record<string, unknown> = {},
  ) {
    super(message);
  }
}

const LOCK_REASONS: readonly GarageLockReason[] = ['suspended', 'expired', 'trial_ended'];

/** The lock reason when the API answered GARAGE_LOCKED (flow.md 2.5), else null. */
export function lockReasonOf(error: unknown): GarageLockReason | null {
  if (!(error instanceof ApiError) || error.code !== 'GARAGE_LOCKED') return null;
  const reason = error.details.reason as GarageLockReason;
  return LOCK_REASONS.includes(reason) ? reason : 'suspended';
}

// Sign-in steps manage the session themselves, so a 401 there must not trigger a refresh.
const NO_REFRESH = [
  '/v1/auth/login',
  '/v1/auth/set-password',
  '/v1/auth/refresh',
  '/v1/auth/logout',
];

async function send<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    // Same origin: next.config.ts forwards /v1/* to the API with the cookies.
    res = await fetch(path, {
      ...init,
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', ...init?.headers },
    });
  } catch {
    throw new ApiError(0, 'NETWORK_ERROR', 'Network error');
  }
  if (res.status === 204) return undefined as T;
  const body = (await res.json().catch(() => null)) as T | ApiErrorBody | null;
  if (!res.ok) {
    const error = body as Partial<ApiErrorBody> | null;
    throw new ApiError(
      res.status,
      error?.code ?? 'INTERNAL_ERROR',
      error?.message ?? res.statusText,
      error?.details ?? {},
    );
  }
  return body as T;
}

let refreshing: Promise<ApiError | null> | null = null;

/** One refresh at a time, even when several requests get a 401 together. Null = refreshed. */
function refreshSession(): Promise<ApiError | null> {
  refreshing ??= send('/v1/auth/refresh', { method: 'POST' })
    .then(() => null)
    .catch((error: unknown) =>
      error instanceof ApiError ? error : new ApiError(0, 'NETWORK_ERROR', 'Network error'),
    )
    .finally(() => {
      refreshing = null;
    });
  return refreshing;
}

/**
 * Calls the API. The access cookie lasts 15 minutes; when it has expired the API answers
 * 401, so this refreshes the session once and retries the call. A refresh refused with
 * GARAGE_LOCKED is passed on, so the lock screen shows instead of the login page.
 */
export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  try {
    return await send<T>(path, init);
  } catch (error) {
    const canRefresh =
      error instanceof ApiError &&
      error.status === 401 &&
      !NO_REFRESH.some((p) => path.startsWith(p));
    if (!canRefresh) throw error;
    const failed = await refreshSession();
    if (!failed) return send<T>(path, init);
    if (failed.code === 'GARAGE_LOCKED') throw failed;
    throw error;
  }
}

function withBody<T>(method: string, path: string, body?: unknown): Promise<T> {
  return api<T>(path, { method, body: body === undefined ? undefined : JSON.stringify(body) });
}

export function apiPost<T>(path: string, body?: unknown): Promise<T> {
  return withBody<T>('POST', path, body);
}

export function apiPatch<T>(path: string, body: unknown): Promise<T> {
  return withBody<T>('PATCH', path, body);
}
