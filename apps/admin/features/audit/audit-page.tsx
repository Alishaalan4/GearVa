'use client';

import {
  AUDIT_ACTOR_TYPES,
  type AccessLogItem,
  type AuditLogItem,
  type Paginated,
} from '@gearva/contracts';
import { Alert, Button, Input, Select } from '@gearva/ui';
import { useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { ApiErrorAlert } from '@/components/api-error';
import { Pager } from '@/components/pager';
import { Table, Td } from '@/components/table';
import { useAdmin } from '@/features/auth/use-admin';
import { api } from '@/lib/api';
import { useDates } from '@/lib/format';

const TABS = ['actions', 'access'] as const;
type Tab = (typeof TABS)[number];

interface Filters {
  actorType: string;
  q: string;
  from: string;
  to: string;
}

/**
 * flow.md 11.10 (step 5.10): the audit log, super admins only. Every recorded action of
 * admins, garage staff, car owners and Gearva's own jobs, and the "View as" access log.
 * A garage's page links here with ?garageId= to show that garage only.
 */
export function AuditPage() {
  const t = useTranslations('audit');
  const admin = useAdmin();
  const params = useSearchParams();
  const garageId = params.get('garageId') ?? '';
  const [tab, setTab] = useState<Tab>('actions');
  if (!admin.data) return null;
  if (admin.data.role !== 'SUPER_ADMIN') return <Alert>{t('superOnly')}</Alert>;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-extrabold">{t('title')}</h1>
        <p className="text-sm text-muted">{t('lead')}</p>
      </div>
      <div className="flex flex-wrap gap-2" role="tablist">
        {TABS.map((name) => (
          <Button
            key={name}
            role="tab"
            aria-selected={tab === name}
            variant={tab === name ? 'primary' : 'secondary'}
            onClick={() => setTab(name)}
          >
            {t(`tabs.${name}`)}
          </Button>
        ))}
      </div>
      {garageId && <p className="text-xs text-muted">{t('oneGarage')}</p>}
      {tab === 'actions' ? <ActionsTab garageId={garageId} /> : <AccessTab garageId={garageId} />}
    </div>
  );
}

/** Who, what, from and to: applied when the form is sent. */
function FilterForm({
  withActor,
  onApply,
}: {
  withActor: boolean;
  onApply: (filters: Filters) => void;
}) {
  const t = useTranslations('audit');
  const [values, setValues] = useState<Filters>({ actorType: '', q: '', from: '', to: '' });
  const set = (key: keyof Filters) => (e: { target: { value: string } }) =>
    setValues({ ...values, [key]: e.target.value });
  return (
    <form
      className="flex flex-wrap items-end gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        onApply({ ...values, q: values.q.trim() });
      }}
    >
      {withActor && (
        <>
          <Select className="w-44" value={values.actorType} onChange={set('actorType')}>
            <option value="">{t('allActors')}</option>
            {AUDIT_ACTOR_TYPES.map((type) => (
              <option key={type} value={type}>
                {t(`actors.${type}`)}
              </option>
            ))}
          </Select>
          <Input
            className="w-56"
            placeholder={t('searchAction')}
            dir="ltr"
            value={values.q}
            onChange={set('q')}
          />
        </>
      )}
      <label className="text-xs text-muted">
        {t('from')}
        <Input type="date" className="w-40" value={values.from} onChange={set('from')} />
      </label>
      <label className="text-xs text-muted">
        {t('to')}
        <Input type="date" className="w-40" value={values.to} onChange={set('to')} />
      </label>
      <Button type="submit" variant="secondary">
        {t('apply')}
      </Button>
    </form>
  );
}

function queryString(page: number, garageId: string, filters: Partial<Filters>): string {
  const params = new URLSearchParams({ page: String(page), pageSize: '50' });
  if (garageId) params.set('garageId', garageId);
  for (const [key, value] of Object.entries(filters)) if (value) params.set(key, value);
  return params.toString();
}

function ActionsTab({ garageId }: { garageId: string }) {
  const t = useTranslations('audit');
  const { dateTime } = useDates();
  const [filters, setFilters] = useState<Filters>({ actorType: '', q: '', from: '', to: '' });
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState<string | null>(null);
  const rows = useQuery({
    queryKey: ['audit', garageId, filters, page],
    queryFn: () =>
      api<Paginated<AuditLogItem>>(`/admin/v1/audit?${queryString(page, garageId, filters)}`),
  });

  return (
    <div className="space-y-4">
      <FilterForm
        withActor
        onApply={(next) => {
          setPage(1);
          setFilters(next);
        }}
      />
      <ApiErrorAlert error={rows.error} />
      <Table
        head={[t('cols.when'), t('cols.who'), t('cols.action'), t('cols.garage'), '']}
        loading={rows.isPending && t('loading')}
        empty={rows.data?.total === 0 && t('empty')}
      >
        {rows.data?.items.map((r) => (
          <ActionRow
            key={r.id}
            row={r}
            when={dateTime(r.createdAt)}
            open={open === r.id}
            onToggle={() => setOpen(open === r.id ? null : r.id)}
          />
        ))}
      </Table>
      {rows.data && (
        <Pager
          page={page}
          pageSize={rows.data.pageSize}
          total={rows.data.total}
          totalText={t('total', { count: rows.data.total })}
          onPage={setPage}
        />
      )}
    </div>
  );
}

