'use client';

import type { SystemSettings } from '@gearva/contracts';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';

export const SETTINGS_QUERY_KEY = ['settings'] as const;

/** The platform settings (flow.md 11.4): trial days, prices, reminder rules. */
export function useSystemSettings() {
  return useQuery({
    queryKey: SETTINGS_QUERY_KEY,
    queryFn: () => api<SystemSettings>('/admin/v1/settings'),
    staleTime: 60_000,
  });
}
