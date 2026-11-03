'use client';

import { type DistanceUnit, fromKm } from '@gearva/contracts';
import { useLocale, useTranslations } from 'next-intl';
import { useCallback } from 'react';

/** "4950" cents -> "49.50", as exact decimal text: money never goes through a float. */
export function centsToDecimal(cents: number): string {
  const sign = cents < 0 ? '-' : '';
  const abs = Math.abs(cents);
  return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, '0')}`;
}

/**
 * Formats integer cents as USD in the page language (README 5.4): "$1,234.50", as on the
 * PDF. The "$" is added by hand, because Arabic currency formatting prints "US$" even with
 * narrowSymbol. In Arabic the amount is isolated left to right, so "$" stays in front.
 */
export function useMoney(): (cents: number) => string {
  const locale = useLocale();
  return useCallback(
    (cents: number) => {
      const digits = new Intl.NumberFormat(locale, {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
        // Intl accepts an exact decimal string (ES2023), so no float is involved.
      }).format(centsToDecimal(Math.abs(cents)) as Intl.StringNumericLiteral);
      const amount = `${cents < 0 ? '-' : ''}$${digits}`;
      return locale === 'ar' ? `⁦${amount}⁩` : amount;
    },
    [locale],
  );
}

/** Stored km shown in the car's unit: "85,500 km" or "53,127 mi" (README 5.4). */
export function useDistance(): (km: number, unit: DistanceUnit) => string {
  const locale = useLocale();
  const t = useTranslations('units');
  return useCallback(
    (km: number, unit: DistanceUnit) =>
      `${new Intl.NumberFormat(locale).format(fromKm(km, unit))} ${t(unit)}`,
    [locale, t],
  );
}

/** A YYYY-MM-DD calendar date as a Date safe to format in any time zone (midday UTC). */
export function calendarDate(date: string): Date {
  return new Date(`${date}T12:00:00Z`);
}

/**
 * Dollars typed by staff ("45", "45.5", "45.50") as integer cents, without a float:
 * the digits are read as text. Empty = 0 (a service may be free, flow.md 13); anything
 * else that is not an amount = null.
 */
export function dollarsToCents(text: string): number | null {
  const value = text.trim().replace(',', '.');
  if (value === '') return 0;
  const match = /^(\d{1,7})(?:\.(\d{1,2}))?$/.exec(value);
  if (!match) return null;
  return Number(match[1]) * 100 + Number((match[2] ?? '').padEnd(2, '0'));
}
