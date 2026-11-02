'use client';

import type { Paginated, SearchResult } from '@gearva/contracts';
import { buttonClass, Input } from '@gearva/ui';
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
        <h1 className="text-2xl font-extrabold">{t('title')}</h1>
        <Link href={newCustomerHref} className={buttonClass()}>
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
      {!enabled && <p className="text-sm text-muted">{t('hint')}</p>}

      {enabled && (
        <>
          <ApiErrorAlert error={results.error} />
          {results.data && results.data.items.length === 0 && (
            <p className="text-sm text-muted">{t('empty')}</p>
          )}
          <ul className="space-y-2">
            {results.data?.items.map((r) => (
              <li key={`${r.customer.id}:${r.vehicle?.id ?? ''}`}>
                <Link
                  href={r.vehicle ? `/vehicles/${r.vehicle.id}` : `/customers/${r.customer.id}`}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-line bg-card p-4 hover:border-ink"
                >
                  <div className="space-y-0.5">
                    {r.vehicle ? (
                      <>
                        <p className="text-lg font-extrabold" dir="ltr">
                          {r.vehicle.plate}
                        </p>
                        <p className="text-sm text-soft-ink">
                          {r.vehicle.make} {r.vehicle.model}
                          {r.vehicle.year ? ` · ${r.vehicle.year}` : ''}
                        </p>
                      </>
                    ) : (
                      <p className="text-sm italic text-muted">{t('noCar')}</p>
                    )}
                  </div>
                  <div className="text-end text-sm">
                    <p className="font-bold">{r.customer.name}</p>
                    <p className="text-muted" dir="ltr">
                      {r.customer.phone}
                    </p>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
          {results.data && results.data.total > results.data.items.length && (
            <p className="text-sm text-muted">
              {t('showing', { shown: results.data.items.length, total: results.data.total })}
            </p>
          )}
        </>
      )}
    </div>
  );
}
