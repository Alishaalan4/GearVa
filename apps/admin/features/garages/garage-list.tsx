'use client';

import {
  GARAGE_STATUSES,
  type GarageListItem,
  type GarageStatus,
  type Paginated,
} from '@gearva/contracts';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useFormatter, useTranslations } from 'next-intl';
import { useState } from 'react';
import { ApiErrorAlert } from '@/components/api-error';
import { Button, Input, Select } from '@/components/ui';
import { Link, useRouter } from '@/i18n/navigation';
import { api } from '@/lib/api';
import { StatusBadge } from './status-badge';

const PAGE_SIZE = 20;

/** Admin garage list with search, status filter and pagination (flow.md 11.2). */
export function GarageList() {
  const t = useTranslations('garages');
  const tCommon = useTranslations('common');
  const tStatus = useTranslations('status');
  const format = useFormatter();
  const router = useRouter();
  const [page, setPage] = useState(1);
  const [draft, setDraft] = useState('');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<GarageStatus | ''>('');

  const params = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE) });
  if (search) params.set('q', search);
  if (status) params.set('status', status);

  const garages = useQuery({
    queryKey: ['garages', { page, search, status }],
    queryFn: () => api<Paginated<GarageListItem>>(`/admin/v1/garages?${params.toString()}`),
    placeholderData: keepPreviousData,
  });

  const pages = garages.data ? Math.max(1, Math.ceil(garages.data.total / PAGE_SIZE)) : 1;
  const date = (iso: string) => format.dateTime(new Date(iso), { dateStyle: 'medium' });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">{t('title')}</h1>
        <Link
          href="/garages/new"
          className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700"
        >
          {t('new')}
        </Link>
      </div>

      <form
        className="flex flex-wrap gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          setPage(1);
          setSearch(draft.trim());
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
          value={status}
          onChange={(e) => {
            setPage(1);
            setStatus(e.target.value as GarageStatus | '');
          }}
        >
          <option value="">{t('allStatuses')}</option>
          {GARAGE_STATUSES.map((s) => (
            <option key={s} value={s}>
              {tStatus(s)}
            </option>
          ))}
        </Select>
        <Button type="submit" variant="secondary">
          {t('searchButton')}
        </Button>
      </form>

      <ApiErrorAlert error={garages.error} />

      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-start text-xs uppercase text-slate-500">
            <tr>
              <th className="px-4 py-3 text-start font-medium">{t('columns.name')}</th>
              <th className="px-4 py-3 text-start font-medium">{t('columns.status')}</th>
              <th className="px-4 py-3 text-start font-medium">{t('columns.access')}</th>
              <th className="px-4 py-3 text-start font-medium">{t('columns.branches')}</th>
              <th className="px-4 py-3 text-start font-medium">{t('columns.created')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {garages.data?.items.map((g) => (
              <tr
                key={g.id}
                className="cursor-pointer hover:bg-slate-50"
                onClick={() => router.push(`/garages/${g.id}`)}
              >
                <td className="px-4 py-3">
                  <Link href={`/garages/${g.id}`} className="font-medium hover:underline">
                    {g.name}
                  </Link>
                  <div className="text-xs text-slate-500" dir="ltr">
                    {g.email}
                  </div>
                </td>
                <td className="px-4 py-3">
                  <StatusBadge status={g.status} />
                </td>
                <td className="px-4 py-3 text-slate-600">
                  {g.expiresAt
                    ? t('paidUntil', { date: date(g.expiresAt) })
                    : g.trialEndsAt
                      ? t('trialUntil', { date: date(g.trialEndsAt) })
                      : tCommon('none')}
                </td>
                <td className="px-4 py-3">{format.number(g.branchCount)}</td>
                <td className="px-4 py-3 text-slate-600">{date(g.createdAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {garages.data && garages.data.items.length === 0 && (
          <p className="p-6 text-center text-sm text-slate-500">{t('empty')}</p>
        )}
        {garages.isPending && (
          <p className="p-6 text-center text-sm text-slate-500">{tCommon('loading')}</p>
        )}
      </div>

      {garages.data && (
        <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-slate-600">
          <span>{t('total', { count: garages.data.total })}</span>
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
