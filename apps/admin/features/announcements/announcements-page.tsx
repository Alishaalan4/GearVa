'use client';

import {
  ANNOUNCEMENT_BODY_MAX,
  ANNOUNCEMENT_TITLE_MAX,
  type AnnouncementDetail,
  type AnnouncementItem,
  type CreateAnnouncementInput,
  GARAGE_STATUSES,
  type GarageListItem,
  type GarageStatus,
  type Paginated,
} from '@gearva/contracts';
import { Alert, Button, Card, Field, Input, Textarea } from '@gearva/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { ApiErrorAlert } from '@/components/api-error';
import { Pager } from '@/components/pager';
import { useAdmin } from '@/features/auth/use-admin';
import { api, apiPost } from '@/lib/api';
import { useDates } from '@/lib/format';

/**
 * flow.md 11.9 (step 5.10): messages from Gearva to garages, super admins only. A banner
 * at the top of garage-web for every staff member until they close it (or until the last
 * day), and an email to each garage owner if chosen.
 */
export function AnnouncementsPage() {
  const t = useTranslations('announcements');
  const admin = useAdmin();
  const queryClient = useQueryClient();
  const [notice, setNotice] = useState<string | null>(null);
  const [writing, setWriting] = useState(false);
  if (!admin.data) return null;
  if (admin.data.role !== 'SUPER_ADMIN') return <Alert>{t('superOnly')}</Alert>;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-extrabold">{t('title')}</h1>
        <p className="text-sm text-muted">{t('lead')}</p>
      </div>
      {notice && <Alert tone="success">{notice}</Alert>}
      {writing ? (
        <NewMessage
          onSent={(sent) => {
            setWriting(false);
            void queryClient.invalidateQueries({ queryKey: ['announcements'] });
            setNotice(t('sent', { garages: sent.garages }));
          }}
          onCancel={() => setWriting(false)}
        />
      ) : (
        <Button
          onClick={() => {
            setNotice(null);
            setWriting(true);
          }}
        >
          {t('write')}
        </Button>
      )}
      <SentList />
    </div>
  );
}

const DEFAULT_STATUSES: GarageStatus[] = ['TRIAL', 'ACTIVE'];

function NewMessage({
  onSent,
  onCancel,
}: {
  onSent: (sent: AnnouncementDetail) => void;
  onCancel: () => void;
}) {
  const t = useTranslations('announcements');
  const tStatus = useTranslations('status');
  const tCommon = useTranslations('common');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [kind, setKind] = useState<'STATUS' | 'SELECTED'>('STATUS');
  const [statuses, setStatuses] = useState<GarageStatus[]>(DEFAULT_STATUSES);
  const [picked, setPicked] = useState<Map<string, string>>(new Map());
  const [sendEmail, setSendEmail] = useState(true);
  const [showUntil, setShowUntil] = useState('');

  const send = useMutation({
    mutationFn: () => {
      const input: CreateAnnouncementInput = {
        title: title.trim(),
        body: body.trim(),
        audience: kind === 'STATUS' ? { kind, statuses } : { kind, garageIds: [...picked.keys()] },
        sendEmail,
        showUntil: showUntil || null,
      };
      return apiPost<AnnouncementDetail>('/admin/v1/announcements', input);
    },
    onSuccess: onSent,
  });

  const ready =
    title.trim().length >= 3 &&
    body.trim().length >= 3 &&
    (kind === 'STATUS' ? statuses.length > 0 : picked.size > 0);
  const toggleStatus = (status: GarageStatus) =>
    setStatuses(
      statuses.includes(status) ? statuses.filter((s) => s !== status) : [...statuses, status],
    );

  return (
    <Card title={t('write')}>
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (ready) send.mutate();
        }}
      >
        <Field label={t('titleLabel')} hint={t('languageHint')}>
          <Input
            value={title}
            maxLength={ANNOUNCEMENT_TITLE_MAX}
            onChange={(e) => setTitle(e.target.value)}
          />
        </Field>
        <Field label={t('bodyLabel')}>
          <Textarea
            rows={5}
            value={body}
            maxLength={ANNOUNCEMENT_BODY_MAX}
            onChange={(e) => setBody(e.target.value)}
          />
        </Field>

        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">{t('to')}</legend>
          <div className="flex flex-wrap gap-4 text-sm">
            <label className="flex items-center gap-2">
              <input
                type="radio"
                name="audience"
                checked={kind === 'STATUS'}
                onChange={() => setKind('STATUS')}
              />
              {t('byStatus')}
            </label>
            <label className="flex items-center gap-2">
              <input
                type="radio"
                name="audience"
                checked={kind === 'SELECTED'}
                onChange={() => setKind('SELECTED')}
              />
              {t('chosen')}
            </label>
          </div>
          {kind === 'STATUS' ? (
            <div className="flex flex-wrap gap-4 text-sm">
              {GARAGE_STATUSES.map((status) => (
                <label key={status} className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={statuses.includes(status)}
                    onChange={() => toggleStatus(status)}
                  />
                  {tStatus(status)}
                </label>
              ))}
            </div>
          ) : (
            <GaragePicker picked={picked} onChange={setPicked} />
          )}
        </fieldset>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={sendEmail}
              onChange={(e) => setSendEmail(e.target.checked)}
            />
            {t('sendEmail')}
          </label>
          <Field label={t('showUntil')} hint={t('showUntilHint')}>
            <Input type="date" value={showUntil} onChange={(e) => setShowUntil(e.target.value)} />
          </Field>
        </div>

        <ApiErrorAlert error={send.error} />
        <div className="flex flex-wrap gap-2">
          <Button type="submit" disabled={send.isPending || !ready}>
            {t('send')}
          </Button>
          <Button type="button" variant="secondary" onClick={onCancel}>
            {tCommon('cancel')}
          </Button>
        </div>
      </form>
    </Card>
  );
}

