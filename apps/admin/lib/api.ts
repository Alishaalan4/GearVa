import type { ApiErrorBody, ErrorCode } from '@gearva/contracts';

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

// Login steps manage the session themselves, so a 401 there must not trigger a refresh.
const NO_REFRESH = [
  '/admin/v1/auth/login',
  '/admin/v1/auth/totp/verify',
  '/admin/v1/auth/refresh',
  '/admin/v1/auth/logout',
];

async function send<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    // Same origin: next.config.ts forwards /admin/v1/* to the API with the cookies.
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

let refreshing: Promise<boolean> | null = null;

/** One refresh at a time, even when several requests get a 401 together. */
function refreshSession(): Promise<boolean> {
  refreshing ??= send('/admin/v1/auth/refresh', { method: 'POST' })
    .then(() => true)
    .catch(() => false)
    .finally(() => {
      refreshing = null;
    });
  return refreshing;
}

/**
 * Calls the API. The access cookie lasts 15 minutes; when it has expired the API answers
 * 401, so this refreshes the session once and retries the call.
 */
export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  try {
    return await send<T>(path, init);
  } catch (error) {
    const canRefresh =
      error instanceof ApiError &&
      error.status === 401 &&
      !NO_REFRESH.some((p) => path.startsWith(p));
    if (canRefresh && (await refreshSession())) return send<T>(path, init);
    throw error;
  }
}

export function apiPost<T>(path: string, body?: unknown): Promise<T> {
  return api<T>(path, {
    method: 'POST',
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}
