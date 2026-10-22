'use client';

import type { GarageLockReason } from '@gearva/contracts';
import { MutationCache, QueryCache, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { type ReactNode, useState } from 'react';
import { LockScreen } from '@/features/auth/lock-screen';
import { ApiError, lockReasonOf } from '@/lib/api';

/**
 * Query client, plus the lock screen (flow.md 2.5): any request answered GARAGE_LOCKED,
 * at login, at set-password or mid-session, replaces the whole app with the lock screen.
 */
export function Providers({ children }: { children: ReactNode }) {
  const [lockReason, setLockReason] = useState<GarageLockReason | null>(null);
  const [queryClient] = useState(() => {
    const onError = (error: unknown) => {
      const reason = lockReasonOf(error);
      if (reason) setLockReason(reason);
    };
    return new QueryClient({
      queryCache: new QueryCache({ onError }),
      mutationCache: new MutationCache({ onError }),
      defaultOptions: {
        queries: {
          staleTime: 30_000,
          // Do not retry answers the server gave on purpose (401, 403, 404, validation...).
          retry: (count, error) =>
            !(error instanceof ApiError && error.status >= 400 && error.status < 500) && count < 2,
        },
      },
    });
  });

  return (
    <QueryClientProvider client={queryClient}>
      {lockReason ? (
        <LockScreen reason={lockReason} onClose={() => setLockReason(null)} />
      ) : (
        children
      )}
    </QueryClientProvider>
  );
}
