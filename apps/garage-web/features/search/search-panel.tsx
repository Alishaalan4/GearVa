'use client';

import type { Paginated, SearchResult } from '@gearva/contracts';
import { Input } from '@gearva/ui';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { ApiErrorAlert } from '@/components/api-error';
import { Link } from '@/i18n/navigation';
import { api } from '@/lib/api';
import { useDebouncedValue } from '@/lib/use-debounced-value';

const PAGE_SIZE = 20;
const MIN_CHARS = 2;

/** Only digits, spaces and + - ( ) . : probably a phone, carried to "add customer". */
const looksLikePhone = (q: string) => /^[\d\s+\-().]{6,}$/.test(q);

/**
 * flow.md 3.3: one box for a plate or a phone, results as you type. A result opens the
 * car, or the customer when they have no car yet.
 */
export function SearchPanel() {
  const t = useTranslations('search');
  const [text, setText] = useState('');
  const q = useDebouncedValue(text.trim());
  const enabled = q.length >= MIN_CHARS;

  const results = useQuery({
    queryKey: ['search', q],
    queryFn: () =>
      api<Paginated<SearchResult>>(`/v1/search?q=${encodeURIComponent(q)}&pageSize=${PAGE_SIZE}`),
    enabled,
    placeholderData: keepPreviousData,
  });

  const newCustomerHref = looksLikePhone(text.trim())
    ? { pathname: '/customers/new', query: { phone: text.trim() } }
    : '/customers/new';

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">{t('title')}</h1>
        <Link
          href={newCustomerHref}
          className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700"
        >
          {t('addCustomer')}
        </Link>
      </div>

      <Input
        type="search"
        autoFocus
        enterKeyHint="search"
        className="py-3 text-base"
        placeholder={t('placeholder')}
        value={text}
        onChange={(e) => setText(e.target.value)}
        aria-label={t('placeholder')}
      />
      {!enabled && <p className="text-sm text-slate-500">{t('hint')}</p>}

      {enabled && (
        <>
          <ApiErrorAlert error={results.error} />
          {results.data && results.data.items.length === 0 && (
            <p className="text-sm text-slate-500">{t('empty')}</p>
          )}
          <ul className="space-y-2">
            {results.data?.items.map((r) => (
              <li key={`${r.customer.id}:${r.vehicle?.id ?? ''}`}>
                <Link
                  href={r.vehicle ? `/vehicles/${r.vehicle.id}` : `/customers/${r.customer.id}`}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white p-4 shadow-sm hover:border-slate-400"
                >
                  <div className="space-y-0.5">
                    {r.vehicle ? (
                      <>
                        <p className="font-mono text-lg font-semibold" dir="ltr">
                          {r.vehicle.plate}
                        </p>
                        <p className="text-sm text-slate-700">
                          {r.vehicle.make} {r.vehicle.model}
                          {r.vehicle.year ? ` · ${r.vehicle.year}` : ''}
                        </p>
                      </>
                    ) : (
                      <p className="text-sm italic text-slate-500">{t('noCar')}</p>
                    )}
                  </div>
                  <div className="text-end text-sm">
                    <p className="font-medium">{r.customer.name}</p>
                    <p className="text-slate-500" dir="ltr">
                      {r.customer.phone}
                    </p>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
          {results.data && results.data.total > results.data.items.length && (
            <p className="text-sm text-slate-500">
              {t('showing', { shown: results.data.items.length, total: results.data.total })}
            </p>
          )}
        </>
      )}
    </div>
  );
}
