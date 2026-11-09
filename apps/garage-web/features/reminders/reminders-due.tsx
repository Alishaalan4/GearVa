'use client';

import type { DueReminderItem, MarkWhatsappSentResponse, Paginated } from '@gearva/contracts';
import { Button, Pill, buttonClass } from '@gearva/ui';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useFormatter, useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';
import { ApiErrorAlert } from '@/components/api-error';
import { Pager } from '@/components/pager';
import { Link } from '@/i18n/navigation';
import { api, apiPost } from '@/lib/api';
import { calendarDate, useDistance } from '@/lib/format';

const PAGE_SIZE = 20;

/**
 * flow.md 9.5: due reminders that email has not reached. "Send on WhatsApp" opens the
 * message already written; "Mark as sent" then counts it, so it leaves the list.
 */
export function RemindersDue() {
  const t = useTranslations('reminders');
  const tCommon = useTranslations('common');
  const [page, setPage] = useState(1);

  const due = useQuery({
    queryKey: ['reminders-due', page],
    queryFn: () =>
      api<Paginated<DueReminderItem>>(`/v1/reminders/due?page=${page}&pageSize=${PAGE_SIZE}`),
    placeholderData: keepPreviousData,
  });

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div>
        <h1 className="text-2xl font-extrabold">{t('title')}</h1>
        <p className="text-sm text-muted">{t('intro')}</p>
      </div>

      <ApiErrorAlert error={due.error} />
      {due.isPending && <p className="text-sm text-muted">{tCommon('loading')}</p>}
      {due.data?.items.length === 0 && <p className="text-sm text-muted">{t('empty')}</p>}
      {due.data && due.data.total > 0 && (
        <p className="text-sm text-muted">{t('count', { count: due.data.total })}</p>
      )}

      <ul className="space-y-3">
        {due.data?.items.map((item) => (
          <li key={`${item.reminderId}:${item.round}`}>
            <DueCard item={item} />
          </li>
        ))}
      </ul>

      {due.data && (
        <Pager page={page} total={due.data.total} pageSize={PAGE_SIZE} onPage={setPage} />
      )}
    </div>
  );
}

function DueCard({ item }: { item: DueReminderItem }) {
  const t = useTranslations('reminders');
  const locale = useLocale();
  const format = useFormatter();
  const distance = useDistance();
  const queryClient = useQueryClient();
  const [opened, setOpened] = useState(false);

  const markSent = useMutation({
    mutationFn: () =>
      apiPost<MarkWhatsappSentResponse>(`/v1/reminders/${item.reminderId}/whatsapp-sent`, {
        round: item.round,
      }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['reminders-due'] }),
  });

  const service = item.serviceName[locale === 'ar' ? 'ar' : 'en'];
  const day = (date: string) => format.dateTime(calendarDate(date), { dateStyle: 'medium' });
  const km = item.dueKm === null ? null : distance(item.dueKm, item.vehicle.distanceUnit);
  const date = item.dueDate === null ? null : day(item.dueDate);
  const due =
    km && date
      ? t('dueAtOrOn', { km, date })
      : km
        ? t('dueAt', { km })
        : date
          ? t('dueOn', { date })
          : null;

  return (
    <div className="space-y-3 rounded-xl border border-line bg-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <Link href={`/customers/${item.customer.id}`} className="hover:underline">
          <p className="font-bold">{item.customer.name}</p>
          <p className="text-sm text-muted" dir="ltr">
            {item.customer.phone}
          </p>
        </Link>
        <div className="flex flex-wrap gap-1.5 text-xs">
          <Pill tone={item.round > 1 ? 'brand' : 'soft'}>
            {item.round > 1 ? t('followUp', { number: item.round - 1 }) : t('firstReminder')}
          </Pill>
          {item.emailFailed && <Pill tone="bad">{t('emailFailed')}</Pill>}
        </div>
      </div>

      <div className="text-sm">
        <Link href={`/vehicles/${item.vehicle.id}`} className="font-semibold hover:underline">
          <span dir="ltr">{item.vehicle.plate}</span> · {item.vehicle.make} {item.vehicle.model}
        </Link>
        <p className="mt-1">
          <span className="font-semibold">{t(`kinds.${item.kind}`, { service })}</span>
          {due && <span className="text-soft-ink"> · {due}</span>}
        </p>
        {item.kind === 'SERVICE_DUE' && (
          <p className="text-muted">
            {t('estimated', { km: distance(item.estimatedKm, item.vehicle.distanceUnit) })}
          </p>
        )}
      </div>

      <ApiErrorAlert error={markSent.error} />
      <div className="flex flex-wrap gap-2">
        <a
          href={item.whatsappUrl}
          target="_blank"
          rel="noopener noreferrer"
          className={buttonClass(opened ? 'secondary' : 'primary')}
          onClick={() => setOpened(true)}
        >
          {t('sendWhatsapp')}
        </a>
        <Button
          type="button"
          variant={opened ? 'primary' : 'secondary'}
          disabled={markSent.isPending}
          onClick={() => markSent.mutate()}
        >
          {t('markSent')}
        </Button>
      </div>
    </div>
  );
}
