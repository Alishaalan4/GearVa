'use client';

import {
  type DiscountType,
  type EditInvoiceInput,
  type InvoiceDetail,
  type PaymentMethod,
  PAYMENT_METHODS,
  cancelInvoiceSchema,
} from '@gearva/contracts';
import { Alert, Button, Card, Field, Input, Select, Textarea } from '@gearva/ui';
import { useMutation } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { ApiErrorAlert } from '@/components/api-error';
import { ApiError, apiPatch, apiPost } from '@/lib/api';
import { centsToDecimal, dollarsToCents } from '@/lib/format';
import { DiscountFields, parseDiscount } from './invoice-status';

interface FormProps {
  invoice: InvoiceDetail;
  onSaved: (saved: InvoiceDetail) => void;
  onClose: () => void;
}

/** flow.md 8.1: a payment after the visit. The amount starts at everything still owed. */
export function PaymentForm({ invoice, onSaved, onClose }: FormProps) {
  const t = useTranslations('invoice');
  const tCommon = useTranslations('common');
  const [amount, setAmount] = useState(centsToDecimal(invoice.remainingCents));
  const [method, setMethod] = useState<PaymentMethod>('CASH');
  const [date, setDate] = useState('');
  const [note, setNote] = useState('');
  const save = useMutation({
    mutationFn: (amountCents: number) =>
      apiPost<InvoiceDetail>(`/v1/invoices/${invoice.id}/payments`, {
        amountCents,
        method,
        date: date || undefined,
        note: note.trim() || undefined,
      }),
    onSuccess: onSaved,
  });
  const cents = dollarsToCents(amount);
  const invalid = cents === null || cents === 0 || cents > invoice.remainingCents;

  return (
    <Card title={t('addPayment')}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t('amount')} error={amount && invalid ? t('partInvalid') : undefined}>
          <Input
            inputMode="decimal"
            dir="ltr"
            aria-invalid={!!amount && invalid}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
        </Field>
        <Field label={t('paymentMethod')}>
          <Select value={method} onChange={(e) => setMethod(e.target.value as PaymentMethod)}>
            {PAYMENT_METHODS.map((m) => (
              <option key={m} value={m}>
                {t(`method.${m}`)}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={t('paymentDate')} hint={t('paymentDateHint')}>
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <Field label={t('paymentNote')}>
          <Input maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
      </div>
      <p className="mt-3 text-xs text-muted">{t('paymentFinal')}</p>
      <div className="mt-3 space-y-3">
        <ApiErrorAlert error={save.error} />
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            disabled={save.isPending || invalid}
            onClick={() => cents !== null && save.mutate(cents)}
          >
            {t('savePayment')}
          </Button>
          <Button type="button" variant="secondary" onClick={onClose}>
            {tCommon('cancel')}
          </Button>
        </div>
      </div>
    </Card>
  );
}

/** flow.md 7.5: the invoice stays, with its number, and needs a reason. */
export function CancelForm({ invoice, onSaved, onClose }: FormProps) {
  const t = useTranslations('invoice');
  const tCommon = useTranslations('common');
  const [reason, setReason] = useState('');
  const save = useMutation({
    mutationFn: () => apiPost<InvoiceDetail>(`/v1/invoices/${invoice.id}/cancel`, { reason }),
    onSuccess: onSaved,
  });
  const valid = cancelInvoiceSchema.safeParse({ reason }).success;

  return (
    <Card title={t('cancelTitle', { number: invoice.number })}>
      <Field label={t('cancelReason')} hint={t('cancelHint')}>
        <Textarea
          rows={2}
          maxLength={500}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
      </Field>
      <div className="mt-3 space-y-3">
        <ApiErrorAlert error={save.error} />
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="danger"
            disabled={save.isPending || !valid}
            onClick={() => save.mutate()}
          >
            {t('cancelInvoice')}
          </Button>
          <Button type="button" variant="secondary" onClick={onClose}>
            {tCommon('back')}
          </Button>
        </div>
      </div>
    </Card>
  );
}

/** flow.md 7.5: quantities, prices and the discount. Adding a line is cancel and reissue. */
export function EditForm({ invoice, onSaved, onClose }: FormProps) {
  const t = useTranslations('invoice');
  const tCommon = useTranslations('common');
  const [lines, setLines] = useState(
    invoice.items.map((item) => ({
      id: item.id,
      description: item.description,
      quantity: String(Number(item.quantity)),
      price: centsToDecimal(item.unitPriceCents),
    })),
  );
  const [discountType, setDiscountType] = useState<DiscountType>(invoice.discountType ?? 'AMOUNT');
  const [discountText, setDiscountText] = useState(
    invoice.discountValue === null
      ? ''
      : invoice.discountType === 'PERCENT'
        ? String(invoice.discountValue)
        : centsToDecimal(invoice.discountValue),
  );
  const save = useMutation({
    mutationFn: (body: Partial<EditInvoiceInput>) =>
      apiPatch<InvoiceDetail>(`/v1/invoices/${invoice.id}`, body),
    onSuccess: onSaved,
  });

  const discount = parseDiscount(discountType, discountText);
  const prices = lines.map((line) => dollarsToCents(line.price));
  const quantityValid = (q: string) => /^\d+(\.\d{1,2})?$/.test(q.trim()) && Number(q) > 0;
  const valid =
    discount !== 'invalid' &&
    prices.every((p) => p !== null) &&
    lines.every((line) => quantityValid(line.quantity));

  const update = (id: string, change: { quantity?: string; price?: string }) =>
    setLines((all) => all.map((line) => (line.id === id ? { ...line, ...change } : line)));
  const submit = (confirmFree: boolean) => {
    if (discount === 'invalid') return;
    save.mutate({
      items: lines.map((line, i) => ({
        id: line.id,
        quantity: line.quantity.trim(),
        unitPriceCents: prices[i] ?? 0,
      })),
      discount,
      confirmFree,
    });
  };
  const askFree = save.error instanceof ApiError && save.error.code === 'INVOICE_TOTAL_ZERO';

  return (
    <Card title={t('editTitle')}>
      <div className="space-y-4">
        {lines.map((line, i) => (
          <div key={line.id} className="grid grid-cols-2 gap-3">
            <p className="col-span-2 font-medium">{line.description}</p>
            <Field label={t('quantity')}>
              <Input
                inputMode="decimal"
                dir="ltr"
                aria-invalid={!quantityValid(line.quantity)}
                value={line.quantity}
                onChange={(e) => update(line.id, { quantity: e.target.value })}
              />
            </Field>
            <Field label={t('unitPrice')}>
              <Input
                inputMode="decimal"
                dir="ltr"
                aria-invalid={prices[i] === null}
                value={line.price}
                onChange={(e) => update(line.id, { price: e.target.value })}
              />
            </Field>
          </div>
        ))}
        <DiscountFields
          type={discountType}
          text={discountText}
          invalid={discount === 'invalid'}
          onType={setDiscountType}
          onText={setDiscountText}
        />
        {askFree ? (
          <Alert>
            <p className="font-medium">{t('freeQuestion')}</p>
            <div className="mt-3">
              <Button type="button" disabled={save.isPending} onClick={() => submit(true)}>
                {t('saveFree')}
              </Button>
            </div>
          </Alert>
        ) : (
          <ApiErrorAlert error={save.error} />
        )}
        <div className="flex flex-wrap gap-2">
          <Button type="button" disabled={save.isPending || !valid} onClick={() => submit(false)}>
            {tCommon('save')}
          </Button>
          <Button type="button" variant="secondary" onClick={onClose}>
            {tCommon('cancel')}
          </Button>
        </div>
      </div>
    </Card>
  );
}
