'use client';

import {
  APPLICATION_STATUSES,
  type ApplicationListItem,
  type ApplicationStatus,
  type Paginated,
} from '@gearva/contracts';
import { Button, Input, Pill, Select } from '@gearva/ui';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { ApiErrorAlert } from '@/components/api-error';
import { Pager } from '@/components/pager';
import { Table, Td } from '@/components/table';
import { Link, useRouter } from '@/i18n/navigation';
import { api } from '@/lib/api';
import { useDates } from '@/lib/format';

const PAGE_SIZE = 20;

export function ApplicationStatusPill({ status }: { status: ApplicationStatus }) {
  const t = useTranslations('applications.status');
  const tone = status === 'NEW' ? 'brand' : status === 'APPROVED' ? 'ok' : 'soft';
  return <Pill tone={tone}>{t(status)}</Pill>;
}

/** flow.md 11.6 item 2: applications from the website, new first. */
export function ApplicationList() {
  const t = useTranslations('applications');
  const tCommon = useTranslations('common');
  const { date } = useDates();
  const router = useRouter();
  const [page, setPage] = useState(1);
  const [draft, setDraft] = useState('');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<ApplicationStatus | ''>('');

  const params = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE) });
  if (search) params.set('q', search);
  if (status) params.set('status', status);
  const list = useQuery({
    queryKey: ['applications', { page, search, status }],
    queryFn: () =>
      api<Paginated<ApplicationListItem>>(`/admin/v1/applications?${params.toString()}`),
    placeholderData: keepPreviousData,
  });

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-extrabold">{t('title')}</h1>
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
            setStatus(e.target.value as ApplicationStatus | '');
          }}
        >
          <option value="">{t('allStatuses')}</option>
          {APPLICATION_STATUSES.map((s) => (
            <option key={s} value={s}>
              {t(`status.${s}`)}
            </option>
          ))}
        </Select>
        <Button type="submit" variant="secondary">
          {t('searchButton')}
        </Button>
      </form>

      <ApiErrorAlert error={list.error} />
      <Table
        head={[
          t('columns.garage'),
          t('columns.contact'),
          t('columns.city'),
          t('columns.status'),
          t('columns.received'),
        ]}
        empty={list.data?.items.length === 0 && t('empty')}
        loading={list.isPending && tCommon('loading')}
      >
        {list.data?.items.map((a) => (
          <tr
            key={a.id}
            className="cursor-pointer hover:bg-soft"
            onClick={() => router.push(`/applications/${a.id}`)}
          >
            <Td>
              <Link href={`/applications/${a.id}`} className="font-bold hover:underline">
                {a.garageName}
              </Link>
              <div className="text-xs text-muted">{t('branches', { count: a.branchCount })}</div>
            </Td>
            <Td>
              {a.ownerName}
              <div className="text-xs text-muted" dir="ltr">
                {a.email} · {a.phone}
              </div>
            </Td>
            <Td>{a.city}</Td>
            <Td>
              <ApplicationStatusPill status={a.status} />
            </Td>
            <Td className="text-muted">{date(a.createdAt)}</Td>
          </tr>
        ))}
      </Table>
      {list.data && (
        <Pager
          page={page}
          pageSize={PAGE_SIZE}
          total={list.data.total}
          totalText={t('total', { count: list.data.total })}
          onPage={setPage}
        />
      )}
    </div>
  );
}
