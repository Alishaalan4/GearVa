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

/** Formats integer cents as USD in the page language (README 5.4). */
export function useMoney(): (cents: number) => string {
  const locale = useLocale();
  return useCallback(
    (cents: number) =>
      new Intl.NumberFormat(locale, { style: 'currency', currency: 'USD' }).format(
        // Intl accepts an exact decimal string (ES2023), so no float is involved.
        centsToDecimal(cents) as Intl.StringNumericLiteral,
      ),
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
