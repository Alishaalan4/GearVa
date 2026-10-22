'use client';

import { useLocale, useTranslations } from 'next-intl';
import { usePathname, useRouter } from '@/i18n/navigation';
import { LOCALE_COOKIE } from '@/i18n/routing';

const ONE_YEAR_SECONDS = 365 * 24 * 60 * 60;

/** Switches between English and Arabic on the same page and remembers the choice. */
export function LanguageToggle() {
  const t = useTranslations('nav');
  const locale = useLocale();
  const pathname = usePathname();
  const router = useRouter();
  return (
    <button
      type="button"
      className="text-sm text-slate-700 hover:text-slate-900"
      onClick={() => {
        const next = locale === 'ar' ? 'en' : 'ar';
        // Read by proxy.ts, so links without /en or /ar (emails, bookmarks) open in it.
        document.cookie = `${LOCALE_COOKIE}=${next}; path=/; max-age=${ONE_YEAR_SECONDS}; samesite=lax`;
        router.replace(pathname, { locale: next });
      }}
    >
      {t('switchLanguage')}
    </button>
  );
}
