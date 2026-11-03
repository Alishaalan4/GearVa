'use client';

import type { IncomePeriod, IncomeSummary } from '@gearva/contracts';
import { Card, Select } from '@gearva/ui';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useFormatter, useTranslations } from 'next-intl';
import { useState } from 'react';
import { ApiErrorAlert } from '@/components/api-error';
import { useStaff } from '@/features/auth/use-staff';
import { useBranches } from '@/features/branches/use-branches';
import { Link } from '@/i18n/navigation';
import { api } from '@/lib/api';
import { calendarDate, useMoney } from '@/lib/format';

function Period({ title, period }: { title: string; period: IncomePeriod }) {
  const t = useTranslations('income');
  const money = useMoney();
  return (
    <Card title={title}>
      <dl className="grid grid-cols-2 gap-3 [&>div]:min-w-0">
        <div>
          <dt className="text-xs font-medium text-muted">{t('received')}</dt>
          <dd className="break-words text-xl font-extrabold sm:text-2xl">
            {money(period.receivedCents)}
          </dd>
        </div>
        <div>
          <dt className="text-xs font-medium text-muted">{t('invoiced')}</dt>
          <dd className="break-words text-xl font-extrabold sm:text-2xl">
            {money(period.invoicedCents)}
          </dd>
        </div>
      </dl>
    </Card>
  );
}

/**
 * flow.md 8.3: today and this month, money received (payments) against money invoiced
 * (invoices, without cancelled ones). The full revenue screens are Phase 7.
 */
export function IncomeSummaryPage() {
  const t = useTranslations('income');
  const tCommon = useTranslations('common');
  const format = useFormatter();
  const money = useMoney();
  const { data: me } = useStaff();
  // Staff bound to a branch always see their own; the API applies it too.
  const canPickBranch = me?.branchId === null;
  const branches = useBranches();
  const [branchId, setBranchId] = useState('');

  const income = useQuery({
    queryKey: ['income', branchId],
    queryFn: () => api<IncomeSummary>(`/v1/income${branchId ? `?branchId=${branchId}` : ''}`),
    placeholderData: keepPreviousData,
  });
  const branchList = branches.data?.items ?? [];

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold">{t('title')}</h1>
          {income.data && (
            <p className="text-sm text-muted">
              {format.dateTime(calendarDate(income.data.date), { dateStyle: 'full' })}
            </p>
          )}
        </div>
        {canPickBranch && branchList.length > 1 && (
          <Select
            className="w-auto"
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
          </Select>
        )}
      </div>

      <ApiErrorAlert error={income.error} />
      {income.isPending && <p className="text-sm text-muted">{tCommon('loading')}</p>}
      {income.data && (
        <>
          <Period title={t('today')} period={income.data.today} />
          <Period title={t('month')} period={income.data.month} />
          {income.data.refundNeededCents > 0 && (
            <Link
              href="/invoices?filter=REFUND"
              className="block rounded-[10px] bg-bad px-3 py-2 text-sm font-medium text-bad-ink"
            >
              {t('refundNeeded', { amount: money(income.data.refundNeededCents) })}
            </Link>
          )}
          <p className="text-xs text-muted">{t('explain')}</p>
        </>
      )}
    </div>
  );
}
