'use client';

import { type Discount, type DiscountType, type InvoiceStatus } from '@gearva/contracts';
import { Input, Pill, Select } from '@gearva/ui';
import { useTranslations } from 'next-intl';
import { dollarsToCents } from '@/lib/format';

const STATUS_TONES = {
  UNPAID: 'bad',
  PARTIALLY_PAID: 'brand',
  PAID: 'ok',
  CANCELLED: 'soft',
} as const;

export function InvoiceStatusPill({ status }: { status: InvoiceStatus }) {
  const t = useTranslations('invoice.status');
  return <Pill tone={STATUS_TONES[status]}>{t(status)}</Pill>;
}

/** Typed discount text for the API: null = none, 'invalid' = not an amount or a percent. */
export function parseDiscount(type: DiscountType, text: string): Discount | null | 'invalid' {
  if (text.trim() === '') return null;
  if (type === 'PERCENT') {
    if (!/^\d{1,3}$/.test(text.trim()) || Number(text) > 100) return 'invalid';
    return { type, value: Number(text) };
  }
  const value = dollarsToCents(text);
  return value === null ? 'invalid' : { type, value };
}

/** A discount: an amount in dollars or a whole percent (flow.md 7.4). */
export function DiscountFields({
  type,
  text,
  invalid,
  onType,
  onText,
}: {
  type: DiscountType;
  text: string;
  invalid: boolean;
  onType: (type: DiscountType) => void;
  onText: (text: string) => void;
}) {
  const t = useTranslations('invoice');
  return (
    <div className="grid grid-cols-2 gap-3">
      <Select
        aria-label={t('discountType')}
        value={type}
        onChange={(e) => onType(e.target.value as DiscountType)}
      >
        <option value="AMOUNT">{t('discountAmount')}</option>
        <option value="PERCENT">{t('discountPercent')}</option>
      </Select>
      <Input
        aria-label={t('discount')}
        aria-invalid={invalid}
        inputMode="decimal"
        dir="ltr"
        value={text}
        onChange={(e) => onText(e.target.value)}
      />
    </div>
  );
}
