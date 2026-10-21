'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import {
  type GarageDetail as Garage,
  type SuspendGarageInput,
  suspendGarageSchema,
} from '@gearva/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useFormatter, useTranslations } from 'next-intl';
import { type ReactNode, useState } from 'react';
import { useForm } from 'react-hook-form';
import type { z } from 'zod';
import { ApiErrorAlert } from '@/components/api-error';
import { Alert, Button, Card, Field, Textarea } from '@/components/ui';
import { Link } from '@/i18n/navigation';
import { ApiError, api, apiPost } from '@/lib/api';
import { StatusBadge } from './status-badge';

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-wrap justify-between gap-2 py-2 text-sm">
      <dt className="text-slate-500">{label}</dt>
      <dd className="font-medium">{children}</dd>
    </div>
  );
}

/** One garage: account details, owner access links, suspension, branches (flow.md 2.1, 11.1). */
export function GarageDetail({ garageId }: { garageId: string }) {
  const t = useTranslations('garageDetail');
  const tCommon = useTranslations('common');
  const tLocales = useTranslations('locales');
  const format = useFormatter();
  const queryClient = useQueryClient();
  const [notice, setNotice] = useState<string | null>(null);

  const garage = useQuery({
    queryKey: ['garage', garageId],
    queryFn: () => api<Garage>(`/admin/v1/garages/${garageId}`),
  });

  // Every action answers with the updated garage, so the page updates without a reload.
  const action = useMutation({
    mutationFn: ({ path, body }: { path: string; body?: unknown; done: string }) =>
      apiPost<Garage>(`/admin/v1/garages/${garageId}/${path}`, body),
    onMutate: () => setNotice(null),
    onSuccess: (updated, { done }) => {
      queryClient.setQueryData(['garage', garageId], updated);
      void queryClient.invalidateQueries({ queryKey: ['garages'] });
      setNotice(done);
    },
  });

  const suspendForm = useForm<z.input<typeof suspendGarageSchema>, unknown, SuspendGarageInput>({
    resolver: zodResolver(suspendGarageSchema),
    defaultValues: { reason: '' },
  });

  if (garage.isPending) return <p className="text-sm text-slate-500">{tCommon('loading')}</p>;
  if (garage.error) {
    const missing = garage.error instanceof ApiError && garage.error.status === 404;
    return missing ? <Alert>{t('notFound')}</Alert> : <ApiErrorAlert error={garage.error} />;
  }

  const g = garage.data;
  const date = (iso: string | null) =>
    iso ? format.dateTime(new Date(iso), { dateStyle: 'medium' }) : tCommon('none');
  const dateTime = (iso: string | null) =>
    iso ? format.dateTime(new Date(iso), { dateStyle: 'medium', timeStyle: 'short' }) : tCommon('none');

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Link href="/garages" className="text-sm text-slate-600 hover:text-slate-900">
          {t('backToList')}
        </Link>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold">{g.name}</h1>
          <StatusBadge status={g.status} />
        </div>
      </div>

      {notice && <Alert tone="success">{notice}</Alert>}
      <ApiErrorAlert error={action.error} />

      <div className="grid gap-6 lg:grid-cols-2">
        <Card title={t('overview')}>
          <dl className="divide-y divide-slate-100">
            <Row label={t('email')}>
              <span dir="ltr">{g.email}</span>
            </Row>
            <Row label={t('phone')}>
              <span dir="ltr">{g.phone}</span>
            </Row>
            <Row label={t('location')}>{g.locationText}</Row>
            <Row label={t('language')}>{tLocales(g.defaultLocale)}</Row>
            <Row label={t('timezone')}>
              <span dir="ltr">{g.timezone}</span>
            </Row>
            {g.trialEndsAt && <Row label={t('trialEnds')}>{date(g.trialEndsAt)}</Row>}
            {g.expiresAt && <Row label={t('paidUntil')}>{date(g.expiresAt)}</Row>}
            <Row label={t('createdAt')}>{date(g.createdAt)}</Row>
            <Row label={t('lastLogin')}>{dateTime(g.lastLoginAt)}</Row>
          </dl>
        </Card>

        <Card title={t('owner')}>
          {g.owner ? (
            <div className="space-y-4">
              <dl className="divide-y divide-slate-100">
                <Row label={t('owner')}>{g.owner.name}</Row>
                <Row label={t('email')}>
                  <span dir="ltr">{g.owner.email}</span>
                </Row>
                <Row label={t('lastLogin')}>{dateTime(g.owner.lastLoginAt)}</Row>
              </dl>
              <p className="text-sm text-slate-600">
                {g.owner.hasPassword ? t('passwordSet') : t('invitePending')}
                {g.owner.linkExpiresAt && (
                  <span className="block text-xs text-slate-500">
                    {t('linkExpires', { date: dateTime(g.owner.linkExpiresAt) })}
                  </span>
                )}
              </p>
              {g.owner.hasPassword ? (
                <Button
                  variant="secondary"
                  disabled={action.isPending}
                  onClick={() =>
                    action.mutate({
                      path: 'password-reset',
                      done: t('resetSent', { email: g.owner?.email ?? '' }),
                    })
                  }
                >
                  {t('sendReset')}
                </Button>
              ) : (
                <Button
                  variant="secondary"
                  disabled={action.isPending}
                  onClick={() =>
                    action.mutate({
                      path: 'invite',
                      done: t('inviteSent', { email: g.owner?.email ?? '' }),
                    })
                  }
                >
                  {t('resendInvite')}
                </Button>
              )}
            </div>
          ) : (
            <p className="text-sm text-slate-500">{t('noOwner')}</p>
          )}
        </Card>

        <Card title={t('suspension')}>
          {g.status === 'SUSPENDED' ? (
            <div className="space-y-3">
              <p className="text-sm">{t('suspendedSince', { date: dateTime(g.suspendedAt) })}</p>
              {g.suspendedReason && (
                <p className="text-sm text-slate-600">{t('reasonText', { reason: g.suspendedReason })}</p>
              )}
              <Button
                disabled={action.isPending}
                onClick={() => action.mutate({ path: 'reactivate', done: t('reactivated') })}
              >
                {t('reactivate')}
              </Button>
            </div>
          ) : (
            <form
              className="space-y-3"
              noValidate
              onSubmit={suspendForm.handleSubmit((values) => {
                action.mutate({ path: 'suspend', body: values, done: t('suspended') });
                suspendForm.reset();
              })}
            >
              <p className="text-sm text-slate-600">{t('suspendHint')}</p>
              <Field
                label={t('reasonLabel')}
                error={suspendForm.formState.errors.reason && t('reasonInvalid')}
              >
                <Textarea rows={2} {...suspendForm.register('reason')} />
              </Field>
              <Button type="submit" variant="danger" disabled={action.isPending}>
                {t('suspend')}
              </Button>
            </form>
          )}
        </Card>

        <Card title={t('branches')}>
          <ul className="divide-y divide-slate-100 text-sm">
            {g.branches.map((b) => (
              <li key={b.id} className="flex items-center justify-between gap-2 py-2">
                <span>
                  {b.name}{' '}
                  <span className="text-xs text-slate-500" dir="ltr">
                    {b.code}
                  </span>
                </span>
                <span className="text-xs text-slate-500">
                  {b.isMain && t('main')} {!b.isActive && t('inactive')}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </div>
  );
}
