'use client';

import type { RevenueReport } from '@gearva/contracts';
import { useFormatter, useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';
import { calendarDate, useMoney } from '@/lib/format';

/** A small chevron; "back" and "forward" follow the reading direction (Arabic flips them). */
export function Chevron({ direction }: { direction: 'back' | 'forward' | 'down' | 'up' }) {
  const rotate = {
    back: 'rotate-180 rtl:rotate-0',
    forward: 'rtl:rotate-180',
    down: 'rotate-90',
    up: '-rotate-90',
  }[direction];
  return (
    <svg viewBox="0 0 16 16" className={`size-4 ${rotate}`} aria-hidden fill="none">
      <path
        d="M6 3.5 10.5 8 6 12.5"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/**
 * By service type (step 7.5, the bars of the design prototype): one hue on a soft track,
 * the bar length is the amount; names and amounts sit in their own aligned columns, in
 * ink (never in the bar's colour). Lines typed by hand, without a service, are "Other".
 */
export function ServiceBars({ rows }: { rows: RevenueReport['byServiceType'] }) {
  const t = useTranslations('revenue');
  const locale = useLocale();
  const money = useMoney({ whole: true });
  const max = Math.max(1, ...rows.map((r) => r.totalCents));
  if (rows.length === 0) return <p className="text-sm text-muted">{t('nothingYet')}</p>;
  return (
    <ul className="space-y-3.5">
      {rows.map((r) => {
        const name = (locale === 'ar' ? r.nameAr : r.nameEn) ?? t('otherService');
        return (
          <li key={r.serviceTypeId ?? 'other'} className="text-sm">
            <div className="flex items-baseline justify-between gap-3">
              <span className="truncate">{name}</span>
              <span className="shrink-0 font-semibold tabular-nums">{money(r.totalCents)}</span>
            </div>
            <div
              className="mt-1.5 h-2 rounded-full bg-soft"
              title={`${name}: ${money(r.totalCents)} · ${t('lines', { count: r.lines })}`}
            >
              <div
                className="h-full rounded-full bg-chart-1"
                style={{ width: `${Math.max(1.5, (r.totalCents / max) * 100)}%` }}
              />
            </div>
          </li>
        );
      })}
    </ul>
  );
}

/**
 * Invoiced and collected per day (a month) or per month (a year): two bars per step on one
 * axis with faint guide lines, the legend in the corner, and a readout of the step under
 * the pointer (or focus). The same numbers are in the table under it.
 */
export function SeriesChart({ report }: { report: RevenueReport }) {
  const t = useTranslations('revenue');
  const format = useFormatter();
  const money = useMoney({ whole: true });
  const [active, setActive] = useState<number | null>(null);
  const series = report.series;
  const yearly = report.period === 'YEAR';
  const max = Math.max(1, ...series.flatMap((s) => [s.invoicedCents, s.collectedCents]));
  const label = (key: string) =>
    key.length === 10
      ? format.dateTime(calendarDate(key), { day: 'numeric', month: 'short', timeZone: 'UTC' })
      : format.dateTime(calendarDate(`${key}-15`), {
          month: 'long',
          year: 'numeric',
          timeZone: 'UTC',
        });
  const tick = (key: string) =>
    key.length === 10
      ? String(Number(key.slice(8, 10)))
      : format.dateTime(calendarDate(`${key}-15`), { month: 'short', timeZone: 'UTC' });
  const showTick = (i: number) => yearly || i === 0 || (i + 1) % 5 === 0 || i === series.length - 1;
  const shown = active === null ? null : series[active];
  const barWidth = yearly ? 'max-w-4' : 'max-w-2';

  return (
    <div className="flex flex-1 flex-col">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-xs">
        <p className="min-h-4 text-muted" aria-live="polite">
          {shown ? (
            <>
              <span className="font-semibold text-ink">{label(shown.key)}</span>
              {' · '}
              {t('invoiced')}{' '}
              <span className="font-semibold text-ink">{money(shown.invoicedCents)}</span>
              {' · '}
              {t('collected')}{' '}
              <span className="font-semibold text-ink">{money(shown.collectedCents)}</span>
            </>
          ) : (
            t('hoverHint')
          )}
        </p>
        <div className="flex items-center gap-4 text-muted">
          <span className="flex items-center gap-1.5">
            <span className="size-2.5 rounded-sm bg-chart-1" aria-hidden />
            {t('invoiced')}
          </span>
          <span className="flex items-center gap-1.5">
            <span className="size-2.5 rounded-sm bg-chart-2" aria-hidden />
            {t('collected')}
          </span>
        </div>
      </div>

      <div className="flex gap-2">
        <div className="flex h-48 flex-col justify-between pb-px text-end text-[10px] text-muted tabular-nums">
          <span>{money(max)}</span>
          <span>{money(Math.round(max / 2))}</span>
          <span>0</span>
        </div>
        <div className="relative min-w-0 flex-1">
          <div className="pointer-events-none absolute inset-x-0 top-1.5 border-t border-dashed border-line" />
          <div
            className="pointer-events-none absolute inset-x-0 border-t border-dashed border-line"
            style={{ top: 'calc(50% + 3px)' }}
          />
          <div
            className="relative flex h-48 items-end gap-0.5 border-b border-line"
            onMouseLeave={() => setActive(null)}
          >
            {series.map((s, i) => (
              <button
                key={s.key}
                type="button"
                className={`flex h-full min-w-0 flex-1 items-end justify-center gap-0.5 rounded-t-md pt-1.5 ${
                  active === i ? 'bg-soft' : ''
                }`}
                aria-label={`${label(s.key)}: ${t('invoiced')} ${money(s.invoicedCents)}, ${t('collected')} ${money(s.collectedCents)}`}
                onMouseEnter={() => setActive(i)}
                onFocus={() => setActive(i)}
                onBlur={() => setActive(null)}
              >
                <span className={`flex h-full w-full ${barWidth} items-end`}>
                  <span
                    className="w-full rounded-t-sm bg-chart-1"
                    style={{ height: `${(s.invoicedCents / max) * 100}%` }}
                  />
                </span>
                <span className={`flex h-full w-full ${barWidth} items-end`}>
                  <span
                    className="w-full rounded-t-sm bg-chart-2"
                    style={{ height: `${(s.collectedCents / max) * 100}%` }}
                  />
                </span>
              </button>
            ))}
          </div>
          <div className="mt-1.5 flex gap-0.5 text-[10px] text-muted" aria-hidden>
            {series.map((s, i) => (
              <span
                key={s.key}
                className="min-w-0 flex-1 overflow-visible text-center whitespace-nowrap"
              >
                {showTick(i) ? tick(s.key) : ''}
              </span>
            ))}
          </div>
        </div>
      </div>

      <details className="mt-4 text-xs">
        <summary className="cursor-pointer text-muted hover:text-ink">{t('showNumbers')}</summary>
        <table className="mt-2 w-full">
          <thead>
            <tr className="border-b border-line text-muted">
              <th className="py-1.5 text-start font-medium">{t('when')}</th>
              <th className="py-1.5 text-end font-medium">{t('invoiced')}</th>
              <th className="py-1.5 text-end font-medium">{t('collected')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {series
              .filter((s) => s.invoicedCents || s.collectedCents)
              .map((s) => (
                <tr key={s.key}>
                  <td className="py-1.5">{label(s.key)}</td>
                  <td className="py-1.5 text-end tabular-nums">{money(s.invoicedCents)}</td>
                  <td className="py-1.5 text-end tabular-nums">{money(s.collectedCents)}</td>
                </tr>
              ))}
          </tbody>
        </table>
      </details>
    </div>
  );
}
