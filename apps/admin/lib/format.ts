'use client';

import { centsToDecimal } from '@gearva/contracts';
import { useFormatter, useLocale, useTranslations } from 'next-intl';
import { useCallback } from 'react';

/**
 * Integer cents as USD in the page language: "$1,234.50" (README 5.4). The "$" is added
 * by hand (Arabic currency formatting prints "US$"), and in Arabic the amount is isolated
 * left to right so "$" stays in front. Same rules as garage-web's.
 */
export function useMoney(): (cents: number) => string {
  const locale = useLocale();
  return useCallback(
    (cents: number) => {
      const digits = new Intl.NumberFormat(locale, {
        minimumFractionDigits: cents % 100 === 0 ? 0 : 2,
        maximumFractionDigits: 2,
        // An exact decimal string (ES2023): no float touches the amount.
      }).format(centsToDecimal(Math.abs(cents)) as Intl.StringNumericLiteral);
      const amount = `${cents < 0 ? '-' : ''}$${digits}`;
      return locale === 'ar' ? `⁦${amount}⁩` : amount;
    },
    [locale],
  );
}

/** Dates and times in the page language; empty values as the "none" text. */
export function useDates() {
  const format = useFormatter();
  const tCommon = useTranslations('common');
  const day = (ymd: string) =>
    format.dateTime(new Date(`${ymd}T12:00:00Z`), { dateStyle: 'medium', timeZone: 'UTC' });
  return {
    /** an ISO timestamp, as a date */
    date: (iso: string | null) =>
      iso ? format.dateTime(new Date(iso), { dateStyle: 'medium' }) : tCommon('none'),
    dateTime: (iso: string | null) =>
      iso
        ? format.dateTime(new Date(iso), { dateStyle: 'medium', timeStyle: 'short' })
        : tCommon('none'),
    /** a YYYY-MM-DD calendar day (shown at midday UTC, so it never shifts a day) */
    day,
    /**
     * The last day of a trial or paid period. Access ends at the end of that day in UTC
     * (flow.md 11.1), which is already the next day in Beirut, so it is shown as the UTC day.
     */
    endDay: (iso: string | null) => (iso ? day(iso.slice(0, 10)) : tCommon('none')),
  };
}

/** Today as YYYY-MM-DD (UTC), the day the API's date rules use. */
export function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}
