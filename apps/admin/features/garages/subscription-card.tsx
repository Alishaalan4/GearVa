'use client';

import {
  type GarageDetail,
  SUBSCRIPTION_PAYMENT_METHODS,
  type SubscriptionPaymentMethod,
  addDays,
  centsToDecimal,
  dollarsToCents,
  extendTrialSchema,
  recordSubscriptionPaymentSchema,
} from '@gearva/contracts';
import { Alert, Button, Card, Field, Input, Select, Textarea } from '@gearva/ui';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { ApiErrorAlert } from '@/components/api-error';
import { Table, Td } from '@/components/table';
import { apiPost } from '@/lib/api';
import { todayUtc, useDates, useMoney } from '@/lib/format';
import { useSystemSettings } from '../settings/use-system-settings';

interface PaymentValues {
  amount: string;
  method: SubscriptionPaymentMethod;
  paidOn: string;
  newExpiryDate: string;
  extraBranches: number;
  note: string;
}

type PaymentField = keyof PaymentValues;

/**
 * flow.md 11.1: the garage's payments, recording a new one, and extending a trial.
 * Every action answers with the updated garage.
 */
export function SubscriptionCard({ garage: g }: { garage: GarageDetail }) {
  const t = useTranslations('subscription');
  const money = useMoney();
  const { day, endDay } = useDates();
  const queryClient = useQueryClient();
  const settings = useSystemSettings();
  const [notice, setNotice] = useState<string | null>(null);

  const saved = (updated: GarageDetail, text: string) => {
    queryClient.setQueryData(['garage', g.id], updated);
    void queryClient.invalidateQueries({ queryKey: ['garages'] });
    void queryClient.invalidateQueries({ queryKey: ['monitoring'] });
    void queryClient.invalidateQueries({ queryKey: ['business'] });
    setNotice(text);
  };

  const extraBranches = Math.max(0, g.branches.filter((b) => b.isActive).length - 1);
  const priceCents = settings.data
    ? settings.data.yearPriceCents + extraBranches * settings.data.extraBranchPriceCents
    : null;

  const payForm = useForm<PaymentValues>({
    values: {
      amount: priceCents === null ? '' : centsToDecimal(priceCents),
      method: 'CASH',
      paidOn: todayUtc(),
      newExpiryDate: g.suggestedExpiry,
      extraBranches,
      note: '',
    },
    resetOptions: { keepDirtyValues: true },
  });
  const pay = useMutation({
    mutationFn: (body: unknown) =>
      apiPost<GarageDetail>(`/admin/v1/garages/${g.id}/payments`, body),
    onMutate: () => setNotice(null),
    onSuccess: (updated) => {
      saved(updated, t('paymentSaved', { date: endDay(updated.expiresAt) }));
      payForm.reset();
    },
  });

  const canExtend = !g.isPaid && g.trialEndsAt !== null;
  const trialEnd = g.trialEndsAt?.slice(0, 10) ?? todayUtc();
  const extendForm = useForm<{ trialEndsOn: string }>({
    values: { trialEndsOn: addDays(trialEnd > todayUtc() ? trialEnd : todayUtc(), 7) },
  });
  const extend = useMutation({
    mutationFn: (body: unknown) =>
      apiPost<GarageDetail>(`/admin/v1/garages/${g.id}/extend-trial`, body),
    onMutate: () => setNotice(null),
    onSuccess: (updated) => saved(updated, t('trialExtended')),
  });

  const payErrors = payForm.formState.errors;
  const submitPayment = payForm.handleSubmit((v) => {
    const amountCents = dollarsToCents(v.amount);
    const parsed = recordSubscriptionPaymentSchema.safeParse({
      amountCents: amountCents === null || amountCents === 0 ? -1 : amountCents,
      method: v.method,
      paidOn: v.paidOn,
      newExpiryDate: v.newExpiryDate,
      extraBranches: Number(v.extraBranches),
      note: v.note,
    });
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        const key = issue.path[0] === 'amountCents' ? 'amount' : (issue.path[0] as PaymentField);
        payForm.setError(key, { type: 'invalid' });
      }
      return;
    }
    pay.mutate(parsed.data);
  });

  const submitExtend = extendForm.handleSubmit((v) => {
    const parsed = extendTrialSchema.safeParse(v);
    if (!parsed.success || v.trialEndsOn <= trialEnd) {
      extendForm.setError('trialEndsOn', { type: 'invalid' });
      return;
    }
    extend.mutate(parsed.data);
  });

  return (
    <Card title={t('title')} className="lg:col-span-2">
      <div className="space-y-6">
        {notice && <Alert tone="success">{notice}</Alert>}

        <Table
          head={[
            t('paidOn'),
            t('amount'),
            t('method'),
            t('period'),
            t('extraBranches'),
            t('recordedBy'),
          ]}
          empty={g.payments.length === 0 && t('noPayments')}
        >
          {g.payments.map((p) => (
            <tr key={p.id}>
              <Td>{day(p.paidOn)}</Td>
              <Td className="font-bold">{money(p.amountCents)}</Td>
              <Td>{t(`methods.${p.method}`)}</Td>
              <Td className="whitespace-nowrap">
                {day(p.periodStart)} – {day(p.newExpiryDate)}
              </Td>
              <Td>{p.extraBranches}</Td>
              <Td className="text-muted">
                {p.recordedBy.name}
                {p.note && <span className="block text-xs">{p.note}</span>}
              </Td>
            </tr>
          ))}
        </Table>

        <div className="grid gap-6 lg:grid-cols-2">
          <form className="space-y-3" noValidate onSubmit={submitPayment}>
            <h3 className="font-bold">{t('recordTitle')}</h3>
            {priceCents !== null && (
              <p className="text-xs text-muted">
                {t('priceHint', {
                  year: money(settings.data?.yearPriceCents ?? 0),
                  branches: extraBranches,
                  branch: money(settings.data?.extraBranchPriceCents ?? 0),
                  total: money(priceCents),
                })}
              </p>
            )}
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label={t('amountUsd')} error={payErrors.amount && t('invalid.amount')}>
                <Input
                  inputMode="decimal"
                  dir="ltr"
                  aria-invalid={!!payErrors.amount}
                  {...payForm.register('amount')}
                />
              </Field>
              <Field label={t('method')}>
                <Select {...payForm.register('method')}>
                  {SUBSCRIPTION_PAYMENT_METHODS.map((m) => (
                    <option key={m} value={m}>
                      {t(`methods.${m}`)}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label={t('paidOn')} error={payErrors.paidOn && t('invalid.paidOn')}>
                <Input
                  type="date"
                  aria-invalid={!!payErrors.paidOn}
                  {...payForm.register('paidOn')}
                />
              </Field>
              <Field
                label={t('newExpiry')}
                hint={t('newExpiryHint')}
                error={payErrors.newExpiryDate && t('invalid.newExpiryDate')}
              >
                <Input
                  type="date"
                  aria-invalid={!!payErrors.newExpiryDate}
                  {...payForm.register('newExpiryDate')}
                />
              </Field>
              <Field
                label={t('extraBranches')}
                error={payErrors.extraBranches && t('invalid.extraBranches')}
              >
                <Input
                  type="number"
                  min={0}
                  max={50}
                  inputMode="numeric"
                  aria-invalid={!!payErrors.extraBranches}
                  {...payForm.register('extraBranches')}
                />
              </Field>
            </div>
            <Field label={t('note')} error={payErrors.note && t('invalid.note')}>
              <Textarea rows={2} {...payForm.register('note')} />
            </Field>
            <ApiErrorAlert error={pay.error} />
            <Button type="submit" disabled={pay.isPending}>
              {t('record')}
            </Button>
          </form>

          {canExtend && (
            <form className="space-y-3" noValidate onSubmit={submitExtend}>
              <h3 className="font-bold">{t('extendTitle')}</h3>
              <p className="text-xs text-muted">{t('extendHint', { date: day(trialEnd) })}</p>
              <Field
                label={t('trialEndsOn')}
                error={extendForm.formState.errors.trialEndsOn && t('invalid.trialEndsOn')}
              >
                <Input
                  type="date"
                  className="w-auto"
                  aria-invalid={!!extendForm.formState.errors.trialEndsOn}
                  {...extendForm.register('trialEndsOn')}
                />
              </Field>
              <ApiErrorAlert error={extend.error} />
              <Button type="submit" variant="secondary" disabled={extend.isPending}>
                {t('extend')}
              </Button>
            </form>
          )}
        </div>
      </div>
    </Card>
  );
}
