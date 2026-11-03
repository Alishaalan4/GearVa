'use client';

import type { FinishVisitInput, VisitDetail } from '@gearva/contracts';
import { Alert, Button, Card, Pill, buttonClass } from '@gearva/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useFormatter, useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';
import { ApiErrorAlert } from '@/components/api-error';
import { useStaff } from '@/features/auth/use-staff';
import { FinishStep } from '@/features/invoices/finish-step';
import { InvoiceStatusPill } from '@/features/invoices/invoice-status';
import { ServicePicker, canRecordServices } from '@/features/quick-entry/service-picker';
import { Link } from '@/i18n/navigation';
import { ApiError, api, apiPatch, apiPost } from '@/lib/api';
import { calendarDate, useDistance, useMoney } from '@/lib/format';

/**
 * One visit (flow.md 4.2, 4.4). Open: add another service, wait for parts, finish with
 * "Paid now?". Done: the summary with each service's next due values, and the invoice.
 */
export function VisitPage({ visitId, startFinish }: { visitId: string; startFinish: boolean }) {
  const t = useTranslations('visit');
  const tInvoice = useTranslations('invoice');
  const tCommon = useTranslations('common');
  const tHistory = useTranslations('history');
  const locale = useLocale();
  const format = useFormatter();
  const money = useMoney();
  const distance = useDistance();
  const queryClient = useQueryClient();
  const { data: me } = useStaff();
  const [finishing, setFinishing] = useState(startFinish);

  const visit = useQuery({
    queryKey: ['visit', visitId],
    queryFn: () => api<VisitDetail>(`/v1/visits/${visitId}`),
  });
  const onSaved = (saved: VisitDetail) => {
    queryClient.setQueryData(['visit', visitId], saved);
    void queryClient.invalidateQueries({ queryKey: ['history', saved.vehicle.id] });
    void queryClient.invalidateQueries({ queryKey: ['vehicle', saved.vehicle.id] });
  };
  const finish = useMutation({
    mutationFn: (input: Partial<FinishVisitInput>) =>
      apiPost<VisitDetail>(`/v1/visits/${visitId}/finish`, input),
    onSuccess: onSaved,
  });
  const status = useMutation({
    mutationFn: (next: 'IN_PROGRESS' | 'WAITING_FOR_PARTS') =>
      apiPatch<VisitDetail>(`/v1/visits/${visitId}`, { status: next }),
    onSuccess: onSaved,
  });

  if (visit.isPending) return <p className="text-sm text-muted">{tCommon('loading')}</p>;
  if (visit.error) {
    const missing = visit.error instanceof ApiError && visit.error.status === 404;
    return missing ? <Alert>{t('notFound')}</Alert> : <ApiErrorAlert error={visit.error} />;
  }
  const v = visit.data;
  const unit = v.vehicle.distanceUnit;
  const open = v.finishedAt === null;
  const canEdit = open && canRecordServices(me?.role);

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <Link href={`/vehicles/${v.vehicle.id}`} className="text-sm text-muted hover:text-ink">
        {t('backToCar', { plate: v.vehicle.plate })}
      </Link>
      {finish.isSuccess && !open && <Alert tone="success">{t('saved')}</Alert>}

      <Card>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-extrabold" dir="ltr">
              {v.vehicle.plate}
            </h1>
            <p className="text-sm text-muted">
              {v.customer.name} · {distance(v.odometerKm, unit)} ·{' '}
              {format.dateTime(new Date(v.openedAt), { dateStyle: 'medium', timeStyle: 'short' })}
            </p>
            <p className="text-sm text-muted">
              {tHistory('branch', { code: v.branch.code })} · {v.mechanic.name}
            </p>
          </div>
          <Pill tone={open ? 'brand' : 'ok'}>{tHistory(`status.${v.status}`)}</Pill>
        </div>

        <ul className="mt-4 divide-y divide-line">
          {v.records.map((r) => (
            <li key={r.id} className="py-3">
              <div className="flex flex-wrap justify-between gap-2">
                <span className="font-medium">
                  {r.customName ?? (locale === 'ar' ? r.serviceType.nameAr : r.serviceType.nameEn)}
                  {r.quantity !== '1.00' && (
                    <span className="text-muted" dir="ltr">
                      {' '}
                      × {Number(r.quantity)}
                    </span>
                  )}
                </span>
                <span>{money(r.totalCents)}</span>
              </div>
              {(r.nextDueKm !== null || r.nextDueDate) && (
                <p className="mt-2 rounded-[10px] bg-tint px-3 py-2 text-sm font-semibold">
                  {tHistory('nextDue', {
                    value: [
                      r.nextDueKm !== null ? distance(r.nextDueKm, unit) : null,
                      r.nextDueDate
                        ? format.dateTime(calendarDate(r.nextDueDate), { dateStyle: 'medium' })
                        : null,
                    ]
                      .filter(Boolean)
                      .join(' · '),
                  })}
                </p>
              )}
            </li>
          ))}
        </ul>
        {v.records.length === 0 && <p className="text-sm text-muted">{t('noServices')}</p>}
        <div className="mt-2 flex justify-between border-t border-line pt-3 font-semibold">
          <span>{t('total')}</span>
          <span>{money(v.totalCents)}</span>
        </div>
      </Card>

      {v.invoice && (
        <Card>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="font-bold" dir="ltr">
                {v.invoice.number}
              </p>
              <p className="text-sm text-muted">
                {tInvoice('totalAndRemaining', {
                  total: money(v.invoice.totalCents),
                  remaining: money(v.invoice.remainingCents),
                })}
              </p>
            </div>
            <InvoiceStatusPill status={v.invoice.status} />
          </div>
          <Link href={`/invoices/${v.invoice.id}`} className={`${buttonClass()} mt-3 w-full`}>
            {tInvoice('open')}
          </Link>
        </Card>
      )}

      {canEdit && finishing && (
        <FinishStep
          subtotalCents={v.totalCents}
          vatRatePercent={v.vatRatePercent}
          pending={finish.isPending}
          error={finish.error}
          submitLabel={t('finish')}
          onSubmit={(input) => finish.mutate(input)}
          onBack={() => setFinishing(false)}
        />
      )}
      <ApiErrorAlert error={status.error} />
      {canEdit && !finishing && (
        <>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button
              type="button"
              className="py-3 text-base"
              disabled={v.records.length === 0}
              onClick={() => setFinishing(true)}
            >
              {t('finish')}
            </Button>
            <Button
              type="button"
              variant="secondary"
              disabled={status.isPending}
              onClick={() =>
                status.mutate(
                  v.status === 'WAITING_FOR_PARTS' ? 'IN_PROGRESS' : 'WAITING_FOR_PARTS',
                )
              }
            >
              {v.status === 'WAITING_FOR_PARTS' ? t('partsArrived') : t('waitingForParts')}
            </Button>
          </div>
          <ServicePicker href={(type) => `/visits/${v.id}/add?type=${type.id}`} />
        </>
      )}
    </div>
  );
}