/** Search garages by name or email and tick the ones that get the message. */
function GaragePicker({
  picked,
  onChange,
}: {
  picked: Map<string, string>;
  onChange: (next: Map<string, string>) => void;
}) {
  const t = useTranslations('announcements');
  const tStatus = useTranslations('status');
  const [search, setSearch] = useState('');
  const [q, setQ] = useState('');
  const garages = useQuery({
    queryKey: ['garages', 'picker', q],
    queryFn: () =>
      api<Paginated<GarageListItem>>(
        `/admin/v1/garages?pageSize=50${q ? `&q=${encodeURIComponent(q)}` : ''}`,
      ),
  });
  const toggle = (g: GarageListItem) => {
    const next = new Map(picked);
    if (next.has(g.id)) next.delete(g.id);
    else next.set(g.id, g.name);
    onChange(next);
  };
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        <Input
          className="w-64"
          placeholder={t('searchGarages')}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              setQ(search.trim());
            }
          }}
        />
        <Button type="button" variant="secondary" onClick={() => setQ(search.trim())}>
          {t('search')}
        </Button>
      </div>
      {picked.size > 0 && (
        <p className="text-xs text-muted">
          {t('picked', { count: picked.size })}: {[...picked.values()].join(', ')}
        </p>
      )}
      <ApiErrorAlert error={garages.error} />
      <ul className="max-h-60 divide-y divide-line overflow-auto rounded-lg border border-line text-sm">
        {garages.data?.items.map((g) => (
          <li key={g.id}>
            <label className="flex items-center gap-2 px-3 py-2">
              <input type="checkbox" checked={picked.has(g.id)} onChange={() => toggle(g)} />
              <span className="flex-1">{g.name}</span>
              <span className="text-xs text-muted">{tStatus(g.status)}</span>
            </label>
          </li>
        ))}
      </ul>
    </div>
  );
}

function SentList() {
  const t = useTranslations('announcements');
  const { dateTime, date } = useDates();
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const sent = useQuery({
    queryKey: ['announcements', page],
    queryFn: () => api<Paginated<AnnouncementItem>>(`/admin/v1/announcements?page=${page}`),
  });
  const end = useMutation({
    mutationFn: (id: string) => apiPost<AnnouncementDetail>(`/admin/v1/announcements/${id}/end`),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['announcements'] }),
  });

  return (
    <Card title={t('sentTitle')}>
      <div className="space-y-3">
        <ApiErrorAlert error={sent.error ?? end.error} />
        {sent.isPending && <p className="text-sm text-muted">{t('loading')}</p>}
        {sent.data?.total === 0 && <p className="text-sm text-muted">{t('none')}</p>}
        <ul className="divide-y divide-line">
          {sent.data?.items.map((m) => (
            <li key={m.id} className="space-y-1 py-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="font-medium">{m.title}</p>
                  <p className="text-xs text-muted">
                    {dateTime(m.createdAt)} · {m.sentBy.name}
                  </p>
                </div>
                {m.showing && (
                  <Button
                    variant="secondary"
                    disabled={end.isPending}
                    onClick={() => end.mutate(m.id)}
                  >
                    {t('takeDown')}
                  </Button>
                )}
              </div>
              <p className="whitespace-pre-line text-sm">{m.body}</p>
              <p className="text-xs text-muted">
                {[
                  t('garages', { count: m.garages }),
                  m.showing
                    ? m.showUntil
                      ? t('showingUntil', { date: date(m.showUntil) })
                      : t('showing')
                    : t('ended'),
                  t('closedBy', { count: m.dismissals }),
                  m.emailSent
                    ? t('emails', {
                        sent: m.emails.sent,
                        queued: m.emails.queued,
                        failed: m.emails.failed,
                      })
                    : t('noEmail'),
                ].join(' · ')}
              </p>
            </li>
          ))}
        </ul>
        {sent.data && (
          <Pager
            page={page}
            pageSize={sent.data.pageSize}
            total={sent.data.total}
            totalText={t('total', { count: sent.data.total })}
            onPage={setPage}
          />
        )}
      </div>
    </Card>
  );
}
