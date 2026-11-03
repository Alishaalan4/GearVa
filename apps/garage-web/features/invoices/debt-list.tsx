'use client';

import type { DebtItem, Paginated } from '@gearva/contracts';
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

/** flow.md 8.2: who owes money, the largest debt first, with each unpaid invoice. */
export function DebtList() {
  const t = useTranslations('debts');
  const tCommon = useTranslations('common');
  const format = useFormatter();
  const money = useMoney();
  const [page, setPage] = useState(1);

  const debts = useQuery({
    queryKey: ['debts', page],
    queryFn: () => api<Paginated<DebtItem>>(`/v1/debts?page=${page}&pageSize=${PAGE_SIZE}`),
    placeholderData: keepPreviousData,
  });

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div>
        <h1 className="text-2xl font-extrabold">{t('title')}</h1>
        {debts.data && debts.data.total > 0 && (
          <p className="text-sm text-muted">{t('count', { count: debts.data.total })}</p>
        )}
      </div>

      <ApiErrorAlert error={debts.error} />
      {debts.isPending && <p className="text-sm text-muted">{tCommon('loading')}</p>}
      {debts.data?.items.length === 0 && <p className="text-sm text-muted">{t('empty')}</p>}

      {debts.data?.items.map((d) => (
        <section key={d.customer.id} className="rounded-xl border border-line bg-card">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-3">
            <Link href={`/customers/${d.customer.id}`} className="hover:underline">
              <p className="font-bold">{d.customer.name}</p>
              <p className="text-sm text-muted" dir="ltr">
                {d.customer.phone}
              </p>
            </Link>
            <div className="text-end">
              <p className="text-xs text-muted">{t('owes')}</p>
              <p className="text-lg font-extrabold">{money(d.remainingCents)}</p>
            </div>
          </div>
          <ul className="divide-y divide-line">
            {d.invoices.map((i) => (
              <li key={i.id}>
                <Link
                  href={`/invoices/${i.id}`}
                  className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 text-sm hover:bg-soft"
                >
                  <span>
                    <span className="font-semibold" dir="ltr">
                      {i.number}
                    </span>
                    <span className="text-muted">
                      {' '}
                      · <span dir="ltr">{i.plate}</span> ·{' '}
                      {format.dateTime(new Date(i.issuedAt), { dateStyle: 'medium' })}
                    </span>
                  </span>
                  <span className="flex items-center gap-2">
                    {t('remainingOf', {
                      remaining: money(i.remainingCents),
                      total: money(i.totalCents),
                    })}
                    <InvoiceStatusPill status={i.status} />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ))}

      {debts.data && (
        <Pager page={page} total={debts.data.total} pageSize={PAGE_SIZE} onPage={setPage} />
      )}
    </div>
  );
}
