'use client';

import {
  type ExpiringGarages,
  type FailedMessage,
  GARAGE_STATUSES,
  type GarageStatus,
  type MonitoredGarage,
  type Paginated,
} from '@gearva/contracts';
import { Button, Card, Input, Select, navItemClass } from '@gearva/ui';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useFormatter, useTranslations } from 'next-intl';
import { useState } from 'react';
import { ApiErrorAlert } from '@/components/api-error';
import { Pager } from '@/components/pager';
import { Table, Td } from '@/components/table';
import { Link } from '@/i18n/navigation';
import { api } from '@/lib/api';
import { useDates } from '@/lib/format';
import { StatusBadge } from '../garages/status-badge';

const PAGE_SIZE = 20;
const TABS = ['expiring', 'usage', 'failures'] as const;
type Tab = (typeof TABS)[number];

/** flow.md 11.2: who is expiring, how each garage uses Gearva, and failed messages. */
export function MonitoringPage() {
  const t = useTranslations('monitoring');
  const [tab, setTab] = useState<Tab>('expiring');
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-extrabold">{t('title')}</h1>
      <div className="flex flex-wrap gap-1 rounded-xl bg-sidebar p-1" role="tablist">
        {TABS.map((name) => (
          <button
            key={name}
            type="button"
            role="tab"
            aria-selected={tab === name}
            className={navItemClass(tab === name)}
            onClick={() => setTab(name)}
          >
            {t(`tabs.${name}`)}
          </button>
        ))}
      </div>
      {tab === 'expiring' && <Expiring />}
      {tab === 'usage' && <Usage />}
      {tab === 'failures' && <Failures />}
    </div>
  );
}

function UsageCells({ g }: { g: MonitoredGarage }) {
  const format = useFormatter();
  const { date } = useDates();
  const n = (v: number) => format.number(v);
  return (
    <>
      <Td>{n(g.usage.customers)}</Td>
      <Td>{n(g.usage.vehicles)}</Td>
      <Td>{n(g.usage.invoicesThisMonth)}</Td>
      <Td className="whitespace-nowrap">
        {n(g.usage.emailsSent)}
        {g.usage.emailsFailed > 0 && (
          <span className="text-bad-ink"> / {n(g.usage.emailsFailed)}</span>
        )}
      </Td>
      <Td>{n(g.usage.whatsappSent)}</Td>
      <Td className="whitespace-nowrap text-muted">{date(g.usage.lastLoginAt)}</Td>
      <Td className="whitespace-nowrap text-muted">{date(g.usage.lastVisitAt)}</Td>
    </>
  );
}

function useUsageHead() {
  const t = useTranslations('monitoring.columns');
  return [
    t('customers'),
    t('vehicles'),
    t('invoices'),
    t('emails'),
    t('whatsapp'),
    t('lastLogin'),
    t('lastVisit'),
  ];
}

function GarageCell({ g }: { g: MonitoredGarage }) {
  return (
    <Td>
      <Link href={`/garages/${g.id}`} className="font-bold hover:underline">
        {g.name}
      </Link>
      <div className="mt-1">
        <StatusBadge status={g.status} />
      </div>
    </Td>
  );
}

function Expiring() {
  const t = useTranslations('monitoring');
  const tCommon = useTranslations('common');
  const { endDay } = useDates();
  const usageHead = useUsageHead();
  const expiring = useQuery({
    queryKey: ['monitoring', 'expiring'],
    queryFn: () => api<ExpiringGarages>('/admin/v1/monitoring/expiring'),
  });
  if (expiring.error) return <ApiErrorAlert error={expiring.error} />;

  const section = (title: string, rows: MonitoredGarage[] | undefined, endOf: 'paid' | 'trial') => (
    <Card title={title}>
      <Table
        head={[t('columns.garage'), t('columns.ends'), ...usageHead]}
        empty={rows?.length === 0 && t('noneExpiring')}
        loading={!rows && tCommon('loading')}
      >
        {rows?.map((g) => (
          <tr key={g.id}>
            <GarageCell g={g} />
            <Td className="whitespace-nowrap font-semibold">
              {endDay(endOf === 'paid' ? g.expiresAt : g.trialEndsAt)}
            </Td>
            <UsageCells g={g} />
          </tr>
        ))}
      </Table>
    </Card>
  );

  return (
    <div className="space-y-6">
      {section(t('paidEnding'), expiring.data?.paid, 'paid')}
      {section(t('trialsEnding'), expiring.data?.trials, 'trial')}
    </div>
  );
}

