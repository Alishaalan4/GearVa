'use client';

import {
  type BusinessView,
  GARAGE_STATUSES,
  SUBSCRIPTION_PAYMENT_METHODS,
} from '@gearva/contracts';
import { Card } from '@gearva/ui';
import { useQuery } from '@tanstack/react-query';
import { useFormatter, useTranslations } from 'next-intl';
import { ApiErrorAlert } from '@/components/api-error';
import { Table, Td } from '@/components/table';
import { api } from '@/lib/api';
import { useMoney } from '@/lib/format';

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <Card>
      <p className="text-xs font-semibold text-muted">{label}</p>
      <p className="mt-1 text-2xl font-extrabold">{value}</p>
      {sub && <p className="mt-1 text-xs text-muted">{sub}</p>}
    </Card>
  );
}

/** flow.md 11.5: subscription revenue and growth. Counts and sums only. */
export function BusinessPage() {
  const t = useTranslations('business');
  const tCommon = useTranslations('common');
  const tStatus = useTranslations('status');
  const tMethod = useTranslations('subscription.methods');
  const money = useMoney();
  const format = useFormatter();
  const view = useQuery({
    queryKey: ['business'],
    queryFn: () => api<BusinessView>('/admin/v1/business'),
  });

  if (view.isPending) return <p className="text-sm text-muted">{tCommon('loading')}</p>;
  if (view.error) return <ApiErrorAlert error={view.error} />;
  const b = view.data;
  const month = (ym: string) =>
    format.dateTime(new Date(`${ym}-15T12:00:00Z`), {
      month: 'long',
      year: 'numeric',
      timeZone: 'UTC',
    });
  const months = [...b.months].reverse();
  const n = (v: number) => format.number(v);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-extrabold">{t('title')}</h1>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          label={t('thisYear')}
          value={money(b.revenueThisYearCents)}
          sub={SUBSCRIPTION_PAYMENT_METHODS.map(
            (m) => `${tMethod(m)} ${money(b.byMethod[m])}`,
          ).join(' · ')}
        />
        <Stat label={t('lastYear')} value={money(b.revenueLastYearCents)} />
        <Stat label={t('paidOnce')} value={n(b.paid)} sub={t('neverPaid', { count: b.unpaid })} />
        <Stat
          label={t('garages')}
          value={n(GARAGE_STATUSES.reduce((sum, s) => sum + b.byStatus[s], 0))}
          sub={GARAGE_STATUSES.map((s) => `${tStatus(s)} ${n(b.byStatus[s])}`).join(' · ')}
        />
      </div>

      <Card title={t('byMonth')}>
        <Table
          head={[
            t('columns.month'),
            t('columns.revenue'),
            t('columns.payments'),
            t('columns.newGarages'),
          ]}
        >
          {months.map((m) => (
            <tr key={m.month}>
              <Td className="whitespace-nowrap">{month(m.month)}</Td>
              <Td className="font-bold">{money(m.revenueCents)}</Td>
              <Td>{n(m.payments)}</Td>
              <Td>{n(m.newGarages)}</Td>
            </tr>
          ))}
        </Table>
      </Card>
    </div>
  );
}
