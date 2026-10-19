import { paginationQuerySchema, type Paginated, type PaginationQuery } from '@gearva/contracts';
import { createZodDto } from 'nestjs-zod';

/** Use as `@Query() query: PaginationQueryDto` on every list endpoint. */
export class PaginationQueryDto extends createZodDto(paginationQuerySchema) {}

export function toSkipTake(query: PaginationQuery): { skip: number; take: number } {
  return { skip: (query.page - 1) * query.pageSize, take: query.pageSize };
}

export function paginated<T>(items: T[], total: number, query: PaginationQuery): Paginated<T> {
  return { items, page: query.page, pageSize: query.pageSize, total };
}