function Usage() {
  const t = useTranslations('monitoring');
  const tCommon = useTranslations('common');
  const tStatus = useTranslations('status');
  const usageHead = useUsageHead();
  const [page, setPage] = useState(1);
  const [draft, setDraft] = useState('');
  const [filters, setFilters] = useState<{
    q: string;
    status: GarageStatus | '';
    paid: '' | 'true' | 'false';
    inactiveDays: string;
  }>({ q: '', status: '', paid: '', inactiveDays: '' });

  const params = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE) });
  for (const [k, v] of Object.entries(filters)) if (v) params.set(k, v);
  const usage = useQuery({
    queryKey: ['monitoring', 'usage', { page, filters }],
    queryFn: () =>
      api<Paginated<MonitoredGarage>>(`/admin/v1/monitoring/usage?${params.toString()}`),
    placeholderData: keepPreviousData,
  });
  const set = (patch: Partial<typeof filters>) => {
    setPage(1);
    setFilters((f) => ({ ...f, ...patch }));
  };

  return (
    <div className="space-y-4">
      <form
        className="flex flex-wrap gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          set({ q: draft.trim() });
        }}
      >
        <Input
          className="min-w-48 flex-1"
          placeholder={t('search')}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
        />
        <Select
          className="w-auto"
          value={filters.status}
          onChange={(e) => set({ status: e.target.value as GarageStatus | '' })}
        >
          <option value="">{t('allStatuses')}</option>
          {GARAGE_STATUSES.map((s) => (
            <option key={s} value={s}>
              {tStatus(s)}
            </option>
          ))}
        </Select>
        <Select
          className="w-auto"
          value={filters.paid}
          onChange={(e) => set({ paid: e.target.value as '' | 'true' | 'false' })}
        >
          <option value="">{t('paidAll')}</option>
          <option value="true">{t('paidYes')}</option>
          <option value="false">{t('paidNo')}</option>
        </Select>
        <Select
          className="w-auto"
          value={filters.inactiveDays}
          onChange={(e) => set({ inactiveDays: e.target.value })}
        >
          <option value="">{t('activityAll')}</option>
          {[14, 30, 60].map((d) => (
            <option key={d} value={String(d)}>
              {t('inactiveFor', { days: d })}
            </option>
          ))}
        </Select>
        <Button type="submit" variant="secondary">
          {t('searchButton')}
        </Button>
      </form>
      <ApiErrorAlert error={usage.error} />
      <Table
        head={[t('columns.garage'), ...usageHead]}
        empty={usage.data?.items.length === 0 && t('noGarages')}
        loading={usage.isPending && tCommon('loading')}
      >
        {usage.data?.items.map((g) => (
          <tr key={g.id}>
            <GarageCell g={g} />
            <UsageCells g={g} />
          </tr>
        ))}
      </Table>
      <p className="text-xs text-muted">{t('usageNote')}</p>
      {usage.data && (
        <Pager
          page={page}
          pageSize={PAGE_SIZE}
          total={usage.data.total}
          totalText={t('garageCount', { count: usage.data.total })}
          onPage={setPage}
        />
      )}
    </div>
  );
}

function Failures() {
  const t = useTranslations('monitoring');
  const tCommon = useTranslations('common');
  const { dateTime } = useDates();
  const [page, setPage] = useState(1);
  const failures = useQuery({
    queryKey: ['monitoring', 'failures', page],
    queryFn: () =>
      api<Paginated<FailedMessage>>(
        `/admin/v1/monitoring/failures?page=${page}&pageSize=${PAGE_SIZE}`,
      ),
    placeholderData: keepPreviousData,
  });
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted">{t('failuresHint')}</p>
      <ApiErrorAlert error={failures.error} />
      <Table
        head={[t('columns.when'), t('columns.garage'), t('columns.message'), t('columns.error')]}
        empty={failures.data?.items.length === 0 && t('noFailures')}
        loading={failures.isPending && tCommon('loading')}
      >
        {failures.data?.items.map((f) => (
          <tr key={f.id}>
            <Td className="whitespace-nowrap text-muted">{dateTime(f.createdAt)}</Td>
            <Td>
              <Link href={`/garages/${f.garage.id}`} className="font-bold hover:underline">
                {f.garage.name}
              </Link>
            </Td>
            <Td>
              <span dir="ltr">
                {f.type} · {f.channel}
              </span>
            </Td>
            <Td className="text-bad-ink">{f.error ?? tCommon('none')}</Td>
          </tr>
        ))}
      </Table>
      {failures.data && (
        <Pager
          page={page}
          pageSize={PAGE_SIZE}
          total={failures.data.total}
          totalText={t('failureCount', { count: failures.data.total })}
          onPage={setPage}
        />
      )}
    </div>
  );
}