function ActionRow({
  row,
  when,
  open,
  onToggle,
}: {
  row: AuditLogItem;
  when: string;
  open: boolean;
  onToggle: () => void;
}) {
  const t = useTranslations('audit');
  const hasChanges = row.before != null || row.after != null;
  return (
    <>
      <tr>
        <Td className="whitespace-nowrap text-xs text-muted">{when}</Td>
        <Td>
          <p className="font-medium">{row.actor?.name ?? t(`actors.${row.actorType}`)}</p>
          <p className="text-xs text-muted">
            {t(`actors.${row.actorType}`)}
            {row.actor?.email && (
              <>
                {' · '}
                <span dir="ltr">{row.actor.email}</span>
              </>
            )}
          </p>
        </Td>
        <Td>
          <p className="font-mono text-xs" dir="ltr">
            {row.action}
          </p>
          <p className="text-xs text-muted" dir="ltr">
            {row.entityType}
          </p>
        </Td>
        <Td className="text-xs">{row.garage?.name ?? '—'}</Td>
        <Td>
          <Button variant="secondary" onClick={onToggle}>
            {open ? t('close') : t('details')}
          </Button>
        </Td>
      </tr>
      {open && (
        <tr>
          <td colSpan={5}>
            <div className="space-y-2 bg-soft px-4 py-4 text-xs">
              <p>
                {t('record')}:{' '}
                <span className="font-mono" dir="ltr">
                  {row.entityType} {row.entityId ?? '—'}
                </span>
              </p>
              <p>
                {t('ip')}:{' '}
                <span className="font-mono" dir="ltr">
                  {row.ip ?? '—'}
                </span>
              </p>
              {hasChanges ? (
                <div className="grid gap-3 sm:grid-cols-2">
                  <JsonBlock label={t('before')} value={row.before} />
                  <JsonBlock label={t('after')} value={row.after} />
                </div>
              ) : (
                <p className="text-muted">{t('noChanges')}</p>
              )}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

function JsonBlock({ label, value }: { label: string; value: unknown }) {
  return (
    <div>
      <p className="mb-1 font-medium">{label}</p>
      <pre
        dir="ltr"
        className="max-h-64 overflow-auto whitespace-pre-wrap break-all rounded-lg border border-line bg-surface p-2"
      >
        {value == null ? '—' : JSON.stringify(value, null, 2)}
      </pre>
    </div>
  );
}

function AccessTab({ garageId }: { garageId: string }) {
  const t = useTranslations('audit');
  const { dateTime } = useDates();
  const [filters, setFilters] = useState<Partial<Filters>>({});
  const [page, setPage] = useState(1);
  const rows = useQuery({
    queryKey: ['audit', 'access', garageId, filters, page],
    queryFn: () =>
      api<Paginated<AccessLogItem>>(
        `/admin/v1/audit/access?${queryString(page, garageId, filters)}`,
      ),
  });

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted">{t('accessLead')}</p>
      <FilterForm
        withActor={false}
        onApply={(next) => {
          setPage(1);
          setFilters({ from: next.from, to: next.to });
        }}
      />
      <ApiErrorAlert error={rows.error} />
      <Table
        head={[t('cols.when'), t('cols.admin'), t('cols.garage'), t('cols.page')]}
        loading={rows.isPending && t('loading')}
        empty={rows.data?.total === 0 && t('empty')}
      >
        {rows.data?.items.map((r) => (
          <tr key={r.id}>
            <Td className="whitespace-nowrap text-xs text-muted">{dateTime(r.createdAt)}</Td>
            <Td>{r.admin.name}</Td>
            <Td className="text-xs">{r.garage.name}</Td>
            <Td>
              <p className="text-xs">{t(`accessActions.${r.action}`)}</p>
              {r.path && (
                <p className="font-mono text-xs text-muted" dir="ltr">
                  {r.path}
                </p>
              )}
            </Td>
          </tr>
        ))}
      </Table>
      {rows.data && (
        <Pager
          page={page}
          pageSize={rows.data.pageSize}
          total={rows.data.total}
          totalText={t('total', { count: rows.data.total })}
          onPage={setPage}
        />
      )}
    </div>
  );
}
