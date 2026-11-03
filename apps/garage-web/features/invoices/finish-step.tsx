'use client';

import {
  type DiscountType,
  type FinishVisitInput,
  type PaymentMethod,
  invoiceTotals,
} from '@gearva/contracts';
import { Button, Card, Field, Input } from '@gearva/ui';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { ApiErrorAlert } from '@/components/api-error';
import { dollarsToCents, useMoney } from '@/lib/format';
import { DiscountFields, parseDiscount } from './invoice-status';

type PaidNow = 'FULL' | 'PART' | 'LATER';

function Choice({
  selected,
  onClick,
  children,
}: {
  selected: boolean;
  onClick: () => void;
  children: string;
}) {
  return (
    <Button
      type="button"
      variant={selected ? 'primary' : 'secondary'}
      aria-pressed={selected}
      className="flex-1 px-2"
      onClick={onClick}
    >
      {children}
    </Button>
  );
}

/**
 * "Paid now?" (flow.md 7.1): the last step of a visit, and of a reissued invoice. Nothing is
 * chosen at the start, because a payment cannot be changed or deleted once it is saved.
 */
export function FinishStep({
  subtotalCents,
  vatRatePercent,
  pending,
  error,
  submitLabel,
  onSubmit,
  onBack,
}: {
  subtotalCents: number;
  vatRatePercent: string | null;
  pending: boolean;
  error: unknown;
  submitLabel: string;
  onSubmit: (input: Partial<FinishVisitInput>) => void;
  onBack: () => void;
}) {
  const t = useTranslations('invoice');
  const tCommon = useTranslations('common');
  const money = useMoney();
  const [discountOpen, setDiscountOpen] = useState(false);
  const [discountType, setDiscountType] = useState<DiscountType>('AMOUNT');
  const [discountText, setDiscountText] = useState('');
  const [paidNow, setPaidNow] = useState<PaidNow | null>(null);
  const [method, setMethod] = useState<PaymentMethod>('CASH');
  const [partText, setPartText] = useState('');

  const discount = parseDiscount(discountType, discountText);
  const discountInvalid = discount === 'invalid';
  const totals = invoiceTotals({
    lineTotalsCents: [subtotalCents],
    discount: discountInvalid ? null : discount,
    vatRatePercent,
  });
  const free = !discountInvalid && totals.totalCents === 0;
  const partCents = dollarsToCents(partText);
  const partInvalid =
    paidNow === 'PART' && (partCents === null || partCents === 0 || partCents > totals.totalCents);
  const ready = !discountInvalid && !partInvalid && (free || paidNow !== null);

  const payment = () => {
    if (free || paidNow === 'LATER') return undefined;
    return paidNow === 'PART' ? { method, amountCents: partCents ?? 0 } : { method };
  };
  const submit = () =>
    onSubmit({
      discount: discountInvalid ? undefined : (discount ?? undefined),
      confirmFree: free,
      payment: payment(),
    });

  return (
    <Card title={free ? t('freeQuestion') : t('paidNow')}>
      <div className="space-y-4">
        <dl className="space-y-1 text-sm">
          {totals.discountCents + totals.vatCents > 0 && (
            <div className="flex justify-between">
              <dt className="text-muted">{t('subtotal')}</dt>
              <dd>{money(totals.subtotalCents)}</dd>
            </div>
          )}
          {totals.discountCents > 0 && (
            <div className="flex justify-between">
              <dt className="text-muted">{t('discount')}</dt>
              <dd>{money(totals.discountCents)}</dd>
            </div>
          )}
          {totals.vatCents > 0 && (
            <div className="flex justify-between">
              <dt className="text-muted">{t('vat')}</dt>
              <dd>{money(totals.vatCents)}</dd>
            </div>
          )}
          <div className="flex justify-between text-lg font-extrabold">
            <dt>{t('total')}</dt>
            <dd>{money(totals.totalCents)}</dd>
          </div>
        </dl>

        {discountOpen || discountText ? (
          <DiscountFields
            type={discountType}
            text={discountText}
            invalid={discountInvalid}
            onType={setDiscountType}
            onText={setDiscountText}
          />
        ) : (
          subtotalCents > 0 && (
            <button
              type="button"
              className="text-sm font-medium text-soft-ink underline"
              onClick={() => setDiscountOpen(true)}
            >
              {t('addDiscount')}
            </button>
          )
        )}

        {free ? (
          <p className="text-sm text-muted">{t('freeHint')}</p>
        ) : (
          <>
            <div className="flex gap-2">
              <Choice selected={paidNow === 'FULL'} onClick={() => setPaidNow('FULL')}>
                {t('paidFull')}
              </Choice>
              <Choice selected={paidNow === 'PART'} onClick={() => setPaidNow('PART')}>
                {t('paidPart')}
              </Choice>
              <Choice selected={paidNow === 'LATER'} onClick={() => setPaidNow('LATER')}>
                {t('payLater')}
              </Choice>
            </div>
            {paidNow === 'PART' && (
              <Field
                label={t('amount')}
                error={partText && partInvalid ? t('partInvalid') : undefined}
              >
                <Input
                  inputMode="decimal"
                  dir="ltr"
                  aria-invalid={!!partText && partInvalid}
                  value={partText}
                  onChange={(e) => setPartText(e.target.value)}
                />
              </Field>
            )}
            {(paidNow === 'FULL' || paidNow === 'PART') && (
              <div className="flex gap-2">
                <Choice selected={method === 'CASH'} onClick={() => setMethod('CASH')}>
                  {t('method.CASH')}
                </Choice>
                <Choice selected={method === 'WHISH'} onClick={() => setMethod('WHISH')}>
                  {t('method.WHISH')}
                </Choice>
              </div>
            )}
          </>
        )}

        <ApiErrorAlert error={error} />
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button
            type="button"
            className="py-3 text-base"
            disabled={pending || !ready}
            onClick={submit}
          >
            {free ? t('saveFree') : submitLabel}
          </Button>
          <Button type="button" variant="secondary" disabled={pending} onClick={onBack}>
            {tCommon('back')}
          </Button>
        </div>
      </div>
    </Card>
  );
}
