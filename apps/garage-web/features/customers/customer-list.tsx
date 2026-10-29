'use client';

import type { CustomerListItem, Paginated } from '@gearva/contracts';
import { Button, Input } from '@gearva/ui';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useFormatter, useTranslations } from 'next-intl';
import { useState } from 'react';
import { ApiErrorAlert } from '@/components/api-error';
import { Link } from '@/i18n/navigation';
import { api } from '@/lib/api';
import { useDebouncedValue } from '@/lib/use-debounced-value';

const PAGE_SIZE = 20;

/**
 * All customers of the garage, newest first, one page at a time (README 5.4: lists are
 * paginated and rate limited, and there is no export). Every role (decision 2026-10-27).
 */
export function CustomerList() {
  const t = useTranslations('customerList');
  const tCommon = useTranslations('common');
  const format = useFormatter();
  const [text, setText] = useState('');
  const q = useDebouncedValue(text.trim());
  const [page, setPage] = useState(1);

  const customers = useQuery({
    queryKey: ['customers', q, page],
    queryFn: () =>
      api<Paginated<CustomerListItem>>(
        `/v1/customers?page=${page}&pageSize=${PAGE_SIZE}${q ? `&q=${encodeURIComponent(q)}` : ''}`,
      ),
    placeholderData: keepPreviousData,
  });
  const pages = customers.data ? Math.max(1, Math.ceil(customers.data.total / PAGE_SIZE)) : 1;

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">{t('title')}</h1>
        <Link
          href="/customers/new"
          className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700"
        >
          {t('add')}
        </Link>
      </div>
      <Input
        type="search"
        placeholder={t('filter')}
        aria-label={t('filter')}
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          setPage(1);
        }}
      />

      <ApiErrorAlert error={customers.error} />
      {customers.isPending && <p className="text-sm text-slate-500">{tCommon('loading')}</p>}
      {customers.data?.items.length === 0 && (
        <p className="text-sm text-slate-500">{q ? t('noMatch') : t('empty')}</p>
      )}

      <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200 bg-white">
        {customers.data?.items.map((c) => (
          <li key={c.id}>
            <Link
              href={`/customers/${c.id}`}
              className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 hover:bg-slate-50"
            >
              <div>
                <p className="font-medium">{c.name}</p>
                <p className="text-sm text-slate-500" dir="ltr">
                  {c.phone}
                </p>
              </div>
              <div className="text-end text-sm text-slate-500">
                <p>{t('cars', { count: c.vehicleCount })}</p>
                <p>{format.dateTime(new Date(c.createdAt), { dateStyle: 'medium' })}</p>
              </div>
            </Link>
          </li>
        ))}
      </ul>

      {customers.data && pages > 1 && (
        <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-slate-600">
          <span>{t('total', { count: customers.data.total })}</span>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="secondary"
              disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}
            >
              {tCommon('previous')}
            </Button>
            <span>{tCommon('pageOf', { page, pages })}</span>
            <Button
              type="button"
              variant="secondary"
              disabled={page >= pages}
              onClick={() => setPage((p) => p + 1)}
            >
              {tCommon('next')}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
