'use client';

import type { DebtItem, Paginated } from '@gearva/contracts';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useFormatter, useTranslations } from 'next-intl';
import { Fragment, useState } from 'react';
import { ApiErrorAlert } from '@/components/api-error';
import { Pager } from '@/components/pager';
import { InvoiceStatusPill } from '@/features/invoices/invoice-status';
import { Link } from '@/i18n/navigation';
import { api } from '@/lib/api';
import { useMoney } from '@/lib/format';
import { Chevron } from './revenue-charts';

const PAGE_SIZE = 20;

/**
 * flow.md 8.2, step 7.5: who owes money, the largest debt first, as a table. A row opens to
 * show that customer's unpaid invoices, each one a link. All dates: debts are what is
 * owed now, whatever period the page shows.
 */
export function DebtsTable() {
  const t = useTranslations('revenue');
  const tCommon = useTranslations('common');
  const format = useFormatter();
  const money = useMoney();
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState<string | null>(null);
  const debts = useQuery({
    queryKey: ['debts', page],
    queryFn: () => api<Paginated<DebtItem>>(`/v1/debts?page=${page}&pageSize=${PAGE_SIZE}`),
    placeholderData: keepPreviousData,
  });
  const date = (iso: string) => format.dateTime(new Date(iso), { dateStyle: 'medium' });

  return (
    <div className="space-y-3">
      <ApiErrorAlert error={debts.error} />
      {debts.isPending && <p className="text-sm text-muted">{tCommon('loading')}</p>}
      {debts.data?.total === 0 && <p className="text-sm text-muted">{t('noDebts')}</p>}
      {debts.data && debts.data.total > 0 && (
        <>
          <p className="text-xs text-muted">
            {t('debtCount', { count: debts.data.total })} · {t('debtsNote')}
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line text-xs text-muted">
                  <th className="py-2 ps-2 text-start font-medium">{t('customer')}</th>
                  <th className="py-2 text-start font-medium">{t('invoices')}</th>
                  <th className="py-2 text-end font-medium">{t('owes')}</th>
                  <th className="w-8" />
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {debts.data.items.map((d) => {
                  const isOpen = open === d.customer.id;
                  const oldest = d.invoices[0];
                  return (
                    <Fragment key={d.customer.id}>
                      <tr
                        className={'cursor-pointer hover:bg-soft ' + (isOpen ? 'bg-soft' : '')}
                        onClick={() => setOpen(isOpen ? null : d.customer.id)}
                      >
                        <td className="py-3 ps-2 pe-2">
                          <Link
                            href={`/customers/${d.customer.id}`}
                            className="font-semibold hover:underline"
                            onClick={(e) => e.stopPropagation()}
                          >
                            {d.customer.name}
                          </Link>
                          <p className="text-xs text-muted" dir="ltr">
                            {d.customer.phone}
                          </p>
                        </td>
                        <td className="py-3 pe-2 text-xs">
                          <p>{t('invoiceCount', { count: d.invoices.length })}</p>
                          {oldest && (
                            <p className="text-muted">
                              {t('oldest', { date: date(oldest.issuedAt) })}
                            </p>
                          )}
                        </td>
                        <td className="py-3 text-end">
                          <span className="font-extrabold tabular-nums">
                            {money(d.remainingCents)}
                          </span>
                        </td>
                        <td className="py-3 pe-1 text-end text-muted">
                          <button
                            type="button"
                            className="grid size-7 place-items-center rounded-md hover:text-ink"
                            aria-expanded={isOpen}
                            aria-label={isOpen ? t('hideInvoices') : t('showInvoices')}
                          >
                            <Chevron direction={isOpen ? 'up' : 'down'} />
                          </button>
                        </td>
                      </tr>
                      {isOpen &&
                        d.invoices.map((i) => (
                          <tr key={i.id} className="bg-soft/60">
                            <td colSpan={4} className="py-0">
                              <Link
                                href={`/invoices/${i.id}`}
                                className="flex flex-wrap items-center justify-between gap-2 py-2 ps-6 pe-2 text-xs hover:underline"
                              >
                                <span>
                                  <span className="font-semibold" dir="ltr">
                                    {i.number}
                                  </span>
                                  <span className="text-muted">
                                    {' '}
                                    · <span dir="ltr">{i.plate}</span> · {date(i.issuedAt)}
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
                            </td>
                          </tr>
                        ))}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
          <Pager page={page} total={debts.data.total} pageSize={PAGE_SIZE} onPage={setPage} />
        </>
      )}
    </div>
  );
}
