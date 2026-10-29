'use client';

import type { DistanceUnit, HistoryItem, Paginated } from '@gearva/contracts';
import { Button } from '@gearva/ui';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useFormatter, useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';
import { ApiErrorAlert } from '@/components/api-error';
import { api } from '@/lib/api';
import { calendarDate, useDistance, useMoney } from '@/lib/format';

const PAGE_SIZE = 10;

/** The service history timeline of a car, newest first (database.md 8). */
export function ServiceHistory({ vehicleId, unit }: { vehicleId: string; unit: DistanceUnit }) {
  const t = useTranslations('history');
  const tCommon = useTranslations('common');
  const locale = useLocale();
  const format = useFormatter();
  const money = useMoney();
  const distance = useDistance();
  const [page, setPage] = useState(1);

  const history = useQuery({
    queryKey: ['history', vehicleId, page],
    queryFn: () =>
      api<Paginated<HistoryItem>>(
        `/v1/vehicles/${vehicleId}/history?page=${page}&pageSize=${PAGE_SIZE}`,
      ),
    placeholderData: keepPreviousData,
  });
  const pages = history.data ? Math.max(1, Math.ceil(history.data.total / PAGE_SIZE)) : 1;

  return (
    <section className="space-y-3">
      <h2 className="text-lg font-semibold">{t('title')}</h2>
      <ApiErrorAlert error={history.error} />
      {history.isPending && <p className="text-sm text-slate-500">{tCommon('loading')}</p>}
      {history.data?.items.length === 0 && <p className="text-sm text-slate-500">{t('empty')}</p>}

      <ol className="space-y-2 border-s-2 border-slate-200 ps-4">
        {history.data?.items.map((r) => {
          const name =
            r.customName ?? (locale === 'ar' ? r.serviceType.nameAr : r.serviceType.nameEn);
          const next = [
            r.nextDueKm !== null ? distance(r.nextDueKm, unit) : null,
            r.nextDueDate
              ? format.dateTime(calendarDate(r.nextDueDate), { dateStyle: 'medium' })
              : null,
          ].filter(Boolean);
          return (
            <li key={r.id} className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="font-medium">{name}</span>
                <span className="text-sm text-slate-500">
                  {format.dateTime(new Date(r.performedAt), { dateStyle: 'medium' })}
                </span>
              </div>
              <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate-600">
                <span>{t('at', { value: distance(r.odometerKm, unit) })}</span>
                <span>{money(r.totalCents)}</span>
                {next.length > 0 && <span>{t('nextDue', { value: next.join(' · ') })}</span>}
                <span className="text-slate-400">
                  {t('branch', { code: r.visit.branchCode })} · {r.mechanic.name}
                </span>
                {r.visit.status !== 'DONE' && (
                  <span className="rounded bg-amber-100 px-2 text-xs text-amber-800">
                    {t(`status.${r.visit.status}`)}
                  </span>
                )}
              </div>
              {r.notes && <p className="mt-1 text-sm text-slate-500">{r.notes}</p>}
            </li>
          );
        })}
      </ol>

      {pages > 1 && (
        <div className="flex items-center justify-end gap-2 text-sm text-slate-600">
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
      )}
    </section>
  );
}
