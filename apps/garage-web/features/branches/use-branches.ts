'use client';

import { type BranchItem, PAGE_SIZE_MAX, type Paginated } from '@gearva/contracts';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';

export const BRANCHES_QUERY_KEY = ['branches'] as const;

/**
 * The garage's branches (OWNER and MANAGER). One page of the maximum size: a garage has
 * a handful of branches, far below the 50-per-page limit (README 5.4).
 */
export function useBranches() {
  return useQuery({
    queryKey: BRANCHES_QUERY_KEY,
    queryFn: () => api<Paginated<BranchItem>>(`/v1/branches?pageSize=${PAGE_SIZE_MAX}`),
  });
}
