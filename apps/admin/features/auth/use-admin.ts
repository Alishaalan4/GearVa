'use client';

import type { AdminProfile } from '@gearva/contracts';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';

export const ADMIN_QUERY_KEY = ['admin', 'me'] as const;

/** The signed-in admin, or an ApiError 401 when there is no session. */
export function useAdmin() {
  return useQuery({
    queryKey: ADMIN_QUERY_KEY,
    queryFn: () => api<AdminProfile>('/admin/v1/auth/me'),
    staleTime: 5 * 60_000,
  });
}
