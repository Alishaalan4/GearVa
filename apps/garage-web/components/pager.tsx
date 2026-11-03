'use client';

import { Button } from '@gearva/ui';
import { useTranslations } from 'next-intl';

/** Previous / next for a paginated list (README 5.4); hidden when everything fits on one page. */
export function Pager({
  page,
  total,
  pageSize,
  onPage,
}: {
  page: number;
  total: number;
  pageSize: number;
  onPage: (page: number) => void;
}) {
  const t = useTranslations('common');
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (pages <= 1) return null;
  return (
    <div className="flex items-center justify-end gap-2 text-sm text-muted">
      <Button
        type="button"
        variant="secondary"
        disabled={page <= 1}
        onClick={() => onPage(page - 1)}
      >
        {t('previous')}
      </Button>
      <span>{t('pageOf', { page, pages })}</span>
      <Button
        type="button"
        variant="secondary"
        disabled={page >= pages}
        onClick={() => onPage(page + 1)}
      >
        {t('next')}
      </Button>
    </div>
  );
}
