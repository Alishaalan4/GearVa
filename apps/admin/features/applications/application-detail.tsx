'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import {
  type ApplicationDetail as Application,
  type RejectApplicationInput,
  rejectApplicationSchema,
} from '@gearva/contracts';
import { Alert, Button, Card, Field, Textarea, buttonClass } from '@gearva/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import { useForm } from 'react-hook-form';
import type { z } from 'zod';
import { ApiErrorAlert } from '@/components/api-error';
import { Link } from '@/i18n/navigation';
import { ApiError, api, apiPost } from '@/lib/api';
import { useDates } from '@/lib/format';
import { ApplicationStatusPill } from './application-list';

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-wrap justify-between gap-2 py-2 text-sm">
      <dt className="text-muted">{label}</dt>
      <dd className="font-medium">{children}</dd>
    </div>
  );
}

export function useApplication(id: string) {
  return useQuery({
    queryKey: ['application', id],
    queryFn: () => api<Application>(`/admin/v1/applications/${id}`),
  });
}

/** flow.md 11.6: one application, its earlier ones, and approve or reject. */
export function ApplicationDetail({ id }: { id: string }) {
  const t = useTranslations('applications');
  const tCommon = useTranslations('common');
  const { date, dateTime } = useDates();
  const queryClient = useQueryClient();
  const application = useApplication(id);

  const form = useForm<z.input<typeof rejectApplicationSchema>, unknown, RejectApplicationInput>({
    resolver: zodResolver(rejectApplicationSchema),
    defaultValues: { reason: '' },
  });
  const reject = useMutation({
    mutationFn: (body: RejectApplicationInput) =>
      apiPost<Application>(`/admin/v1/applications/${id}/reject`, body),
    onSuccess: (updated) => {
      queryClient.setQueryData(['application', id], updated);
      void queryClient.invalidateQueries({ queryKey: ['applications'] });
    },
  });

  if (application.isPending) return <p className="text-sm text-muted">{tCommon('loading')}</p>;
  if (application.error) {
    const missing = application.error instanceof ApiError && application.error.status === 404;
    return missing ? <Alert>{t('notFound')}</Alert> : <ApiErrorAlert error={application.error} />;
  }
  const a = application.data;

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Link href="/applications" className="text-sm text-muted hover:text-ink">
          {t('backToList')}
        </Link>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-extrabold">{a.garageName}</h1>
          <ApplicationStatusPill status={a.status} />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card title={t('details')}>
          <dl className="divide-y divide-line">
            <Row label={t('fields.ownerName')}>{a.ownerName}</Row>
            <Row label={t('fields.email')}>
              <span dir="ltr">{a.email}</span>
            </Row>
            <Row label={t('fields.phone')}>
              <span dir="ltr">{a.phone}</span>
            </Row>
            <Row label={t('fields.city')}>{a.city}</Row>
            <Row label={t('fields.branchCount')}>{a.branchCount}</Row>
            <Row label={t('fields.received')}>{dateTime(a.createdAt)}</Row>
          </dl>
          {a.message && (
            <p className="mt-3 whitespace-pre-line rounded-[10px] bg-soft p-3 text-sm">
              {a.message}
            </p>
          )}
        </Card>

        <Card title={t('decision')}>
          {a.status === 'NEW' ? (
            <div className="space-y-5">
              <div className="space-y-2">
                <p className="text-sm text-muted">{t('approveHint')}</p>
                <Link href={`/applications/${a.id}/approve`} className={buttonClass()}>
                  {t('approve')}
                </Link>
              </div>
              <form
                className="space-y-3 border-t border-line pt-4"
                noValidate
                onSubmit={form.handleSubmit((values) => reject.mutate(values))}
              >
                <Field
                  label={t('rejectReason')}
                  error={form.formState.errors.reason && t('rejectReasonInvalid')}
                >
                  <Textarea rows={2} {...form.register('reason')} />
                </Field>
                <ApiErrorAlert error={reject.error} />
                <Button type="submit" variant="danger" disabled={reject.isPending}>
                  {t('reject')}
                </Button>
              </form>
            </div>
          ) : (
            <dl className="divide-y divide-line">
              <Row label={t('reviewedBy')}>{a.reviewedBy?.name ?? tCommon('none')}</Row>
              <Row label={t('reviewedAt')}>{dateTime(a.reviewedAt)}</Row>
              {a.rejectReason && <Row label={t('rejectReason')}>{a.rejectReason}</Row>}
              {a.garageId && (
                <Row label={t('garage')}>
                  <Link href={`/garages/${a.garageId}`} className="underline">
                    {t('openGarage')}
                  </Link>
                </Row>
              )}
            </dl>
          )}
        </Card>

        <Card title={t('earlier')} className="lg:col-span-2">
          {a.earlier.length === 0 ? (
            <p className="text-sm text-muted">{t('noEarlier')}</p>
          ) : (
            <ul className="divide-y divide-line text-sm">
              {a.earlier.map((e) => (
                <li key={e.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <Link href={`/applications/${e.id}`} className="font-semibold hover:underline">
                    {e.garageName}
                  </Link>
                  <span className="flex items-center gap-2 text-muted">
                    {date(e.createdAt)} <ApplicationStatusPill status={e.status} />
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
