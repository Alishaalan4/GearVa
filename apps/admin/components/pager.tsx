'use client';

import { Button } from '@gearva/ui';
import { useTranslations } from 'next-intl';

/** "Previous · page 2 of 5 · Next" under a paginated list, with the total. */
export function Pager({
  page,
  pageSize,
  total,
  totalText,
  onPage,
}: {
  page: number;
  pageSize: number;
  total: number;
  totalText: string;
  onPage: (page: number) => void;
}) {
  const tCommon = useTranslations('common');
  const pages = Math.max(1, Math.ceil(total / pageSize));
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-muted">
      <span>{totalText}</span>
      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="secondary"
          disabled={page <= 1}
          onClick={() => onPage(page - 1)}
        >
          {tCommon('previous')}
        </Button>
        <span>{tCommon('pageOf', { page, pages })}</span>
        <Button
          type="button"
          variant="secondary"
          disabled={page >= pages}
          onClick={() => onPage(page + 1)}
        >
          {tCommon('next')}
        </Button>
      </div>
    </div>
  );
}
