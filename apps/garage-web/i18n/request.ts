import { hasLocale } from 'next-intl';
import { getRequestConfig } from 'next-intl/server';
import { routing } from './routing';

export default getRequestConfig(async ({ requestLocale }) => {
  const requested = await requestLocale;
  const locale = hasLocale(routing.locales, requested) ? requested : routing.defaultLocale;
  return {
    locale,
    messages: (await import(`../messages/${locale}.json`)).default,
    // The default garage time zone (README 5.4). Screens that show garage dates switch to
    // the garage's own time zone when garage settings reach the web app.
    timeZone: 'Asia/Beirut',
  };
});
