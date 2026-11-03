'use client';

import {
  type FinishVisitInput,
  type InvoiceDetail,
  type VisitDetail,
  localDate,
} from '@gearva/contracts';
import { Alert, Button, Card } from '@gearva/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useFormatter, useTranslations } from 'next-intl';
import { useState } from 'react';
import { ApiErrorAlert } from '@/components/api-error';
import { useStaff } from '@/features/auth/use-staff';
import { Link, useRouter } from '@/i18n/navigation';
import { ApiError, api, apiFile, apiPost } from '@/lib/api';
import { calendarDate, useDistance, useMoney } from '@/lib/format';
import { FinishStep } from './finish-step';
import { CancelForm, EditForm, PaymentForm } from './invoice-forms';
import { InvoiceStatusPill, useLineName } from './invoice-status';

type Panel = 'payment' | 'edit' | 'cancel' | 'reissue' | null;

/** One row of the totals. */
function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className={`flex justify-between ${strong ? 'text-lg font-extrabold' : 'text-sm'}`}>
      <span className={strong ? '' : 'text-muted'}>{label}</span>
      <span>{value}</span>
    </div>
  );
}

/** The PDF in a new tab, to print or save. A blob, so an expired session refreshes first. */
function usePdf(invoiceId: string) {
  return useMutation({
    mutationFn: async () => {
      // Opened before the wait: browsers block a tab opened later.
      const tab = window.open('', '_blank');
      try {
        const url = URL.createObjectURL(await apiFile(`/v1/invoices/${invoiceId}/pdf`));
        if (tab) tab.location.href = url;
        else window.location.href = url;
      } catch (error) {
        tab?.close();
        throw error;
      }
    },
  });
}

