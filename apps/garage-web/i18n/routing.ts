import { defineRouting } from 'next-intl/routing';

export const routing = defineRouting({
  locales: ['en', 'ar'],
  defaultLocale: 'en',
  // English is the default (user decision 2026-10-21) and the browser's language is
  // ignored. A person's own choice is remembered with LOCALE_COOKIE instead (proxy.ts).
  localeDetection: false,
  localeCookie: false,
});

/** Set by the language switch; makes links without /en or /ar open in that language. */
export const LOCALE_COOKIE = 'gv_locale';
