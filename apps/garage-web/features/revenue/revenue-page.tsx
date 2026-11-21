'use client';

import {
  REVENUE_PERIODS,
  type RevenuePeriod,
  type RevenueReport,
  localDate,
} from '@gearva/contracts';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useFormatter, useTranslations } from 'next-intl';
import { type ReactNode, useState } from 'react';
import { ApiErrorAlert } from '@/components/api-error';
import { useStaff } from '@/features/auth/use-staff';
import { useBranches } from '@/features/branches/use-branches';
import { Link } from '@/i18n/navigation';
import { api } from '@/lib/api';
import { calendarDate, useMoney } from '@/lib/format';
import { DebtsTable } from './debts-table';
import { Chevron, SeriesChart, ServiceBars } from './revenue-charts';

/** Moves a day by whole days, months or years (YYYY-MM-DD, no time zone involved). */
function shift(day: string, period: RevenuePeriod, by: number): string {
  const d = calendarDate(day);
  if (period === 'DAY') d.setUTCDate(d.getUTCDate() + by);
  if (period === 'MONTH') d.setUTCMonth(d.getUTCMonth() + by, 1);
  if (period === 'YEAR') d.setUTCFullYear(d.getUTCFullYear() + by, 0, 1);
  return d.toISOString().slice(0, 10);
}

/** One toolbar height for every control on the page header. */
const BOX = 'h-10 rounded-[10px] border border-line bg-card text-sm font-semibold';

/** A card whose title row can carry an extra item (a count, a legend) at the end. */
function Panel({
  title,
  aside,
  className = '',
  children,
}: {
  title: string;
  aside?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section
      className={`flex flex-col rounded-xl border border-line bg-card p-4 sm:p-5 ${className}`}
    >
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-base font-bold">{title}</h2>
        {aside}
      </div>
      {children}
    </section>
  );
}

/**
 * The Revenue page (flow.md 8.4, step 7.5, design of the prototype's Revenue screen):
 * a toolbar (period, date, branch), four totals, then two rows of two sides: the chart
 * beside the service types, and who owes money beside payment methods and top customers.
 * Receptionists see the debts only (flow.md 1); mechanics never reach this page.
 */
export function RevenuePage() {
  const t = useTranslations('revenue');
  const { data: me } = useStaff();
  if (!me) return null;
  if (me.role === 'RECEPTIONIST') {
    return (
      <div className="mx-auto max-w-3xl space-y-4">
        <h1 className="text-2xl font-extrabold">{t('debtsTitle')}</h1>
        <section className="rounded-xl border border-line bg-card p-4 sm:p-5">
          <DebtsTable />
        </section>
      </div>
    );
  }
  return <FullRevenue canPickBranch={me.branchId === null} />;
}

