'use client';

import type { StaffProfile } from '@gearva/contracts';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';

export const STAFF_QUERY_KEY = ['staff', 'me'] as const;

/** The signed-in staff member and their garage, or an ApiError (401 = not signed in). */
export function useStaff() {
  return useQuery({
    queryKey: STAFF_QUERY_KEY,
    queryFn: () => api<StaffProfile>('/v1/auth/me'),
    staleTime: 5 * 60_000,
  });
}
