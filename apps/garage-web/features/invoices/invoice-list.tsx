'use client';

import type { InvoiceListItem, InvoiceStatus, Paginated } from '@gearva/contracts';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useFormatter, useTranslations } from 'next-intl';
import { useState } from 'react';
import { ApiErrorAlert } from '@/components/api-error';
import { Pager } from '@/components/pager';
import { Link } from '@/i18n/navigation';
import { api } from '@/lib/api';
import { useMoney } from '@/lib/format';
import { InvoiceStatusPill } from './invoice-status';

const PAGE_SIZE = 20;
const FILTERS = ['ALL', 'UNPAID', 'PARTIALLY_PAID', 'PAID', 'CANCELLED', 'REFUND'] as const;
type Filter = (typeof FILTERS)[number];

function queryOf(filter: Filter): string {
  if (filter === 'ALL') return '';
  if (filter === 'REFUND') return '&refundNeeded=true';
  return `&status=${filter satisfies InvoiceStatus}`;
}

/** All invoices, newest first; cancelled ones stay listed with their number (flow.md 7.5). */
export function InvoiceList({ initialFilter }: { initialFilter?: string }) {
  const t = useTranslations('invoiceList');
  const tCommon = useTranslations('common');
  const format = useFormatter();
  const money = useMoney();
  const [filter, setFilter] = useState<Filter>(FILTERS.find((f) => f === initialFilter) ?? 'ALL');
  const [page, setPage] = useState(1);

  const invoices = useQuery({
    queryKey: ['invoices', filter, page],
    queryFn: () =>
      api<Paginated<InvoiceListItem>>(
        `/v1/invoices?page=${page}&pageSize=${PAGE_SIZE}${queryOf(filter)}`,
      ),
    placeholderData: keepPreviousData,
  });

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <h1 className="text-2xl font-extrabold">{t('title')}</h1>
      <div className="flex flex-wrap gap-1.5" role="group" aria-label={t('filter')}>
        {FILTERS.map((f) => (
          <button
            key={f}
            type="button"
            aria-pressed={filter === f}
            className={`min-h-9 rounded-[10px] px-3 text-sm font-semibold ${
              filter === f ? 'bg-ink text-page' : 'bg-soft text-soft-ink'
            }`}
            onClick={() => {
              setFilter(f);
              setPage(1);
            }}
          >
            {t(`filters.${f}`)}
          </button>
        ))}
      </div>

      <ApiErrorAlert error={invoices.error} />
      {invoices.isPending && <p className="text-sm text-muted">{tCommon('loading')}</p>}
      {invoices.data?.items.length === 0 && <p className="text-sm text-muted">{t('empty')}</p>}

      {invoices.data && invoices.data.items.length > 0 && (
        <ul className="divide-y divide-line rounded-xl border border-line bg-card">
          {invoices.data.items.map((i) => (
            <li key={i.id}>
              <Link
                href={`/invoices/${i.id}`}
                className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 hover:bg-soft"
              >
                <div>
                  <p className="font-bold" dir="ltr">
                    {i.number}
                  </p>
                  <p className="text-sm text-muted">
                    {i.customerName} · <span dir="ltr">{i.plate}</span> ·{' '}
                    {format.dateTime(new Date(i.issuedAt), { dateStyle: 'medium' })}
                  </p>
                </div>
                <div className="space-y-1 text-end">
                  <p className="font-semibold">{money(i.totalCents)}</p>
                  <InvoiceStatusPill status={i.status} />
                  {filter === 'REFUND' && (
                    <p className="text-xs text-muted">
                      {t('refund', { amount: money(i.paidCents) })}
                    </p>
                  )}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {invoices.data && (
        <Pager page={page} total={invoices.data.total} pageSize={PAGE_SIZE} onPage={setPage} />
      )}
    </div>
  );
}
