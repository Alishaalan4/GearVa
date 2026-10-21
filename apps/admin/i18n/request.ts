import { hasLocale } from 'next-intl';
import { getRequestConfig } from 'next-intl/server';
import { routing } from './routing';

export default getRequestConfig(async ({ requestLocale }) => {
  const requested = await requestLocale;
  const locale = hasLocale(routing.locales, requested) ? requested : routing.defaultLocale;
  return {
    locale,
    messages: (await import(`../messages/${locale}.json`)).default,
    // Paid-until dates are stored as the end of that day in UTC (flow.md 2.1), so admin
    // screens show dates in UTC to match what the admin entered.
    timeZone: 'UTC',
  };
});
