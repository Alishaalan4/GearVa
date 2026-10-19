import { z } from 'zod';

// README section 5.4 / 5.6: every list is paginated, at most 50 per page.
export const PAGE_SIZE_MAX = 50;
export const PAGE_SIZE_DEFAULT = 20;

export const paginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(PAGE_SIZE_MAX).default(PAGE_SIZE_DEFAULT),
});

export type PaginationQuery = z.infer<typeof paginationQuerySchema>;

export interface Paginated<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
}