/** One invoice (flow.md 7): what was charged, what was paid, and what the role may do next. */
export function InvoicePage({ invoiceId }: { invoiceId: string }) {
  const t = useTranslations('invoice');
  const tCommon = useTranslations('common');
  const format = useFormatter();
  const money = useMoney();
  const distance = useDistance();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { data: me } = useStaff();
  const [panel, setPanel] = useState<Panel>(null);
  const pdf = usePdf(invoiceId);
  const lineName = useLineName();

  const invoice = useQuery({
    queryKey: ['invoice', invoiceId],
    queryFn: () => api<InvoiceDetail>(`/v1/invoices/${invoiceId}`),
  });
  const visitId = invoice.data?.visitId;
  const visit = useQuery({
    queryKey: ['visit', visitId],
    queryFn: () => api<VisitDetail>(`/v1/visits/${visitId}`),
    enabled: !!visitId,
  });

  const onSaved = (saved: InvoiceDetail) => {
    queryClient.setQueryData(['invoice', saved.id], saved);
    void queryClient.invalidateQueries({ queryKey: ['visit', saved.visitId] });
    setPanel(null);
  };
  const reissue = useMutation({
    mutationFn: (input: Partial<FinishVisitInput>) =>
      apiPost<InvoiceDetail>(`/v1/invoices/${invoiceId}/reissue`, input),
    onSuccess: (saved) => {
      onSaved(saved);
      router.push(`/invoices/${saved.id}`);
    },
  });

  if (invoice.isPending) return <p className="text-sm text-muted">{tCommon('loading')}</p>;
  if (invoice.error) {
    const missing = invoice.error instanceof ApiError && invoice.error.status === 404;
    return missing ? <Alert>{t('notFound')}</Alert> : <ApiErrorAlert error={invoice.error} />;
  }
  const inv = invoice.data;
  const role = me?.role;
  const cancelled = inv.status === 'CANCELLED';
  const manages = role === 'OWNER' || role === 'MANAGER';
  const latest = visit.data?.invoice;
  const replacement = cancelled && latest && latest.id !== inv.id ? latest : null;

  const sameDay =
    !!me &&
    localDate(new Date(inv.issuedAt), me.garage.timezone) ===
      localDate(new Date(), me.garage.timezone);
  // The API has the final word (flow.md 7.5); this hides what it would refuse.
  const canEdit =
    !cancelled &&
    (role === 'OWNER' ||
      (role === 'MANAGER' && sameDay) ||
      (role === 'MECHANIC' && sameDay && visit.data?.mechanic.id === me?.id));
  const canPay = !cancelled && inv.remainingCents > 0 && role !== undefined && role !== 'MECHANIC';
  const canReissue = cancelled && manages && latest?.id === inv.id;

  const nextService = [
    inv.nextServiceKm !== null ? distance(inv.nextServiceKm, inv.vehicle.distanceUnit) : null,
    inv.nextServiceDate
      ? format.dateTime(calendarDate(inv.nextServiceDate), { dateStyle: 'medium' })
      : null,
  ].filter(Boolean);

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <Link href={`/visits/${inv.visitId}`} className="text-sm text-muted hover:text-ink">
        {t('backToVisit')}
      </Link>

      {cancelled && (
        <Alert>
          {t('cancelledBecause', { reason: inv.cancelReason ?? '' })}
          {inv.paidCents > 0 && (
            <span className="block">{t('refundNeeded', { amount: money(inv.paidCents) })}</span>
          )}
        </Alert>
      )}
      {replacement && (
        <Link
          href={`/invoices/${replacement.id}`}
          className="block text-sm font-semibold underline"
        >
          {t('replacedBy', { number: replacement.number })}
        </Link>
      )}

      <Card>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-extrabold" dir="ltr">
              {inv.number}
            </h1>
            <p className="text-sm text-muted">
              {format.dateTime(new Date(inv.issuedAt), { dateStyle: 'medium', timeStyle: 'short' })}
            </p>
          </div>
          <InvoiceStatusPill status={inv.status} />
        </div>

        <div className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
          <div>
            <p className="font-semibold">{inv.customer.name}</p>
            <p className="text-muted" dir="ltr">
              {inv.customer.phone}
            </p>
          </div>
          <div>
            <p className="font-semibold" dir="ltr">
              {inv.vehicle.plate}
            </p>
            <p className="text-muted">
              {inv.vehicle.make} {inv.vehicle.model} ·{' '}
              {distance(inv.vehicle.odometerKm, inv.vehicle.distanceUnit)}
            </p>
          </div>
        </div>

        <ul className="mt-4 divide-y divide-line">
          {inv.items.map((item) => (
            <li key={item.id} className="flex flex-wrap justify-between gap-2 py-3">
              <span className="font-medium">
                {lineName(item)}
                {item.quantity !== '1.00' && (
                  <span className="text-muted" dir="ltr">
                    {' '}
                    × {Number(item.quantity)}
                  </span>
                )}
                {(item.brand || item.grade) && (
                  <span className="block text-xs font-normal text-muted">
                    {[item.brand, item.grade].filter(Boolean).join(' · ')}
                  </span>
                )}
              </span>
              <span>{money(item.totalCents)}</span>
            </li>
          ))}
        </ul>

        <div className="mt-2 space-y-1 border-t border-line pt-3">
          {inv.discountCents + inv.vatCents > 0 && (
            <Row label={t('subtotal')} value={money(inv.subtotalCents)} />
          )}
          {inv.discountCents > 0 && <Row label={t('discount')} value={money(inv.discountCents)} />}
          {inv.vatCents > 0 && <Row label={t('vat')} value={money(inv.vatCents)} />}
          <Row label={t('total')} value={money(inv.totalCents)} strong />
          {inv.paidCents > 0 && <Row label={t('paid')} value={money(inv.paidCents)} />}
          {inv.remainingCents > 0 && !cancelled && (
            <Row label={t('remaining')} value={money(inv.remainingCents)} />
          )}
        </div>

        {nextService.length > 0 && (
          <p className="mt-3 rounded-[10px] bg-tint px-3 py-2 text-sm font-semibold">
            {t('nextService', { value: nextService.join(' · ') })}
          </p>
        )}
      </Card>

      {inv.payments.length > 0 && (
        <Card title={t('payments')}>
          <ul className="divide-y divide-line">
            {inv.payments.map((p) => (
              <li key={p.id} className="py-2 text-sm">
                <div className="flex justify-between gap-2">
                  <span className="font-medium">{t(`method.${p.method}`)}</span>
                  <span>{money(p.amountCents)}</span>
                </div>
                <p className="text-xs text-muted">
                  {format.dateTime(new Date(p.paidAt), { dateStyle: 'medium' })} ·{' '}
                  {p.receivedBy.name}
                </p>
                {p.note && <p className="text-xs text-muted">{p.note}</p>}
              </li>
            ))}
          </ul>
        </Card>
      )}

      {panel === 'payment' && (
        <PaymentForm invoice={inv} onSaved={onSaved} onClose={() => setPanel(null)} />
      )}
      {panel === 'edit' && (
        <EditForm invoice={inv} onSaved={onSaved} onClose={() => setPanel(null)} />
      )}
      {panel === 'cancel' && (
        <CancelForm invoice={inv} onSaved={onSaved} onClose={() => setPanel(null)} />
      )}
      {panel === 'reissue' && visit.data && (
        <FinishStep
          subtotalCents={visit.data.totalCents}
          vatRatePercent={visit.data.vatRatePercent}
          pending={reissue.isPending}
          error={reissue.error}
          submitLabel={t('issueNew')}
          onSubmit={(input) => reissue.mutate(input)}
          onBack={() => setPanel(null)}
        />
      )}

      {panel === null && (
        <>
          <ApiErrorAlert error={pdf.error} />
          <div className="flex flex-wrap gap-2">
            <Button type="button" disabled={pdf.isPending} onClick={() => pdf.mutate()}>
              {t('printPdf')}
            </Button>
            {canPay && (
              <Button type="button" variant="secondary" onClick={() => setPanel('payment')}>
                {t('addPayment')}
              </Button>
            )}
            {canEdit && (
              <Button type="button" variant="secondary" onClick={() => setPanel('edit')}>
                {tCommon('edit')}
              </Button>
            )}
            {canReissue && (
              <Button type="button" onClick={() => setPanel('reissue')}>
                {t('issueNew')}
              </Button>
            )}
            {manages && !cancelled && (
              <Button type="button" variant="danger" onClick={() => setPanel('cancel')}>
                {t('cancelInvoice')}
              </Button>
            )}
          </div>
        </>
      )}
    </div>
  );
}