function FullRevenue({ canPickBranch }: { canPickBranch: boolean }) {
  const t = useTranslations('revenue');
  const tCommon = useTranslations('common');
  const format = useFormatter();
  const money = useMoney({ whole: true });
  const branches = useBranches();
  const [period, setPeriod] = useState<RevenuePeriod>('MONTH');
  const [date, setDate] = useState(() => localDate(new Date(), 'Asia/Beirut'));
  const [branchId, setBranchId] = useState('');

  const params = new URLSearchParams({ period, date });
  if (branchId) params.set('branchId', branchId);
  const report = useQuery({
    queryKey: ['revenue', period, date, branchId],
    queryFn: () => api<RevenueReport>(`/v1/revenue?${params}`),
    placeholderData: keepPreviousData,
  });
  const r = report.data;
  const branchList = branches.data?.items ?? [];
  const branchName = branchList.find((b) => b.id === branchId)?.name;

  const title = (rep: RevenueReport) =>
    rep.period === 'DAY'
      ? format.dateTime(calendarDate(rep.from), { dateStyle: 'full', timeZone: 'UTC' })
      : rep.period === 'MONTH'
        ? format.dateTime(calendarDate(rep.from), {
            month: 'long',
            year: 'numeric',
            timeZone: 'UTC',
          })
        : rep.from.slice(0, 4);
  const atToday = r ? r.to >= r.today : false;

  const stepButton = (by: -1 | 1) => (
    <button
      type="button"
      className="grid h-full w-9 shrink-0 place-items-center text-muted hover:text-ink disabled:opacity-30 disabled:hover:text-muted"
      aria-label={by < 0 ? t('previous') : t('next')}
      disabled={by > 0 && atToday}
      onClick={() => setDate(shift(date, period, by))}
    >
      <Chevron direction={by < 0 ? 'back' : 'forward'} />
    </button>
  );
  const picker =
    'h-full min-w-0 border-x border-line bg-transparent px-2 text-center font-semibold text-ink focus:outline-none';

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-extrabold">{t('title')}</h1>
          <p className="text-sm text-muted">
            {r ? title(r) : '…'} · {branchName ?? t('allBranches')}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className={`${BOX} flex p-1`} role="group" aria-label={t('period')}>
            {REVENUE_PERIODS.map((p) => (
              <button
                key={p}
                type="button"
                aria-pressed={period === p}
                className={`rounded-[7px] px-3.5 ${
                  period === p ? 'bg-brand text-on-brand' : 'text-muted hover:text-ink'
                }`}
                onClick={() => setPeriod(p)}
              >
                {t(`periods.${p}`)}
              </button>
            ))}
          </div>
          <div className={`${BOX} flex items-center overflow-hidden`}>
            {stepButton(-1)}
            {period === 'DAY' && (
              <input
                type="date"
                className={`${picker} w-40`}
                aria-label={t('pickDay')}
                value={date}
                onChange={(e) => e.target.value && setDate(e.target.value)}
              />
            )}
            {period === 'MONTH' && (
              <input
                type="month"
                className={`${picker} w-40`}
                aria-label={t('pickMonth')}
                value={date.slice(0, 7)}
                onChange={(e) => e.target.value && setDate(`${e.target.value}-01`)}
              />
            )}
            {period === 'YEAR' && (
              <span className={`${picker} grid w-24 place-items-center tabular-nums`}>
                {date.slice(0, 4)}
              </span>
            )}
            {stepButton(1)}
          </div>
          {canPickBranch && branchList.length > 1 && (
            <select
              className={`${BOX} max-w-56 px-3 text-ink focus:border-brand focus:outline-none`}
              aria-label={t('branch')}
              value={branchId}
              onChange={(e) => setBranchId(e.target.value)}
            >
              <option value="">{t('allBranches')}</option>
              {branchList.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name} ({b.code})
                </option>
              ))}
            </select>
          )}
        </div>
      </div>

      <ApiErrorAlert error={report.error} />
      {report.isPending && <p className="text-sm text-muted">{tCommon('loading')}</p>}

      {r && (
        <>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <Stat label={t('revenue')} value={money(r.invoicedCents)} note={t('revenueNote')} />
            <Stat
              label={t('collected')}
              value={money(r.collectedCents)}
              note={t('collectedNote')}
            />
            <Stat label={t('unpaid')} value={money(r.unpaidCents)} note={t('unpaidNote')} />
            <Stat
              label={t('average')}
              value={money(r.averageInvoiceCents)}
              note={t('invoiceCount', { count: r.invoiceCount })}
            />
          </div>
          {r.refundNeededCents > 0 && (
            <Link
              href="/invoices?filter=REFUND"
              className="block rounded-[10px] bg-bad px-4 py-2.5 text-sm font-medium text-bad-ink"
            >
              {t('refundNeeded', { amount: money(r.refundNeededCents) })}
            </Link>
          )}

          <div className="grid gap-4 lg:grid-cols-3">
            {r.series.length > 0 && (
              <Panel
                className="lg:col-span-2"
                title={r.period === 'YEAR' ? t('byMonth') : t('byDay')}
              >
                <SeriesChart report={r} />
              </Panel>
            )}
            <Panel title={t('byService')} className={r.series.length > 0 ? '' : 'lg:col-span-3'}>
              <ServiceBars rows={r.byServiceType} />
              <p className="mt-auto pt-4 text-xs text-muted">{t('byServiceNote')}</p>
            </Panel>
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            <Panel className="lg:col-span-2" title={t('debtsTitle')}>
              <DebtsTable />
            </Panel>
            <div className="grid content-start gap-4">
              <Panel title={t('byMethod')}>
                {r.byMethod.length === 0 ? (
                  <p className="text-sm text-muted">{t('nothingYet')}</p>
                ) : (
                  <ul className="space-y-3 text-sm">
                    {r.byMethod.map((m) => {
                      const share = Math.round(
                        (m.amountCents / Math.max(1, r.collectedCents)) * 100,
                      );
                      return (
                        <li key={m.method}>
                          <div className="flex justify-between">
                            <span>{t(`methods.${m.method}`)}</span>
                            <span className="font-semibold tabular-nums">
                              {money(m.amountCents)}
                              <span className="ms-2 inline-block w-9 text-end text-xs font-normal text-muted">
                                {share}%
                              </span>
                            </span>
                          </div>
                          <div className="mt-1.5 h-1.5 rounded-full bg-soft">
                            <div
                              className="h-full rounded-full bg-chart-2"
                              style={{ width: `${share}%` }}
                            />
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </Panel>
              <Panel title={t('topCustomers')}>
                {r.topCustomers.length === 0 ? (
                  <p className="text-sm text-muted">{t('nothingYet')}</p>
                ) : (
                  <ol className="divide-y divide-line text-sm">
                    {r.topCustomers.map((c, i) => (
                      <li
                        key={c.customerId}
                        className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0"
                      >
                        <span className="grid size-6 shrink-0 place-items-center rounded-full bg-soft text-xs font-bold text-muted">
                          {i + 1}
                        </span>
                        <div className="min-w-0 flex-1">
                          <Link
                            href={`/customers/${c.customerId}`}
                            className="block truncate font-semibold hover:underline"
                          >
                            {c.name}
                          </Link>
                          <p className="text-xs text-muted">
                            {t('invoiceCount', { count: c.invoiceCount })}
                          </p>
                        </div>
                        <span className="font-semibold tabular-nums">{money(c.invoicedCents)}</span>
                      </li>
                    ))}
                  </ol>
                )}
              </Panel>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function Stat({ label, value, note }: { label: string; value: string; note: ReactNode }) {
  return (
    <div className="min-w-0 rounded-xl border border-line bg-card p-4 sm:p-5">
      <p className="text-xs font-medium text-muted">{label}</p>
      <p className="mt-1 truncate text-2xl font-extrabold tabular-nums sm:text-[1.75rem]">
        {value}
      </p>
      <p className="mt-1 truncate text-xs text-muted">{note}</p>
    </div>
  );
}
