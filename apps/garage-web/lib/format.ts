'use client';

import { type DistanceUnit, centsToDecimal, fromKm } from '@gearva/contracts';
import { useLocale, useTranslations } from 'next-intl';
import { useCallback } from 'react';

// Shared with the admin app (contracts); re-exported so garage-web keeps one import place.
export { centsToDecimal, dollarsToCents } from '@gearva/contracts';

/**
 * Formats integer cents as USD in the page language (README 5.4): "$1,234.50", as on the
 * PDF. The "$" is added by hand, because Arabic currency formatting prints "US$" even with
 * narrowSymbol. In Arabic the amount is isolated left to right, so "$" stays in front.
 * `whole` drops ".00" from a round amount ("$200"), for prices on the website.
 */
export function useMoney({ whole = false }: { whole?: boolean } = {}): (cents: number) => string {
  const locale = useLocale();
  return useCallback(
    (cents: number) => {
      const digits = new Intl.NumberFormat(locale, {
        minimumFractionDigits: whole && cents % 100 === 0 ? 0 : 2,
        maximumFractionDigits: 2,
        // Intl accepts an exact decimal string (ES2023), so no float is involved.
      }).format(centsToDecimal(Math.abs(cents)) as Intl.StringNumericLiteral);
      const amount = `${cents < 0 ? '-' : ''}$${digits}`;
      return locale === 'ar' ? `⁦${amount}⁩` : amount;
    },
    [locale, whole],
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
