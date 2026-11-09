'use client';

import {
  NOTIFICATION_CHANNELS,
  NOTIFICATION_STATUSES,
  type NotificationLogItem,
  type NotificationStatusName,
  type Paginated,
} from '@gearva/contracts';
import { Pill, Select } from '@gearva/ui';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useFormatter, useTranslations } from 'next-intl';
import { useState } from 'react';
import { ApiErrorAlert } from '@/components/api-error';
import { Pager } from '@/components/pager';
import { Link } from '@/i18n/navigation';
import { api } from '@/lib/api';

const PAGE_SIZE = 20;

const STATUS_TONES = {
  QUEUED: 'brand',
  SENT: 'ok',
  DELIVERED: 'ok',
  FAILED: 'bad',
  SKIPPED: 'soft',
} as const satisfies Record<NotificationStatusName, string>;

/**
 * flow.md 9.4: what was sent, on which channel, to whom, and whether it was sent or
 * failed. Owner and managers. The message content is never shown (an invite holds a link).
 */
export function NotificationLog() {
  const t = useTranslations('notificationLog');
  const tCommon = useTranslations('common');
  const format = useFormatter();
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState('');
  const [channel, setChannel] = useState('');

  const query = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE) });
  if (status) query.set('status', status);
  if (channel) query.set('channel', channel);
  const log = useQuery({
    queryKey: ['notifications', page, status, channel],
    queryFn: () => api<Paginated<NotificationLogItem>>(`/v1/notifications?${query.toString()}`),
    placeholderData: keepPreviousData,
  });
  const when = (iso: string) =>
    format.dateTime(new Date(iso), { dateStyle: 'medium', timeStyle: 'short' });

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <h1 className="text-2xl font-extrabold">{t('title')}</h1>

      <div className="grid grid-cols-2 gap-3 sm:max-w-md">
        <Select
          aria-label={t('status')}
          value={status}
          onChange={(e) => {
            setStatus(e.target.value);
            setPage(1);
          }}
        >
          <option value="">{t('allStatuses')}</option>
          {NOTIFICATION_STATUSES.map((s) => (
            <option key={s} value={s}>
              {t(`statuses.${s}`)}
            </option>
          ))}
        </Select>
        <Select
          aria-label={t('channel')}
          value={channel}
          onChange={(e) => {
            setChannel(e.target.value);
            setPage(1);
          }}
        >
          <option value="">{t('allChannels')}</option>
          {NOTIFICATION_CHANNELS.map((c) => (
            <option key={c} value={c}>
              {t(`channels.${c}`)}
            </option>
          ))}
        </Select>
      </div>

      <ApiErrorAlert error={log.error} />
      {log.isPending && <p className="text-sm text-muted">{tCommon('loading')}</p>}
      {log.data?.items.length === 0 && <p className="text-sm text-muted">{t('empty')}</p>}

      <ul className="divide-y divide-line rounded-xl border border-line bg-card">
        {log.data?.items.map((n) => (
          <li key={n.id} className="space-y-1 px-4 py-3 text-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-semibold">
                {t.has(`types.${n.type}`) ? t(`types.${n.type}`) : n.type}
                {n.to && (
                  <>
                    {' · '}
                    {n.to.kind === 'customer' ? (
                      <Link href={`/customers/${n.to.id}`} className="hover:underline">
                        {n.to.name}
                      </Link>
                    ) : (
                      n.to.name
                    )}
                  </>
                )}
              </span>
              <Pill tone={STATUS_TONES[n.status]}>{t(`statuses.${n.status}`)}</Pill>
            </div>
            <p className="text-muted">
              {t(`channels.${n.channel}`)}
              {n.recipient && (
                <>
                  {' · '}
                  <span dir="ltr">{n.recipient}</span>
                </>
              )}
              {' · '}
              {when(n.sentAt ?? n.createdAt)}
            </p>
            {n.status === 'QUEUED' && n.scheduledFor && (
              <p className="text-muted">{t('scheduledFor', { when: when(n.scheduledFor) })}</p>
            )}
            {n.error && <p className="text-bad-ink">{n.error}</p>}
          </li>
        ))}
      </ul>

      {log.data && (
        <Pager page={page} total={log.data.total} pageSize={PAGE_SIZE} onPage={setPage} />
      )}
    </div>
  );
}
